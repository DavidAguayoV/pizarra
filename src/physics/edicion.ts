import type { Punto } from '../core/camara';
import type { Bloque, Ejes, Elemento, Esfera, Polea, Vector } from '../core/elementos';
import { esquinasBloque, extremosEjes } from '../core/elementos';
import { arcoDe, barridoPorPunto, medioTramo } from './curvas';

/**
 * Asas de edición: los puntos que se arrastran para modificar un elemento.
 * Vector: origen y punta. Ejes: origen (mueve) y las puntas de x e y (giran y cambian el largo).
 * Las demás figuras se mueven enteras.
 */

export type NombreAsa = 'a' | 'b' | 'origen' | 'x' | 'y' | 'rotar' | 'tam' | 'radio' | 'curva';

export interface Asa {
  nombre: NombreAsa;
  p: Punto;
}

export const PASO_ANGULO = Math.PI / 12; // 15°

export function asasDe(e: Elemento): Asa[] {
  switch (e.tipo) {
    case 'vector':
      return [
        { nombre: 'a', p: e.a },
        { nombre: 'b', p: e.b },
      ];
    case 'ejes': {
      const [x, y] = extremosEjes(e);
      return [
        { nombre: 'origen', p: e.origen },
        { nombre: 'x', p: x.pos },
        { nombre: 'y', p: y.pos },
      ];
    }
    case 'superficie':
      // Una superficie curva tiene además el asa del medio, que cambia cuánto se curva.
      return [{ nombre: 'a', p: e.a }, { nombre: 'b', p: e.b }, ...(arcoDe(e) ? [{ nombre: 'curva' as const, p: medioTramo(e) }] : [])];
    case 'cuerda':
    case 'resorte':
      return [
        { nombre: 'a', p: e.a },
        { nombre: 'b', p: e.b },
      ];
    case 'bloque': {
      const c2 = esquinasBloque(e)[2];
      const u = { x: Math.cos(e.angulo), y: Math.sin(e.angulo) };
      const v = { x: -u.y, y: u.x };
      const arriba = { x: e.centro.x + v.x * (e.alto / 2 + 0.28), y: e.centro.y + v.y * (e.alto / 2 + 0.28) };
      return [
        { nombre: 'rotar', p: arriba },
        { nombre: 'tam', p: c2 },
      ];
    }
    case 'esfera':
      return [{ nombre: 'radio', p: { x: e.centro.x + e.radio, y: e.centro.y } }];
    // La polea es una pieza de tamaño fijo: se mueve entera; el radio se cambia en su panel (Nivel 2).
    default:
      return [];
  }
}

const redondear = (n: number): number => Math.round(n * 1e4) / 1e4;
const pt = (p: Punto): Punto => ({ x: redondear(p.x), y: redondear(p.y) });

/** Fuerza el ángulo del segmento origen→p a múltiplos de 15°. */
export function ajustarAngulo(origen: Punto, p: Punto, base = 0): Punto {
  const dx = p.x - origen.x;
  const dy = p.y - origen.y;
  const l = Math.hypot(dx, dy);
  const ang = Math.round((Math.atan2(dy, dx) - base) / PASO_ANGULO) * PASO_ANGULO + base;
  return { x: origen.x + Math.cos(ang) * l, y: origen.y + Math.sin(ang) * l };
}

/** Elemento nuevo con el asa `asa` llevada a `p`. Con `ajustar`, el ángulo cae en múltiplos de 15°. */
export function moverAsa(e: Elemento, asa: NombreAsa, p: Punto, ajustar = false): Elemento {
  if (e.tipo === 'vector') {
    const v: Vector = e;
    if (asa === 'a') return { ...v, a: pt(ajustar ? ajustarAngulo(v.b, p) : p) };
    if (asa === 'b') return { ...v, b: pt(ajustar ? ajustarAngulo(v.a, p) : p) };
    return e;
  }
  if (e.tipo === 'ejes') {
    const ej: Ejes = e;
    if (asa === 'origen') return { ...ej, origen: pt(p) };
    if (asa === 'x' || asa === 'y') {
      const q = ajustar ? ajustarAngulo(ej.origen, p) : p;
      const dx = q.x - ej.origen.x;
      const dy = q.y - ej.origen.y;
      const largo = Math.max(0.3, Math.hypot(dx, dy));
      let angulo = Math.atan2(dy, dx);
      if (asa === 'y') angulo -= Math.PI / 2;
      return { ...ej, angulo: redondear(angulo), largo: redondear(largo) };
    }
  }
  if (e.tipo === 'superficie' && asa === 'curva') {
    // El arco pasa por el asa (con Mayús, de 15° en 15°); casi recta, queda recta.
    let beta = barridoPorPunto(e.a, e.b, p);
    if (ajustar) beta = Math.round(beta / PASO_ANGULO) * PASO_ANGULO;
    const { barrido: _, ...recta } = e;
    void _;
    return Math.abs(beta) < 1e-3 ? recta : { ...e, barrido: redondear(beta) };
  }
  if (e.tipo === 'superficie' || e.tipo === 'cuerda' || e.tipo === 'resorte') {
    if (asa === 'a') return { ...e, a: pt(ajustar ? ajustarAngulo(e.b, p) : p) };
    if (asa === 'b') return { ...e, b: pt(ajustar ? ajustarAngulo(e.a, p) : p) };
  }
  if (e.tipo === 'bloque') {
    const b: Bloque = e;
    if (asa === 'rotar') {
      let ang = Math.atan2(p.y - b.centro.y, p.x - b.centro.x) - Math.PI / 2;
      if (ajustar) ang = Math.round(ang / PASO_ANGULO) * PASO_ANGULO;
      return { ...b, angulo: redondear(ang) };
    }
    if (asa === 'tam') {
      const dx = p.x - b.centro.x;
      const dy = p.y - b.centro.y;
      const co = Math.cos(-b.angulo);
      const si = Math.sin(-b.angulo);
      return { ...b, ancho: redondear(Math.max(0.2, 2 * Math.abs(dx * co - dy * si))), alto: redondear(Math.max(0.2, 2 * Math.abs(dx * si + dy * co))) };
    }
  }
  if ((e.tipo === 'esfera' || e.tipo === 'polea') && asa === 'radio') {
    const c: Esfera | Polea = e;
    return { ...c, radio: redondear(Math.max(0.1, Math.hypot(p.x - c.centro.x, p.y - c.centro.y))) };
  }
  return e;
}
