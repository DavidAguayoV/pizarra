import type { Punto } from '../core/camara';

/** Ramer–Douglas–Peucker: quita puntos que se desvían menos de `eps` de la recta. */
export function simplificarRdp(pts: readonly Punto[], eps: number): Punto[] {
  if (pts.length <= 2) return [...pts];
  const mantener = new Uint8Array(pts.length);
  mantener[0] = 1;
  mantener[pts.length - 1] = 1;
  const pila: Array<[number, number]> = [[0, pts.length - 1]];
  while (pila.length > 0) {
    const [i0, i1] = pila.pop()!;
    const a = pts[i0]!;
    const b = pts[i1]!;
    let maxD = 0;
    let idx = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = distanciaARecta(pts[i]!, a, b);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > eps) {
      mantener[idx] = 1;
      pila.push([i0, idx], [idx, i1]);
    }
  }
  return pts.filter((_, i) => mantener[i] === 1);
}

function distanciaARecta(p: Punto, a: Punto, b: Punto): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / l;
}

export interface SegmentoBezier {
  c1: Punto;
  c2: Punto;
  fin: Punto;
}

/**
 * Curva que pasa por todos los puntos (Catmull–Rom) expresada como Béziers cúbicas.
 * El primer y el último punto se duplican para que la curva no se salga de los extremos.
 */
export function bezierPorPuntos(pts: readonly Punto[]): SegmentoBezier[] {
  const out: SegmentoBezier[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    out.push({
      c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      fin: p2,
    });
  }
  return out;
}
