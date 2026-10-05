import type { Punto } from '../core/camara';
import type { Elemento } from '../core/elementos';

/**
 * Puertos: los puntos con nombre de un elemento donde se puede unir el extremo de una cuerda o un resorte.
 * No se guardan: son una función pura del elemento, en sus coordenadas locales, así que acompañan al
 * movimiento y al giro.
 *
 * Nombres:
 *   bloque     centro, cara-sup, cara-inf, cara-izq, cara-der, esq-si, esq-sd, esq-ii, esq-id
 *   esfera     centro, borde:<grados>
 *   polea      eje
 *   superficie a, b, u:<0..1>
 *   bloque y esfera, además: local:<x>,<y> (cualquier punto, en coordenadas del cuerpo sin girar; lo usa la
 *   migración de la v1 para conservar exactamente dónde estaba atada una cuerda)
 */

export interface Puerto {
  nombre: string;
  p: Punto;
}

/** Elementos que ofrecen puertos. */
export type ConPuertos = Extract<Elemento, { tipo: 'bloque' | 'esfera' | 'polea' | 'superficie' }>;

export function tienePuertos(e: Elemento): e is ConPuertos {
  return e.tipo === 'bloque' || e.tipo === 'esfera' || e.tipo === 'polea' || e.tipo === 'superficie';
}

const LOCALES_BLOQUE: ReadonlyArray<readonly [string, number, number]> = [
  ['centro', 0, 0],
  ['cara-sup', 0, 1],
  ['cara-inf', 0, -1],
  ['cara-izq', -1, 0],
  ['cara-der', 1, 0],
  ['esq-si', -1, 1],
  ['esq-sd', 1, 1],
  ['esq-ii', -1, -1],
  ['esq-id', 1, -1],
];

/** Pasa un punto del sistema local de un cuerpo (sin girar, origen en su centro) al mundo. */
function deLocal(centro: Punto, angulo: number, x: number, y: number): Punto {
  const c = Math.cos(angulo);
  const s = Math.sin(angulo);
  return { x: centro.x + x * c - y * s, y: centro.y + x * s + y * c };
}

/** Puertos con nombre del elemento (los paramétricos `local:`, `borde:` y `u:` no se listan, salvo los de la esfera cada 90°). */
export function puertosDe(e: Elemento): Puerto[] {
  switch (e.tipo) {
    case 'bloque':
      return LOCALES_BLOQUE.map(([nombre, fx, fy]) => ({ nombre, p: deLocal(e.centro, e.angulo, (fx * e.ancho) / 2, (fy * e.alto) / 2) }));
    case 'esfera':
      return [{ nombre: 'centro', p: e.centro }, ...[0, 90, 180, 270].map((g) => ({ nombre: `borde:${g}`, p: posPuerto(e, `borde:${g}`)! }))];
    case 'polea':
      return [{ nombre: 'eje', p: e.centro }];
    case 'superficie':
      return [
        { nombre: 'a', p: e.a },
        { nombre: 'b', p: e.b },
      ];
    default:
      return [];
  }
}

/** Posición en el mundo del puerto `nombre` de `e`, o null si el elemento no tiene ese puerto. */
export function posPuerto(e: Elemento, nombre: string): Punto | null {
  if (e.tipo === 'bloque' || e.tipo === 'esfera') {
    const angulo = e.tipo === 'bloque' ? e.angulo : 0;
    if (nombre.startsWith('local:')) {
      const [x, y] = nombre.slice(6).split(',').map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return deLocal(e.centro, angulo, x!, y!);
    }
    if (nombre === 'centro') return { ...e.centro };
    if (e.tipo === 'esfera') {
      if (!nombre.startsWith('borde:')) return null;
      const g = (Number(nombre.slice(6)) * Math.PI) / 180;
      if (!Number.isFinite(g)) return null;
      return { x: e.centro.x + e.radio * Math.cos(g), y: e.centro.y + e.radio * Math.sin(g) };
    }
    const def = LOCALES_BLOQUE.find(([n]) => n === nombre);
    return def ? deLocal(e.centro, e.angulo, (def[1] * e.ancho) / 2, (def[2] * e.alto) / 2) : null;
  }
  if (e.tipo === 'polea') return nombre === 'eje' ? { ...e.centro } : null;
  if (e.tipo === 'superficie') {
    if (nombre === 'a') return { ...e.a };
    if (nombre === 'b') return { ...e.b };
    if (nombre.startsWith('u:')) {
      const u = Number(nombre.slice(2));
      if (!Number.isFinite(u)) return null;
      return { x: e.a.x + (e.b.x - e.a.x) * u, y: e.a.y + (e.b.y - e.a.y) * u };
    }
  }
  return null;
}

/** Nombre del puerto `local:` que corresponde al punto del mundo `p` en el cuerpo `c` (posición exacta). */
export function puertoLocal(c: Extract<Elemento, { tipo: 'bloque' | 'esfera' }>, p: Punto): string {
  const angulo = c.tipo === 'bloque' ? c.angulo : 0;
  const dx = p.x - c.centro.x;
  const dy = p.y - c.centro.y;
  const co = Math.cos(-angulo);
  const si = Math.sin(-angulo);
  return `local:${dx * co - dy * si},${dx * si + dy * co}`;
}

/** El puerto con nombre de `e` más cercano a `p`. */
export function puertoMasCercano(e: Elemento, p: Punto): Puerto | null {
  let mejor: Puerto | null = null;
  let d = Infinity;
  for (const q of puertosDe(e)) {
    const dq = Math.hypot(q.p.x - p.x, q.p.y - p.y);
    if (dq < d) {
      d = dq;
      mejor = q;
    }
  }
  return mejor;
}
