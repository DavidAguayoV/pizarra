import type { Punto } from '../core/camara';
import type { Bloque, Elemento, Esfera } from '../core/elementos';
import type { ExtremoG } from '../grafo/lector';
import { leerGrafo } from '../grafo/lector';
import type { PasoGeo } from '../grafo/ruta';
import { anguloMedio, geometriaRuta, largosPorPieza } from '../grafo/ruta';
import { G_POR_DEFECTO } from '../physics/dcl';
import { normalSuperficie } from '../physics/objetos';
import { modulo } from '../physics/vectores';

/**
 * Modelo dinámico de la escena para la simulación: partículas (los bloques y esferas) sometidas a
 * gravedad, fuerzas aplicadas, resortes, cuerdas (con o sin polea) y superficies con roce.
 * Es una descripción inmutable; el estado que cambia en el tiempo vive en `motor.ts`.
 *
 * Las relaciones (qué cuerda ata a qué cuerpo, por qué poleas pasa, dónde se apoya cada cuerpo) se leen del
 * grafo explícito de la escena; ya no se deducen por cercanía (docs/decisiones/0008-modelo-de-grafo.md).
 *
 * Simplificaciones, todas deliberadas y documentadas en docs/SIMULACION.md: los cuerpos son
 * puntos con orientación fija (no giran), las poleas son ideales y fijas, y los cuerpos no chocan entre sí.
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
  /** Momento de inercia respecto del centro (kg m²); 0 = no gira (se mueve como partícula, con orientación fija). */
  I: number;
  /** Ángulo inicial (rad): el del bloque dibujado, 0 para una esfera. */
  th0: number;
  /** Radio de una esfera (para la rodadura); 0 en un bloque. */
  radio: number;
  /** Roce con otros cuerpos. */
  muS: number;
  muK: number;
}

/** Polea con masa (fija): gira con la cuerda, que no desliza sobre ella. */
export interface RotorDef {
  id: string;
  /** Momento de inercia (½ M r², disco). */
  I: number;
  r: number;
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
  /** Id del elemento cuerda. */
  ids: string[];
  ext: [Extremo, Extremo];
  /**
   * Poleas por las que pasa (fijas), o null si es recta. El largo es el del camino tangente a las poleas
   * (`grafo/ruta.ts`), así que el tramo que llega a un cuerpo tira en la dirección de la tangente.
   */
  ruta: PasoModelo[] | null;
  largo: number;
  /** Pasa por alguna polea móvil (montada sobre un cuerpo): su centro se mueve con ese cuerpo. */
  moviles?: boolean;
  /**
   * Poleas con masa por las que pasa (en orden): `j` es su índice en la ruta, `rotor` el de `Modelo.rotores` y `s` el
   * sentido en que la envuelve. Parten la cuerda en piezas con tensiones distintas.
   */
  masivas?: Array<{ j: number; rotor: number; r: number; s: 1 | -1; ref: number }>;
  /** Largo inicial de cada pieza (si hay poleas con masa). */
  largos?: number[];
}

/** Paso de la ruta en el modelo: `i` es el índice del cuerpo que lleva la polea, si es móvil. */
export type PasoModelo = PasoGeo & { i?: number };

export interface FuerzaDef {
  /** Id del vector que la representa. */
  id: string;
  cuerpo: number;
  F: Punto;
}

