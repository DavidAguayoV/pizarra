import type { Punto } from '../core/camara';
import type { Caja, ColorTinta, Elemento, Imagen, Linea, Texto, Trazo } from '../core/elementos';
import { nuevoIdElemento } from '../core/elementos';

export const HERRAMIENTAS = ['lapiz', 'resaltador', 'borrador', 'linea', 'flecha', 'rect', 'elipse', 'texto', 'mano'] as const;
export type Herramienta = (typeof HERRAMIENTAS)[number];

export interface DefHerramienta {
  clave: Herramienta;
  etiqueta: string;
  atajo: string;
}

export const DEFS_HERRAMIENTAS: readonly DefHerramienta[] = [
  { clave: 'lapiz', etiqueta: 'Lápiz', atajo: 'P' },
  { clave: 'resaltador', etiqueta: 'Resaltador', atajo: 'H' },
  { clave: 'borrador', etiqueta: 'Borrador', atajo: 'B' },
  { clave: 'linea', etiqueta: 'Línea', atajo: 'L' },
  { clave: 'flecha', etiqueta: 'Flecha', atajo: 'F' },
  { clave: 'rect', etiqueta: 'Rectángulo', atajo: 'R' },
  { clave: 'elipse', etiqueta: 'Elipse', atajo: 'O' },
  { clave: 'texto', etiqueta: 'Texto', atajo: 'T' },
  { clave: 'mano', etiqueta: 'Mover vista', atajo: 'M' },
];

/** Rango del deslizador de grosor (metros). Escala logarítmica: más fino donde importa. */
export interface RangoGrosor {
  min: number;
  max: number;
  /** Posición inicial del deslizador, de 0 a 100. */
  inicial: number;
}
export const RANGO_TINTA: RangoGrosor = { min: 0.004, max: 0.12, inicial: 41 };
export const RANGO_RESALTADOR: RangoGrosor = { min: 0.03, max: 0.3, inicial: 33 };
export const POSICIONES_ATAJO = [18, 41, 70] as const;

/** Posición del deslizador (0 a 100) → grosor en metros. */
export function grosorDePosicion(pos: number, r: RangoGrosor): number {
  const t = Math.min(100, Math.max(0, pos)) / 100;
  return Math.round(r.min * (r.max / r.min) ** t * 1e4) / 1e4;
}

/** Alto de letra (m) que acompaña a un grosor de tinta. */
export function tamTextoDeGrosor(grosor: number): number {
  return Math.round((0.1 + 4.5 * grosor) * 1e3) / 1e3;
}
/** Radio del borrador en píxeles de pantalla. */
export const RADIO_BORRADOR_PX = 14;

export const PRESION_NEUTRA = 0.5;

/** Presión del lápiz → factor de grosor. Con 0,5 (mouse) vale exactamente 1. */
export function factorPresion(p: number): number {
  return 0.4 + 1.2 * p;
}

/** Grosor medio de un trazo (promedia la presión): lo usan SVG y TikZ, que no varían el grosor. */
export function grosorMedio(t: Trazo): number {
  if (t.resaltador) return t.grosor;
  let suma = 0;
  let k = 0;
  for (let i = 2; i < t.puntos.length; i += 3) {
    suma += t.puntos[i]!;
    k++;
  }
  return t.grosor * factorPresion(k ? suma / k : PRESION_NEUTRA);
}

const redondear = (n: number): number => Math.round(n * 1e4) / 1e4;

export function crearTrazo(puntos: number[], color: ColorTinta, grosor: number, resaltador: boolean): Trazo {
  return {
    id: nuevoIdElemento(),
    tipo: 'trazo',
    color,
    grosor,
    puntos: puntos.map(redondear),
    resaltador,
  };
}

export type TipoForma = 'linea' | 'flecha' | 'rect' | 'elipse';

/** Fuerza líneas a múltiplos de 45° y cajas a cuadrado/círculo (con Shift). */
export function restringir(tipo: TipoForma, a: Punto, b: Punto): Punto {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (tipo === 'rect' || tipo === 'elipse') {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: a.x + Math.sign(dx || 1) * m, y: a.y + Math.sign(dy || 1) * m };
  }
  const paso = Math.PI / 4;
  const ang = Math.round(Math.atan2(dy, dx) / paso) * paso;
  const l = Math.hypot(dx, dy);
  return { x: a.x + Math.cos(ang) * l, y: a.y + Math.sin(ang) * l };
}

export function crearForma(tipo: TipoForma, a: Punto, b: Punto, color: ColorTinta, grosor: number): Linea | Caja {
  const pa = { x: redondear(a.x), y: redondear(a.y) };
  const pb = { x: redondear(b.x), y: redondear(b.y) };
  const base = { id: nuevoIdElemento(), color, grosor };
  return tipo === 'linea' || tipo === 'flecha' ? { ...base, tipo, a: pa, b: pb } : { ...base, tipo, a: pa, b: pb };
}

export function crearTexto(pos: Punto, texto: string, color: ColorTinta, tam: number): Texto {
  return { id: nuevoIdElemento(), tipo: 'texto', color, pos: { x: redondear(pos.x), y: redondear(pos.y) }, texto, tam };
}

export function crearImagen(pos: Punto, ancho: number, alto: number, src: string): Imagen {
  return { id: nuevoIdElemento(), tipo: 'imagen', pos: { x: redondear(pos.x), y: redondear(pos.y) }, ancho, alto, src };
}

/** ¿Vale la pena guardar esta forma? Descarta toques sin arrastre. */
export function formaValida(e: Elemento): boolean {
  if (e.tipo === 'linea' || e.tipo === 'flecha' || e.tipo === 'rect' || e.tipo === 'elipse') {
    return Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) > 1e-3;
  }
  return true;
}
