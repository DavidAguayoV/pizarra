import type { Punto } from '../core/camara';

/**
 * Geometría de las superficies curvas (arcos de circunferencia), compartida por el editor, el dibujo, las exportaciones,
 * el DCL y el motor. Una superficie curva va de `a` a `b` girando `barrido` radianes alrededor de su centro (positivo:
 * antihorario). Como en las rectas, el lado sólido queda a la **derecha** de a → b: un arco antihorario dibujado de
 * izquierda a derecha es un valle (el sólido abajo, afuera del círculo); uno horario, una loma. Un loop es un arco de casi
 * una vuelta.
 */

export interface Arco {
  c: Punto;
  r: number;
  /** Ángulo (desde el centro) del punto `a`. */
  desde: number;
  /** Ángulo barrido de a a b, con signo (antihorario > 0); |barrido| < 2π. */
  barrido: number;
  /** +1 si es antihorario, −1 si es horario. */
  sigma: 1 | -1;
  largo: number;
}

/** Lo que basta de una superficie para su geometría. */
export interface Tramo {
  a: Punto;
  b: Punto;
  barrido?: number;
}

/** Barrido mínimo (rad) para considerar curva una superficie: por debajo es una recta. */
export const BARRIDO_MINIMO = 1e-3;
/** Barrido máximo: casi una vuelta (un loop deja un hueco para entrar y salir). */
export const BARRIDO_MAXIMO = 2 * Math.PI - 0.05;

const DOS_PI = 2 * Math.PI;

/** El arco de una superficie curva, o null si es recta. */
export function arcoDe(s: Tramo): Arco | null {
  const be = s.barrido ?? 0;
  if (Math.abs(be) < BARRIDO_MINIMO) return null;
  const beta = Math.max(-BARRIDO_MAXIMO, Math.min(BARRIDO_MAXIMO, be));
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return null;
  const sigma: 1 | -1 = beta > 0 ? 1 : -1;
  const ab = Math.abs(beta);
  const r = L / (2 * Math.sin(ab / 2));
  // El centro, sobre la mediatriz de la cuerda: a su izquierda si gira antihorario (a la derecha si horario).
  const izq = { x: -dy / L, y: dx / L };
  const h = sigma * r * Math.cos(ab / 2);
  const c = { x: (s.a.x + s.b.x) / 2 + izq.x * h, y: (s.a.y + s.b.y) / 2 + izq.y * h };
  return { c, r, desde: Math.atan2(s.a.y - c.y, s.a.x - c.x), barrido: beta, sigma, largo: r * ab };
}

/** Largo de la superficie (recta o curva). */
export function largoTramo(s: Tramo): number {
  const arco = arcoDe(s);
  return arco ? arco.largo : Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
}

/** Punto a la fracción `f` (0 = a, 1 = b) del largo de la superficie. */
export function puntoEnTramo(s: Tramo, f: number): Punto {
  const arco = arcoDe(s);
  if (!arco) return { x: s.a.x + f * (s.b.x - s.a.x), y: s.a.y + f * (s.b.y - s.a.y) };
  const ang = arco.desde + f * arco.barrido;
  return { x: arco.c.x + arco.r * Math.cos(ang), y: arco.c.y + arco.r * Math.sin(ang) };
}

export interface Marco {
  /** Distancia a lo largo de la superficie desde `a` (negativa antes de `a`, mayor que el largo después de `b`). */
  u: number;
  /** Distancia con signo a la superficie a lo largo de `n` (positiva del lado de la normal). */
  d: number;
  /** Normal unitaria (a la izquierda del avance a → b) y tangente unitaria (el avance), en el punto más cercano. */
  n: Punto;
  t: Punto;
  largo: number;
}

/**
 * Marco local de la superficie visto desde el punto `p`: posición a lo largo, distancia con signo, normal y tangente
 * (las del punto de la superficie más cercano). En una recta, n y t son constantes.
 */
export function marcoTramo(s: Tramo, p: Punto): Marco {
  const arco = arcoDe(s);
  if (!arco) {
    const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) || 1e-9;
    const t = { x: (s.b.x - s.a.x) / L, y: (s.b.y - s.a.y) / L };
    const n = { x: -t.y, y: t.x };
    const rel = { x: p.x - s.a.x, y: p.y - s.a.y };
    return { u: rel.x * t.x + rel.y * t.y, d: rel.x * n.x + rel.y * n.y, n, t, largo: L };
  }
  return marcoArco(arco, p);
}

export function marcoArco(arco: Arco, p: Punto): Marco {
  const rx = p.x - arco.c.x;
  const ry = p.y - arco.c.y;
  const L = Math.hypot(rx, ry) || 1e-12;
  const e = { x: rx / L, y: ry / L };
  const s = arco.sigma;
  const t = { x: -s * e.y, y: s * e.x };
  const n = { x: -s * e.x, y: -s * e.y };
  // Ángulo recorrido desde a (en el sentido del arco), en [0, 2π)
  let th = (s * (Math.atan2(ry, rx) - arco.desde)) % DOS_PI;
  if (th < 0) th += DOS_PI;
  const ab = Math.abs(arco.barrido);
  // Fuera del arco: según de qué extremo está más cerca, antes de a (u < 0) o después de b (u > largo).
  if (th > ab && th > (ab + DOS_PI) / 2) th -= DOS_PI;
  return { u: th * arco.r, d: -s * (L - arco.r), n, t, largo: arco.largo };
}

/** Puntos de la superficie para dibujarla (una recta: sus dos extremos). */
export function muestrasTramo(s: Tramo, paso = 0.05): Punto[] {
  const arco = arcoDe(s);
  if (!arco) return [s.a, s.b];
  const n = Math.max(8, Math.ceil(arco.largo / paso));
  return Array.from({ length: n + 1 }, (_, k) => puntoEnTramo(s, k / n));
}

/** Distancia (sin signo) del punto a la superficie (a su tramo, sin prolongarlo). */
export function distanciaATramo(s: Tramo, p: Punto): number {
  const m = marcoTramo(s, p);
  if (m.u >= 0 && m.u <= m.largo) return Math.abs(m.d);
  const q = m.u < 0 ? s.a : s.b;
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/**
 * Barrido (con signo) del arco que va de `a` a `b` pasando por `q` (el asa del medio de la curva). Si `q` está casi sobre
 * la cuerda, 0 (recta).
 */
export function barridoPorPunto(a: Punto, b: Punto, q: Punto): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return 0;
  // Flecha (distancia de q a la cuerda, con signo: positiva a la derecha de a → b, donde se abomba un arco antihorario)
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const f = ((q.x - mx) * dy - (q.y - my) * dx) / L;
  if (Math.abs(f) < 1e-3 * L) return 0;
  // Con flecha f y media cuerda c: el ángulo barrido es 4·atan(f/c)
  const beta = 4 * Math.atan(f / (L / 2));
  return Math.max(-BARRIDO_MAXIMO, Math.min(BARRIDO_MAXIMO, beta));
}

/** Punto medio de la curva (donde va su asa). */
export function medioTramo(s: Tramo): Punto {
  return puntoEnTramo(s, 0.5);
}
