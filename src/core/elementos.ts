import type { RolFisico } from '../ui/tokens';
import type { Punto } from './camara';
import { componerLinea } from './matematica';

/**
 * Elementos de la escena. Todo en coordenadas del mundo (metros, y hacia arriba):
 * el zoom no degrada nada y el grosor escala con la vista, como tinta en una pizarra real.
 *
 * El color no es un hex: es un rol de tinta que cada tema resuelve (la tinta "normal"
 * es negra en el tema claro y blanca en el oscuro). Así la pizarra se ve bien en ambos
 * temas y las exportaciones salen siempre con la paleta clara.
 */

export const COLORES_TINTA = ['tinta', 'campo', 'contacto', 'disipacion', 'movimiento', 'acento', 'neutro'] as const;
/** Colores fluorescentes del resaltador: iguales en ambos temas (se superponen con transparencia). */
export const COLORES_RESALTADOR = ['luzAmarillo', 'luzNaranja', 'luzRosa', 'luzVerde', 'luzCeleste'] as const;
export type ColorResaltador = (typeof COLORES_RESALTADOR)[number];
export type ColorTinta = (typeof COLORES_TINTA)[number] | ColorResaltador;

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

/** Sistema de referencia: dos ejes perpendiculares, rotable (para planos inclinados). */
export interface Ejes extends Base {
  tipo: 'ejes';
  origen: Punto;
  /** Ángulo del eje x respecto del horizontal, en radianes (antihorario). */
  angulo: number;
  /** Largo de cada semieje positivo, en metros. */
  largo: number;
  grosor: number;
  etiquetaX: string;
  etiquetaY: string;
}

/**
 * Vector físico. La geometría (a → b) está en metros de pizarra; el valor físico es
 * `largo × porMetro` (por ejemplo, 10 N por cada metro de flecha). El color sale del rol.
 */
export interface Vector {
  id: string;
  tipo: 'vector';
  rol: RolFisico;
  a: Punto;
  b: Punto;
  grosor: number;
  /** Etiqueta en LaTeX (sin los `$`), por ejemplo `\vec{N}`. */
  etiqueta: string;
  unidad: string;
  /** Unidades físicas por metro de flecha. */
  porMetro: number;
  mostrarValor: boolean;
  /** Dibuja las componentes respecto de `ref`. */
  componentes: boolean;
  /** Marca el ángulo entre el eje x de `ref` y el vector. */
  angulo: boolean;
  etiquetaAngulo: string;
  /** Id de unos ejes (sistema de referencia); `null` = los ejes de la pizarra (horizontal y vertical). */
  ref: string | null;
  /** Copia punteada para el polígono de suma (punta con cola). */
  fantasma: boolean;
  /** Dónde va la etiqueta: al costado, a media flecha (por defecto), o pasada la punta. */
  etiquetaEn?: 'medio' | 'punta';
}

/** Cuerpo rectangular con masa. `angulo` lo gira alrededor de su centro (radianes, antihorario). */
export interface Bloque extends Base {
  tipo: 'bloque';
  centro: Punto;
  ancho: number;
  alto: number;
  angulo: number;
  /** Masa en kg. */
  masa: number;
  /** Etiqueta en LaTeX (sin `$`), por ejemplo `m_1`. */
  etiqueta: string;
}

export interface Esfera extends Base {
  tipo: 'esfera';
  centro: Punto;
  radio: number;
  masa: number;
  etiqueta: string;
}

/** Superficie de apoyo (suelo, plano inclinado, pared) con sus coeficientes de roce. */
export interface Superficie extends Base {
  tipo: 'superficie';
  a: Punto;
  b: Punto;
  muS: number;
  muK: number;
  /** `achurado`: rayitas del lado de abajo; `cuna`: relleno de triángulo (plano inclinado); `ninguno`. */
  relleno: 'achurado' | 'cuna' | 'ninguno';
  grosor: number;
}

/** Polea ideal: sin masa ni roce; solo cambia la dirección de la cuerda. */
export interface Polea extends Base {
  tipo: 'polea';
  centro: Punto;
  radio: number;
  grosor: number;
}

/** Cuerda ideal: inextensible y sin masa (un segmento recto entre dos puntos). */
export interface Cuerda extends Base {
  tipo: 'cuerda';
  a: Punto;
  b: Punto;
  grosor: number;
}

/** Resorte ideal: fuerza `k (largo − largoNatural)`. */
export interface Resorte extends Base {
  tipo: 'resorte';
  a: Punto;
  b: Punto;
  /** Constante elástica en N/m. */
  k: number;
  /** Largo natural en metros. */
  largoNatural: number;
  espiras: number;
  grosor: number;
}

export type Elemento = Trazo | Linea | Caja | Texto | Imagen | Ejes | Vector | Bloque | Esfera | Superficie | Polea | Cuerda | Resorte;

