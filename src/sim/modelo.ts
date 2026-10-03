import type { Punto } from '../core/camara';
import type { Bloque, Cuerda, Elemento, Esfera, Polea, Resorte, Superficie, Vector } from '../core/elementos';
import { distanciaAlCuerpo, G_POR_DEFECTO, TOLERANCIA_CONTACTO } from '../physics/dcl';
import { normalSuperficie } from '../physics/objetos';
import { modulo } from '../physics/vectores';

/**
 * Modelo dinámico de la escena para la simulación: partículas (los bloques y esferas) sometidas a
 * gravedad, fuerzas aplicadas, resortes, cuerdas (con o sin polea) y superficies con roce.
 * Es una descripción inmutable; el estado que cambia en el tiempo vive en `motor.ts`.
 *
 * Simplificaciones, todas deliberadas y documentadas en docs/SIMULACION.md: los cuerpos son
 * puntos con orientación fija (no giran), las poleas son ideales y se tratan como puntos
 * (se ignora su radio) y los cuerpos no chocan entre sí.
 */

export type Cuerpo = Bloque | Esfera;

/** Extremo de una cuerda o un resorte: atado a un cuerpo (en un punto fijo respecto de su centro) o fijo en el espacio. */
export type Extremo = { tipo: 'cuerpo'; i: number; desp: Punto } | { tipo: 'fijo'; p: Punto };

export interface CuerpoDef {
  id: string;
  elemento: Cuerpo;
  masa: number;
  p0: Punto;
  v0: Punto;
}

export interface SuperficieDef {
  id: string;
  a: Punto;
  /** Tangente unitaria (a → b) y normal unitaria (a su izquierda). */
  t: Punto;
  n: Punto;
  largo: number;
  muS: number;
  muK: number;
}

export interface ResorteDef {
  id: string;
  k: number;
  largoNatural: number;
  ext: [Extremo, Extremo];
}

export interface CuerdaDef {
  /** Ids de los elementos cuerda que la forman (uno, o dos si pasa por una polea). */
  ids: string[];
  ext: [Extremo, Extremo];
  /**
   * Si la cuerda pasa por una polea: el punto donde cada tramo toca la polea (el extremo de cada cuerda dibujada).
   * El largo es la suma de las dos distancias, así que un tramo dibujado vertical tira siempre en vertical.
   */
  polea: [Punto, Punto] | null;
  largo: number;
  /** Con polea: cuál extremo (a o b) de cada cuerda dibujada es el que se mueve con el cuerpo. */
  partes?: [{ id: string; lejano: 'a' | 'b' }, { id: string; lejano: 'a' | 'b' }];
}

export interface FuerzaDef {
  /** Id del vector que la representa. */
  id: string;
  cuerpo: number;
  F: Punto;
}

export interface Modelo {
  g: number;
  cuerpos: CuerpoDef[];
  superficies: SuperficieDef[];
  resortes: ResorteDef[];
  cuerdas: CuerdaDef[];
  fuerzas: FuerzaDef[];
  avisos: string[];
}

/** Posición de un extremo dadas las posiciones de los cuerpos. */
export function posExtremo(e: Extremo, p: readonly Punto[]): Punto {
  if (e.tipo === 'fijo') return e.p;
  const c = p[e.i]!;
  return { x: c.x + e.desp.x, y: c.y + e.desp.y };
}

