import type { Punto } from './camara';

/**
 * Elementos de la escena. Todo en coordenadas del mundo (metros, y hacia arriba):
 * el zoom no degrada nada y el grosor escala con la vista, como tinta en una pizarra real.
 *
 * El color no es un hex: es un rol de tinta que cada tema resuelve (la tinta "normal"
 * es negra en el tema claro y blanca en el oscuro). Así la pizarra se ve bien en ambos
 * temas y las exportaciones salen siempre con la paleta clara.
 */

export const COLORES_TINTA = ['tinta', 'campo', 'contacto', 'disipacion', 'movimiento', 'acento', 'neutro'] as const;
export type ColorTinta = (typeof COLORES_TINTA)[number];

interface Base {
  id: string;
  color: ColorTinta;
}

export interface Trazo extends Base {
  tipo: 'trazo';
  /** Grosor en metros. */
  grosor: number;
  /** Secuencia plana x, y, presión (0..1). El mouse registra 0,5 (grosor neutro). */
  puntos: number[];
  resaltador: boolean;
}

export interface Linea extends Base {
  tipo: 'linea' | 'flecha';
  grosor: number;
  a: Punto;
  b: Punto;
}

/** Rectángulo y elipse: `a` y `b` son esquinas opuestas de la caja. */
export interface Caja extends Base {
  tipo: 'rect' | 'elipse';
  grosor: number;
  a: Punto;
  b: Punto;
}

export interface Texto extends Base {
  tipo: 'texto';
  /** Esquina superior izquierda de la caja de texto. */
  pos: Punto;
  texto: string;
  /** Alto de letra en metros. */
  tam: number;
}

export interface Imagen {
  id: string;
  tipo: 'imagen';
  /** Esquina superior izquierda. */
  pos: Punto;
  ancho: number;
  alto: number;
  /** data URL (png o jpeg). */
  src: string;
}

export type Elemento = Trazo | Linea | Caja | Texto | Imagen;

export interface Caja2D {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Factores de tipografía compartidos por pantalla, SVG y TikZ. */
export const INTERLINEADO = 1.25;
export const ANCHO_CARACTER = 0.55;
/** Distancia de la línea base al borde superior de la caja, en alturas de letra. */
export const ASCENSO = 0.85;

export function lineasDe(t: Texto): string[] {
  return t.texto.split('\n');
}

export function dimensionesTexto(t: Texto): { ancho: number; alto: number } {
  const lineas = lineasDe(t);
  const maxCar = Math.max(1, ...lineas.map((l) => l.length));
  return { ancho: maxCar * ANCHO_CARACTER * t.tam, alto: lineas.length * INTERLINEADO * t.tam };
}

let contador = 0;
export function nuevoIdElemento(): string {
  return `e${Date.now().toString(36)}${(contador++).toString(36)}`;
}

export function puntosDe(t: Trazo): Punto[] {
  const out: Punto[] = [];
  for (let i = 0; i + 1 < t.puntos.length; i += 3) out.push({ x: t.puntos[i]!, y: t.puntos[i + 1]! });
  return out;
}

/** Caja mínima que contiene al elemento, con el margen del grosor. */
export function cajaDe(e: Elemento): Caja2D {
  switch (e.tipo) {
    case 'trazo': {
      const pts = puntosDe(e);
      const m = e.grosor * (e.resaltador ? 0.5 : 0.8);
      return envolver(pts, m);
    }
    case 'linea':
    case 'flecha': {
      const m = e.grosor / 2 + (e.tipo === 'flecha' ? largoPunta(e.grosor) : 0);
      return envolver([e.a, e.b], m);
    }
    case 'rect':
    case 'elipse':
      return envolver([e.a, e.b], e.grosor / 2);
    case 'texto': {
      const { ancho, alto } = dimensionesTexto(e);
      return { x0: e.pos.x, y0: e.pos.y - alto, x1: e.pos.x + ancho, y1: e.pos.y };
    }
    case 'imagen':
      return { x0: e.pos.x, y0: e.pos.y - e.alto, x1: e.pos.x + e.ancho, y1: e.pos.y };
  }
}

function envolver(pts: Punto[], margen: number): Caja2D {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0: x0 - margen, y0: y0 - margen, x1: x1 + margen, y1: y1 + margen };
}

