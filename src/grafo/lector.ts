import type { Punto } from '../core/camara';
import type { Bloque, Cuerda, Elemento, Esfera, Resorte, Superficie, Union, Vector } from '../core/elementos';
import { posUnion, pasosGeo, resolverEscena } from './resolver';
import type { GeometriaRuta, PasoGeo } from './ruta';
import { geometriaRuta } from './ruta';
import { completarV1 } from './v1';

/**
 * Lector único del grafo de la escena. La simulación (`sim/modelo.ts`), el diagrama de cuerpo libre
 * (`physics/dcl.ts`) y el validador (`grafo/validar.ts`) leen las relaciones de aquí, así que lo que muestra uno
 * es lo que usa el otro. No hay tolerancias: todo sale de los campos `union`, `ruta`, `apoyo` y `cuerpo`.
 */

export type CuerpoG = Bloque | Esfera;

/** Extremo de una cuerda o un resorte, ya interpretado. */
export type ExtremoG =
  | { k: 'cuerpo'; cuerpo: CuerpoG; p: Punto }
  /** Fijo en el espacio, o unido a algo que no se mueve (polea fija, superficie). */
  | { k: 'fijo'; p: Punto }
  /** Sin unir: no ejerce fuerza. `huerfano` = estaba unido a un elemento que ya no existe. */
  | { k: 'suelto'; p: Punto; huerfano: boolean };

export interface CuerdaG {
  el: Cuerda;
  ext: [ExtremoG, ExtremoG];
  pasos: PasoGeo[];
  /** Hacia dónde tira la cuerda en cada extremo: el otro extremo, o el primer punto de contacto con una polea. */
  hacia: [Punto, Punto];
  /** Por cada paso: dónde llega y sale, y hacia dónde tiran sus dos tramos (para las poleas móviles en el DCL). */
  nodos: GeometriaRuta['nodos'];
}

export interface ResorteG {
  el: Resorte;
  ext: [ExtremoG, ExtremoG];
}

export interface Grafo {
  /** La escena completa (v1 migrada en memoria) y resuelta. */
  elementos: Elemento[];
  porId: ReadonlyMap<string, Elemento>;
  cuerpos: CuerpoG[];
  superficies: Superficie[];
  /** Cuerdas en el orden de la v1: primero las que pasan por poleas (por orden de la polea), después las demás. */
  cuerdas: CuerdaG[];
  resortes: ResorteG[];
  /** Fuerzas aplicadas y tensiones dibujadas, con el cuerpo sobre el que actúan. */
  vectores: Array<{ v: Vector; cuerpo: CuerpoG }>;
}

function extremoG(u: Union | null | undefined, guardada: Punto, porId: ReadonlyMap<string, Elemento>): ExtremoG {
  const p = posUnion(u, guardada, porId);
  if (!u) return { k: 'suelto', p, huerfano: false };
  if ('fijo' in u) return { k: 'fijo', p };
  const el = porId.get(u.el);
  if (!el) return { k: 'suelto', p, huerfano: true };
  if (el.tipo === 'bloque' || el.tipo === 'esfera') return { k: 'cuerpo', cuerpo: el, p };
  return { k: 'fijo', p };
}

const memo = new WeakMap<readonly Elemento[], Grafo>();

export function leerGrafo(entrada: readonly Elemento[]): Grafo {
  const previo = memo.get(entrada);
  if (previo) return previo;
  const elementos = resolverEscena(completarV1(entrada));
  const porId = new Map(elementos.map((e) => [e.id, e]));
  const indice = new Map(elementos.map((e, i) => [e.id, i]));
  const cuerpos = elementos.filter((e): e is CuerpoG => e.tipo === 'bloque' || e.tipo === 'esfera');
  const superficies = elementos.filter((e): e is Superficie => e.tipo === 'superficie');

  const conRuta: Array<CuerdaG & { orden: number }> = [];
  const sinRuta: CuerdaG[] = [];
  for (const e of elementos) {
    if (e.tipo !== 'cuerda') continue;
    const pasos = pasosGeo(e.ruta ?? [], porId);
    const geo = pasos.length > 0 ? geometriaRuta(e.a, pasos, e.b) : null;
    const g: CuerdaG = {
      el: e,
      ext: [extremoG(e.union?.[0], e.a, porId), extremoG(e.union?.[1], e.b, porId)],
      pasos,
      hacia: geo ? [geo.haciaA, geo.haciaB] : [e.b, e.a],
      nodos: geo?.nodos ?? [],
    };
    if (g.pasos.length > 0) conRuta.push({ ...g, orden: indice.get(e.ruta![0]!.el) ?? Infinity });
    else sinRuta.push(g);
  }
  conRuta.sort((p, q) => p.orden - q.orden);

  const resortes: ResorteG[] = elementos
    .filter((e): e is Resorte => e.tipo === 'resorte')
    .map((e) => ({ el: e, ext: [extremoG(e.union?.[0], e.a, porId), extremoG(e.union?.[1], e.b, porId)] }));

  const vectores: Grafo['vectores'] = [];
  for (const e of elementos) {
    if (e.tipo !== 'vector' || e.fantasma || !e.cuerpo || (e.rol !== 'aplicada' && e.rol !== 'tension')) continue;
    const c = porId.get(e.cuerpo);
    if (c && (c.tipo === 'bloque' || c.tipo === 'esfera')) vectores.push({ v: e, cuerpo: c });
  }

  const g: Grafo = { elementos, porId, cuerpos, superficies, cuerdas: [...conRuta.map(({ orden: _, ...x }) => (void _, x)), ...sinRuta], resortes, vectores };
  memo.set(entrada, g);
  return g;
}

/** Superficies en las que se apoya el cuerpo (en el orden de su lista `apoyo`, saltando las que no existen). */
export function apoyosDe(g: Grafo, c: CuerpoG): Superficie[] {
  return (c.apoyo ?? []).map((id) => g.porId.get(id)).filter((s): s is Superficie => s?.tipo === 'superficie');
}

/** ¿El extremo está unido a este cuerpo? */
export const esDe = (x: ExtremoG, c: CuerpoG): boolean => x.k === 'cuerpo' && x.cuerpo.id === c.id;
