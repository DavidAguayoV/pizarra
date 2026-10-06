import type { Punto } from '../core/camara';
import { apoyoEn } from '../physics/dcl';
import type { Cuerpo, Modelo } from './modelo';

/**
 * Geometría del contacto entre dos cuerpos (bloques y esferas), para el motor.
 *
 * Un contacto es un par (i, j) con una **característica**: una cara de j (si j es un bloque; caras 0 arriba, 1 derecha,
 * 2 abajo, 3 izquierda en el sistema del bloque) o, si los dos son esferas, la línea de los centros (cara −1). La normal
 * sale de j hacia i. La **separación** a lo largo de la normal es positiva si no se tocan y negativa si se traslapan.
 * Para detectar choques se usa la característica de mayor separación (ejes separadores: las caras de los dos bloques);
 * una esfera contra la esquina de un bloque es una característica aparte (solo da un impulso, nunca un apoyo).
 */

export interface PoseCuerpos {
  p: readonly Punto[];
  th: readonly number[];
}

const NORMALES: readonly Punto[] = [
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: -1, y: 0 },
];

const dot = (a: Punto, b: Punto): number => a.x * b.x + a.y * b.y;
export const rotarV = (d: Punto, ang: number): Punto => {
  if (ang === 0) return d;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: d.x * c - d.y * s, y: d.x * s + d.y * c };
};

/** El cuerpo i con el ángulo de la pose (para medir su extensión en una dirección). */
function girado(m: Modelo, i: number, th: readonly number[]): Cuerpo {
  const el = m.cuerpos[i]!.elemento;
  return el.tipo === 'bloque' && el.angulo !== th[i] ? { ...el, angulo: th[i]! } : el;
}

/** Extensión del cuerpo i desde su centro en la dirección d (unitaria). */
export function soporte(m: Modelo, i: number, d: Punto, th: readonly number[]): number {
  return apoyoEn(girado(m, i, th), d);
}

/** Radio de una circunferencia que contiene al cuerpo (para descartar pares lejanos). */
export function radioEnvolvente(m: Modelo, i: number): number {
  const el = m.cuerpos[i]!.elemento;
  return el.tipo === 'esfera' ? el.radio : Math.hypot(el.ancho, el.alto) / 2;
}

/** Un contacto (o un choque) entre dos cuerpos. */
export interface Par {
  i: number;
  j: number;
  /** Cara de j (0–3), −1 si los dos son esferas. */
  cara: number;
}

export interface GeoContacto {
  /** Normal de j hacia i, y tangente (la normal girada 90° en sentido antihorario). */
  n: Punto;
  t: Punto;
  /** Brazos desde cada centro hasta el punto de contacto. */
  ri: Punto;
  rj: Punto;
  /** Separación a lo largo de la normal (< 0: traslapo). */
  gap: number;
  /** Posición del centro de i a lo largo de la cara de j, y medio largo de esa cara (para caer por el borde). */
  u: number;
  semiCara: number;
}

/** Normal, brazos y separación de un contacto en la pose dada. */
export function geoContacto(m: Modelo, c: Par, pose: PoseCuerpos): GeoContacto {
  const pi = pose.p[c.i]!;
  const pj = pose.p[c.j]!;
  const d = { x: pi.x - pj.x, y: pi.y - pj.y };
  if (c.cara < 0) {
    const L = Math.hypot(d.x, d.y) || 1e-12;
    const n = { x: d.x / L, y: d.y / L };
    const ri = m.cuerpos[c.i]!.elemento;
    const rj = m.cuerpos[c.j]!.elemento;
    const a = ri.tipo === 'esfera' ? ri.radio : 0;
    const b = rj.tipo === 'esfera' ? rj.radio : 0;
    return { n, t: { x: -n.y, y: n.x }, ri: { x: -n.x * a, y: -n.y * a }, rj: { x: n.x * b, y: n.y * b }, gap: L - a - b, u: 0, semiCara: Infinity };
  }
  const n = rotarV(NORMALES[c.cara]!, pose.th[c.j]!);
  const t = { x: -n.y, y: n.x };
  const hj = soporte(m, c.j, n, pose.th);
  const hi = soporte(m, c.i, n, pose.th);
  const P = { x: pi.x - n.x * hi, y: pi.y - n.y * hi };
  return {
    n,
    t,
    ri: { x: P.x - pi.x, y: P.y - pi.y },
    rj: { x: P.x - pj.x, y: P.y - pj.y },
    gap: dot(n, d) - hj - hi,
    u: dot(t, d),
    semiCara: soporte(m, c.j, t, pose.th),
  };
}