/** Los cuatro vértices del bloque girado. */
export function esquinasBloque(b: Bloque): [Punto, Punto, Punto, Punto] {
  const c = Math.cos(b.angulo);
  const s = Math.sin(b.angulo);
  const hx = b.ancho / 2;
  const hy = b.alto / 2;
  const v = (x: number, y: number): Punto => ({ x: b.centro.x + x * c - y * s, y: b.centro.y + x * s + y * c });
  return [v(-hx, -hy), v(hx, -hy), v(hx, hy), v(-hx, hy)];
}

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
  const ancho = Math.max(1 * ANCHO_CARACTER, ...lineas.map((l) => componerLinea(l).ancho));
  return { ancho: ancho * t.tam, alto: lineas.length * INTERLINEADO * t.tam };
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
    case 'ejes': {
      const [px, py] = extremosEjes(e);
      return envolver([e.origen, px.pos, px.neg, py.pos, py.neg], 0.35);
    }
    case 'vector': {
      const g = Math.max(0.09, e.grosor * 4.5);
      // Margen amplio: caben la etiqueta, las componentes y el arco, que se dibujan alrededor.
      return envolver([e.a, e.b], g + 0.45 + (e.componentes || e.angulo ? 0.3 : 0));
    }
    case 'bloque':
      return envolver(esquinasBloque(e), 0.03);
    case 'esfera':
      return envolver([{ x: e.centro.x - e.radio, y: e.centro.y - e.radio }, { x: e.centro.x + e.radio, y: e.centro.y + e.radio }], 0.03);
    case 'polea':
      return envolver([{ x: e.centro.x - e.radio, y: e.centro.y - e.radio }, { x: e.centro.x + e.radio, y: e.centro.y + e.radio }], 0.06);
    case 'superficie':
      return envolver([e.a, e.b], e.relleno === 'ninguno' ? 0.05 : 0.4);
    case 'cuerda':
      return envolver([e.a, e.b], e.grosor + 0.03);
    case 'resorte':
      return envolver([e.a, e.b], 0.14);
  }
}

/** Extremos de los dos ejes (positivo y negativo), en metros. */
export function extremosEjes(e: Ejes): [{ pos: Punto; neg: Punto }, { pos: Punto; neg: Punto }] {
  const c = Math.cos(e.angulo);
  const s = Math.sin(e.angulo);
  const neg = e.largo * 0.25;
  const ejeX = { pos: { x: e.origen.x + c * e.largo, y: e.origen.y + s * e.largo }, neg: { x: e.origen.x - c * neg, y: e.origen.y - s * neg } };
  const ejeY = { pos: { x: e.origen.x - s * e.largo, y: e.origen.y + c * e.largo }, neg: { x: e.origen.x + s * neg, y: e.origen.y - c * neg } };
  return [ejeX, ejeY];
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
export function geometriaPunta(l: { a: Punto; b: Punto; grosor: number }): { cola: Punto; izq: Punto; der: Punto; base: Punto } {
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
    case 'vector':
      return distSegmento(p, e.a, e.b) <= radio + e.grosor / 2 + 0.01;
    case 'ejes': {
      const [x, y] = extremosEjes(e);
      const r = radio + e.grosor / 2 + 0.01;
      return distSegmento(p, x.neg, x.pos) <= r || distSegmento(p, y.neg, y.pos) <= r;
    }
    case 'bloque': {
      // Se pasa el punto al sistema del bloque (sin girar) y se ve si cae dentro, con margen.
      const dx = p.x - e.centro.x;
      const dy = p.y - e.centro.y;
      const c = Math.cos(-e.angulo);
      const s = Math.sin(-e.angulo);
      const lx = dx * c - dy * s;
      const ly = dx * s + dy * c;
      return Math.abs(lx) <= e.ancho / 2 + radio && Math.abs(ly) <= e.alto / 2 + radio;
    }
    case 'esfera':
    case 'polea':
      return Math.hypot(p.x - e.centro.x, p.y - e.centro.y) <= e.radio + radio;
    case 'superficie':
      return distSegmento(p, e.a, e.b) <= radio + e.grosor / 2 + 0.03;
    case 'cuerda':
      return distSegmento(p, e.a, e.b) <= radio + e.grosor / 2 + 0.02;
    case 'resorte':
      return distSegmento(p, e.a, e.b) <= radio + 0.08;
  }
}

/** Mueve un elemento (dx, dy) metros. Devuelve uno nuevo: los elementos son inmutables. */
export function trasladar<T extends Elemento>(e: T, dx: number, dy: number): T {
  const mv = (p: Punto): Punto => ({ x: redondear4(p.x + dx), y: redondear4(p.y + dy) });
  switch (e.tipo) {
    case 'trazo': {
      const puntos = e.puntos.slice();
      for (let i = 0; i + 1 < puntos.length; i += 3) {
        puntos[i] = redondear4(puntos[i]! + dx);
        puntos[i + 1] = redondear4(puntos[i + 1]! + dy);
      }
      return { ...e, puntos };
    }
    case 'linea':
    case 'flecha':
    case 'rect':
    case 'elipse':
    case 'vector':
    case 'superficie':
    case 'cuerda':
    case 'resorte':
      return { ...e, a: mv(e.a), b: mv(e.b) };
    case 'bloque':
    case 'esfera':
    case 'polea':
      return { ...e, centro: mv(e.centro) };
    case 'texto':
    case 'imagen':
      return { ...e, pos: mv(e.pos) };
    case 'ejes':
      return { ...e, origen: mv(e.origen) };
  }
}

const redondear4 = (n: number): number => Math.round(n * 1e4) / 1e4;