export interface Modelo {
  g: number;
  cuerpos: CuerpoDef[];
  /** Poleas con masa. */
  rotores: RotorDef[];
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

/** Construye el modelo dinámico de la escena, leyendo sus relaciones del grafo (`grafo/lector.ts`). */
export function construirModelo(elementos: readonly Elemento[], g = G_POR_DEFECTO): Modelo {
  const avisos: string[] = [];
  const gr = leerGrafo(elementos);
  const cuerpos: CuerpoDef[] = gr.cuerpos.map((e) => ({
    id: e.id,
    elemento: e,
    masa: e.masa,
    p0: { ...e.centro },
    v0: e.v0 ? { ...e.v0 } : { x: 0, y: 0 },
    I: e.gira ? (e.tipo === 'bloque' ? (e.masa * (e.ancho ** 2 + e.alto ** 2)) / 12 : (2 / 5) * e.masa * e.radio ** 2) : 0,
    th0: e.tipo === 'bloque' ? e.angulo : 0,
    radio: e.tipo === 'esfera' ? e.radio : 0,
    muS: e.muS ?? 0,
    muK: e.muK ?? 0,
  }));
  const rotores: RotorDef[] = [];
  const indiceRotor = new Map<string, number>();
  if (cuerpos.length === 0) avisos.push('No hay cuerpos (bloques o esferas) para simular.');
  const indice = new Map(cuerpos.map((c, i) => [c.id, i]));

  const superficies: SuperficieDef[] = gr.superficies.map((s) => {
    const largo = dist(s.a, s.b) || 1e-9;
    return { id: s.id, a: s.a, t: { x: (s.b.x - s.a.x) / largo, y: (s.b.y - s.a.y) / largo }, n: normalSuperficie(s), largo, muS: s.muS, muK: s.muK };
  });

  /** Extremo del modelo; null si está suelto (no ejerce fuerza). */
  const extremo = (x: ExtremoG): Extremo | null => {
    if (x.k === 'suelto') return null;
    if (x.k === 'fijo') return { tipo: 'fijo', p: { ...x.p } };
    const i = indice.get(x.cuerpo.id)!;
    const c = cuerpos[i]!;
    return { tipo: 'cuerpo', i, desp: { x: x.p.x - c.p0.x, y: x.p.y - c.p0.y } };
  };
  const mismo = (a: Extremo, b: Extremo): boolean => (a.tipo === 'cuerpo' && b.tipo === 'cuerpo' && a.i === b.i) || (a.tipo === 'fijo' && b.tipo === 'fijo');

  const resortes: ResorteDef[] = [];
  for (const r of gr.resortes) {
    const e0 = extremo(r.ext[0]);
    const e1 = extremo(r.ext[1]);
    if (!e0 || !e1) {
      avisos.push('Un resorte tiene un extremo suelto: no ejerce fuerza y se ignora.');
      continue;
    }
    if (mismo(e0, e1)) {
      avisos.push('Un resorte no está atado a ningún cuerpo (o ata un cuerpo consigo mismo): se ignora.');
      continue;
    }
    resortes.push({ id: r.el.id, k: r.el.k, largoNatural: r.el.largoNatural, ext: [e0, e1] });
  }

  const cuerdas: CuerdaDef[] = [];
  const posInicial = cuerpos.map((c) => c.p0);
  for (const c of gr.cuerdas) {
    const e0 = extremo(c.ext[0]);
    const e1 = extremo(c.ext[1]);
    if (!e0 || !e1) {
      avisos.push('Una cuerda tiene un extremo suelto: no ejerce fuerza y se ignora.');
      continue;
    }
    if (mismo(e0, e1)) {
      avisos.push(
        c.pasos.length > 0
          ? 'Las dos cuerdas de una polea terminan en el mismo cuerpo o ambas en puntos fijos: se ignoran.'
          : 'Una cuerda no está atada a ningún cuerpo (o ata un cuerpo consigo mismo): se ignora.',
      );
      continue;
    }
    const ext: [Extremo, Extremo] = [e0, e1];
    const ruta: PasoModelo[] | null =
      c.pasos.length > 0 ? c.pasos.map((x) => (x.k === 'circulo' && x.cuerpo && indice.has(x.cuerpo.id) ? { ...x, i: indice.get(x.cuerpo.id)! } : x)) : null;
    const moviles = ruta?.some((x) => x.i !== undefined) ?? false;
    const q0 = posExtremo(e0, posInicial);
    const q1 = posExtremo(e1, posInicial);
    // Poleas con masa (fijas) de la ruta: cada una es un rotor y parte la cuerda en piezas.
    const masivas: NonNullable<CuerdaDef['masivas']> = [];
    (c.el.ruta ?? []).forEach((p, j) => {
      if ('fijos' in p) return;
      const pol = gr.porId.get(p.el);
      if (pol?.tipo !== 'polea' || !(pol.masa && pol.masa > 0)) return;
      if (pol.montaje) {
        avisos.push('Una polea móvil con masa se trata como ideal (su masa no se considera).');
        return;
      }
      let k = indiceRotor.get(pol.id);
      if (k === undefined) {
        k = rotores.length;
        indiceRotor.set(pol.id, k);
        rotores.push({ id: pol.id, I: 0.5 * pol.masa * pol.radio ** 2, r: pol.radio });
      }
      masivas.push({ j, rotor: k, r: pol.radio, s: p.sentido, ref: 0 });
    });
    const geo = ruta ? geometriaRuta(q0, ruta, q1) : null;
    if (geo) for (const x of masivas) x.ref = anguloMedio(geo, x.j);
    cuerdas.push({
      ids: [c.el.id],
      ext,
      ruta,
      largo: geo ? geo.largo : dist(q0, q1),
      ...(moviles ? { moviles } : {}),
      ...(masivas.length > 0 && geo ? { masivas, largos: largosPorPieza(geo, masivas) } : {}),
    });
  }

  // Fuerzas aplicadas: vectores `aplicada` unidos a un cuerpo (constantes, con la dirección dibujada).
  const fuerzas: FuerzaDef[] = [];
  for (const { v, cuerpo } of gr.vectores) {
    if (v.rol !== 'aplicada') continue;
    const dx = v.b.x - v.a.x;
    const dy = v.b.y - v.a.y;
    const l = Math.hypot(dx, dy);
    if (l < 1e-9) continue;
    const F = modulo(v);
    fuerzas.push({ id: v.id, cuerpo: indice.get(cuerpo.id)!, F: { x: (dx / l) * F, y: (dy / l) * F } });
  }

  for (const c of cuerpos) if (!(c.masa > 0)) avisos.push(`El cuerpo ${c.id} no tiene masa positiva.`);
  return { g, cuerpos, rotores, superficies, resortes, cuerdas, fuerzas, avisos };
}