/** Choque contra la esquina de un bloque (solo esferas): normal y punto de contacto explícitos. */
export interface Esquina {
  i: number;
  j: number;
  n: Punto;
  P: Punto;
  gap: number;
}

export type Caracteristica = (Par & { gap: number; esquina?: undefined }) | (Esquina & { esquina: true });

/**
 * La característica de mayor separación entre los cuerpos a y b (si es negativa, se traslapan): la cara que mejor los
 * separa (dos bloques), la cara o la esquina más cercana a la esfera (bloque y esfera), o la línea de los centros.
 */
export function separacion(m: Modelo, a: number, b: number, pose: PoseCuerpos): Caracteristica {
  const ea = m.cuerpos[a]!.elemento;
  const eb = m.cuerpos[b]!.elemento;
  if (ea.tipo === 'esfera' && eb.tipo === 'esfera') return { i: a, j: b, cara: -1, gap: geoContacto(m, { i: a, j: b, cara: -1 }, pose).gap };
  if (ea.tipo === 'bloque' && eb.tipo === 'bloque') {
    let mejor: Caracteristica | null = null;
    let ny = -Infinity;
    for (const [dueno, otro] of [
      [a, b],
      [b, a],
    ] as const) {
      for (let f = 0; f < 4; f++) {
        const g = geoContacto(m, { i: otro, j: dueno, cara: f }, pose);
        // Empate (bloques paralelos cara a cara): gana la cara del de abajo, para que «i se apoya en j» y el borde del
        // que puede caer sea el de la cara que lo sostiene.
        if (!mejor || g.gap > mejor.gap + 1e-9 || (g.gap > mejor.gap - 1e-9 && g.n.y > ny + 1e-9)) {
          mejor = { i: otro, j: dueno, cara: f, gap: g.gap };
          ny = g.n.y;
        }
      }
    }
    return mejor!;
  }
  // Bloque j y esfera i
  const [i, j] = ea.tipo === 'esfera' ? [a, b] : [b, a];
  const bj = m.cuerpos[j]!.elemento;
  const r = (m.cuerpos[i]!.elemento as Extract<Cuerpo, { tipo: 'esfera' }>).radio;
  if (bj.tipo !== 'bloque') throw new Error('separacion: se esperaba un bloque');
  const w = bj.ancho / 2;
  const hh = bj.alto / 2;
  const th = pose.th[j]!;
  const rel = { x: pose.p[i]!.x - pose.p[j]!.x, y: pose.p[i]!.y - pose.p[j]!.y };
  const l = rotarV(rel, -th);
  const cx = Math.max(-w, Math.min(w, l.x));
  const cy = Math.max(-hh, Math.min(hh, l.y));
  const fueraX = cx !== l.x;
  const fueraY = cy !== l.y;
  if (fueraX && fueraY) {
    const dl = { x: l.x - cx, y: l.y - cy };
    const L = Math.hypot(dl.x, dl.y);
    const n = rotarV({ x: dl.x / L, y: dl.y / L }, th);
    const P = rotarV({ x: cx, y: cy }, th);
    return { esquina: true, i, j, n, P: { x: pose.p[j]!.x + P.x, y: pose.p[j]!.y + P.y }, gap: L - r };
  }
  let cara: number;
  if (fueraX) cara = l.x > 0 ? 1 : 3;
  else if (fueraY) cara = l.y > 0 ? 0 : 2;
  else {
    // El centro de la esfera quedó dentro del bloque: la cara más cercana.
    const pen = [hh - l.y, w - l.x, hh + l.y, w + l.x];
    cara = pen.indexOf(Math.min(...pen));
  }
  return { i, j, cara, gap: geoContacto(m, { i, j, cara }, pose).gap };
}