const dist = (a: Punto, b: Punto): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Construye el modelo dinámico de la escena. */
export function construirModelo(elementos: readonly Elemento[], g = G_POR_DEFECTO): Modelo {
  const avisos: string[] = [];
  const cuerpos: CuerpoDef[] = elementos
    .filter((e): e is Cuerpo => e.tipo === 'bloque' || e.tipo === 'esfera')
    .map((e) => ({ id: e.id, elemento: e, masa: e.masa, p0: { ...e.centro }, v0: e.v0 ? { ...e.v0 } : { x: 0, y: 0 } }));
  if (cuerpos.length === 0) avisos.push('No hay cuerpos (bloques o esferas) para simular.');

  const superficies: SuperficieDef[] = elementos
    .filter((e): e is Superficie => e.tipo === 'superficie')
    .map((s) => {
      const largo = dist(s.a, s.b) || 1e-9;
      return { id: s.id, a: s.a, t: { x: (s.b.x - s.a.x) / largo, y: (s.b.y - s.a.y) / largo }, n: normalSuperficie(s), largo, muS: s.muS, muK: s.muK };
    });

  const extremo = (p: Punto): Extremo => {
    let mejor = -1;
    let dMejor = Infinity;
    cuerpos.forEach((c, i) => {
      const d = distanciaAlCuerpo(c.elemento, p);
      if (d < dMejor) {
        dMejor = d;
        mejor = i;
      }
    });
    if (mejor >= 0 && dMejor <= TOLERANCIA_CONTACTO) {
      const c = cuerpos[mejor]!;
      return { tipo: 'cuerpo', i: mejor, desp: { x: p.x - c.p0.x, y: p.y - c.p0.y } };
    }
    return { tipo: 'fijo', p: { ...p } };
  };
  const mismo = (a: Extremo, b: Extremo): boolean => (a.tipo === 'cuerpo' && b.tipo === 'cuerpo' && a.i === b.i) || (a.tipo === 'fijo' && b.tipo === 'fijo');

  const resortes: ResorteDef[] = [];
  for (const r of elementos.filter((e): e is Resorte => e.tipo === 'resorte')) {
    const ext: [Extremo, Extremo] = [extremo(r.a), extremo(r.b)];
    if (mismo(ext[0], ext[1])) {
      avisos.push('Un resorte no está atado a ningún cuerpo (o ata un cuerpo consigo mismo): se ignora.');
      continue;
    }
    resortes.push({ id: r.id, k: r.k, largoNatural: r.largoNatural, ext });
  }

  // Cuerdas: dos que tocan la misma polea forman una sola cuerda que pasa por ella.
  const cuerdas: CuerdaDef[] = [];
  const todasCuerdas = elementos.filter((e): e is Cuerda => e.tipo === 'cuerda');
  const usadas = new Set<string>();
  const posInicial = cuerpos.map((c) => c.p0);
  for (const pol of elementos.filter((e): e is Polea => e.tipo === 'polea')) {
    const tocan = todasCuerdas
      .filter((c) => !usadas.has(c.id))
      .map((c) => {
        const da = dist(c.a, pol.centro);
        const db = dist(c.b, pol.centro);
        const radioToque = pol.radio + 0.14;
        if (da <= radioToque && da <= db) return { c, lejano: c.b, cercano: c.a };
        if (db <= radioToque) return { c, lejano: c.a, cercano: c.b };
        return null;
      })
      .filter((x): x is { c: Cuerda; lejano: Punto; cercano: Punto } => x !== null);
    if (tocan.length !== 2) continue;
    const [u, v] = tocan as [{ c: Cuerda; lejano: Punto; cercano: Punto }, { c: Cuerda; lejano: Punto; cercano: Punto }];
    const ext: [Extremo, Extremo] = [extremo(u.lejano), extremo(v.lejano)];
    if (mismo(ext[0], ext[1])) {
      avisos.push('Las dos cuerdas de una polea terminan en el mismo cuerpo o ambas en puntos fijos: se ignoran.');
    } else {
      cuerdas.push({
        ids: [u.c.id, v.c.id],
        ext,
        polea: [{ ...u.cercano }, { ...v.cercano }],
        partes: [
          { id: u.c.id, lejano: u.lejano === u.c.b ? 'b' : 'a' },
          { id: v.c.id, lejano: v.lejano === v.c.b ? 'b' : 'a' },
        ],
        largo: dist(posExtremo(ext[0], posInicial), u.cercano) + dist(posExtremo(ext[1], posInicial), v.cercano),
      });
    }
    usadas.add(u.c.id);
    usadas.add(v.c.id);
  }
  for (const c of todasCuerdas) {
    if (usadas.has(c.id)) continue;
    const ext: [Extremo, Extremo] = [extremo(c.a), extremo(c.b)];
    if (mismo(ext[0], ext[1])) {
      avisos.push('Una cuerda no está atada a ningún cuerpo (o ata un cuerpo consigo mismo): se ignora.');
      continue;
    }
    cuerdas.push({ ids: [c.id], ext, polea: null, largo: dist(posExtremo(ext[0], posInicial), posExtremo(ext[1], posInicial)) });
  }

  // Fuerzas aplicadas: vectores `aplicada` con origen en un cuerpo (constantes, con la dirección dibujada).
  const fuerzas: FuerzaDef[] = [];
  for (const v of elementos.filter((e): e is Vector => e.tipo === 'vector')) {
    if (v.fantasma || v.rol !== 'aplicada') continue;
    const dx = v.b.x - v.a.x;
    const dy = v.b.y - v.a.y;
    const l = Math.hypot(dx, dy);
    if (l < 1e-9) continue;
    const i = cuerpos.findIndex((c) => distanciaAlCuerpo(c.elemento, v.a) <= TOLERANCIA_CONTACTO + 0.06);
    if (i < 0) continue;
    const F = modulo(v);
    fuerzas.push({ id: v.id, cuerpo: i, F: { x: (dx / l) * F, y: (dy / l) * F } });
  }

  for (const c of cuerpos) if (!(c.masa > 0)) avisos.push(`El cuerpo ${c.id} no tiene masa positiva.`);
  return { g, cuerpos, superficies, resortes, cuerdas, fuerzas, avisos };
}