const cajas = new WeakMap<Elemento, Caja2D>();
/** Igual que `cajaDe`, pero la calcula una sola vez por elemento (los elementos son inmutables). */
export function cajaCacheada(e: Elemento): Caja2D {
  let c = cajas.get(e);
  if (!c) {
    c = cajaDe(e);
    cajas.set(e, c);
  }
  return c;
}

export function unirCajas(cajas: readonly Caja2D[]): Caja2D | null {
  if (cajas.length === 0) return null;
  return {
    x0: Math.min(...cajas.map((c) => c.x0)),
    y0: Math.min(...cajas.map((c) => c.y0)),
    x1: Math.max(...cajas.map((c) => c.x1)),
    y1: Math.max(...cajas.map((c) => c.y1)),
  };
}

export function cajasSeCruzan(a: Caja2D, b: Caja2D): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}

// --- Flecha ---------------------------------------------------------------

export function largoPunta(grosor: number): number {
  return Math.max(0.09, grosor * 4.5);
}

/** Vértices del triángulo de la punta (en `b`) y el punto donde termina el cuerpo de la línea. */
export function geometriaPunta(l: Linea): { cola: Punto; izq: Punto; der: Punto; base: Punto } {
  const dx = l.b.x - l.a.x;
  const dy = l.b.y - l.a.y;
  const largo = Math.hypot(dx, dy) || 1;
  const ux = dx / largo;
  const uy = dy / largo;
  const L = Math.min(largoPunta(l.grosor), largo);
  const ancho = L * 0.42;
  const base = { x: l.b.x - ux * L, y: l.b.y - uy * L };
  return {
    cola: l.b,
    base,
    izq: { x: base.x - uy * ancho, y: base.y + ux * ancho },
    der: { x: base.x + uy * ancho, y: base.y - ux * ancho },
  };
}

// --- Detección de contacto (borrador) -------------------------------------

function distSegmento(p: Punto, a: Punto, b: Punto): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** ¿El borrador de radio `radio` (m) centrado en `p` toca al elemento? Formas: solo el contorno. */
export function tocaElemento(e: Elemento, p: Punto, radio: number): boolean {
  switch (e.tipo) {
    case 'trazo': {
      const pts = puntosDe(e);
      const r = radio + e.grosor / 2;
      if (pts.length === 1) return Math.hypot(p.x - pts[0]!.x, p.y - pts[0]!.y) <= r;
      for (let i = 0; i + 1 < pts.length; i++) if (distSegmento(p, pts[i]!, pts[i + 1]!) <= r) return true;
      return false;
    }
    case 'linea':
    case 'flecha':
      return distSegmento(p, e.a, e.b) <= radio + e.grosor / 2;
    case 'rect': {
      const { x0, y0, x1, y1 } = envolver([e.a, e.b], 0);
      const r = radio + e.grosor / 2;
      const esq = [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ] as const;
      return [0, 1, 2, 3].some((i) => distSegmento(p, esq[i]!, esq[(i + 1) % 4]!) <= r);
    }
    case 'elipse': {
      const { x0, y0, x1, y1 } = envolver([e.a, e.b], 0);
      const rx = (x1 - x0) / 2;
      const ry = (y1 - y0) / 2;
      const dx = p.x - (x0 + x1) / 2;
      const dy = p.y - (y0 + y1) / 2;
      // Distancia radial aproximada al contorno (suficiente para un borrador).
      const k = Math.hypot(dx / (rx || 1e-9), dy / (ry || 1e-9));
      const escalaMin = Math.min(rx, ry);
      return Math.abs(k - 1) * escalaMin <= radio + e.grosor / 2;
    }
    case 'texto':
    case 'imagen': {
      const c = cajaDe(e);
      return p.x >= c.x0 - radio && p.x <= c.x1 + radio && p.y >= c.y0 - radio && p.y <= c.y1 + radio;
    }
  }
}
