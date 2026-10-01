import type { ColorResaltador, ColorTinta, Elemento } from './elementos';
import { CLARO, colorDeRol, FAMILIA_DE_ROL, type PaletaTema } from '../ui/tokens';

/** Fluorescentes: mismo tono en los dos temas. */
export const COLOR_RESALTADOR: Readonly<Record<ColorResaltador, string>> = {
  luzAmarillo: '#FFE600',
  luzNaranja: '#FF9F1C',
  luzRosa: '#FF4FA3',
  luzVerde: '#3DDC60',
  luzCeleste: '#29C5FF',
};

/** Color real de un rol de tinta en una paleta (la "tinta" normal es el color de texto del tema). */
export function colorDeTinta(paleta: PaletaTema, color: ColorTinta): string {
  if (color === 'tinta') return paleta.texto;
  if (color in COLOR_RESALTADOR) return COLOR_RESALTADOR[color as ColorResaltador];
  return paleta.familias[color as keyof PaletaTema['familias']];
}

export interface OpcionColor {
  clave: ColorTinta;
  etiqueta: string;
}

/** Etiquetas para la barra: no dependen solo del color (nombre + rol físico típico). */
export const OPCIONES_COLOR: readonly OpcionColor[] = [
  { clave: 'tinta', etiqueta: 'Tinta' },
  { clave: 'campo', etiqueta: 'Rojo · peso' },
  { clave: 'contacto', etiqueta: 'Azul · normal, tensión' },
  { clave: 'disipacion', etiqueta: 'Violeta · roce' },
  { clave: 'movimiento', etiqueta: 'Verde · velocidad, aceleración' },
  { clave: 'acento', etiqueta: 'Ámbar · resultado' },
  { clave: 'neutro', etiqueta: 'Gris · datos' },
];

export const OPCIONES_RESALTADOR: readonly OpcionColor[] = [
  { clave: 'luzAmarillo', etiqueta: 'Amarillo fluorescente' },
  { clave: 'luzNaranja', etiqueta: 'Naranja fluorescente' },
  { clave: 'luzRosa', etiqueta: 'Rosa fluorescente' },
  { clave: 'luzVerde', etiqueta: 'Verde fluorescente' },
  { clave: 'luzCeleste', etiqueta: 'Celeste fluorescente' },
];

export const PALETA_EXPORTACION: PaletaTema = CLARO;

/** Color con el que se dibuja un elemento: tinta, o el del rol físico si es un vector. */
export function colorDeElemento(paleta: PaletaTema, e: Elemento): string {
  if (e.tipo === 'imagen') return paleta.texto;
  if (e.tipo === 'vector') return colorDeRol(paleta, e.rol);
  return colorDeTinta(paleta, e.color);
}

/** Clave de color (para definirlo en TikZ): la tinta del elemento o la familia del rol del vector. */
export function claveColor(e: Elemento): ColorTinta | null {
  if (e.tipo === 'imagen') return null;
  if (e.tipo === 'vector') return FAMILIA_DE_ROL[e.rol] as ColorTinta;
  return e.color;
}
