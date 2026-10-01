import type { ColorTinta } from './elementos';
import { CLARO, type PaletaTema } from '../ui/tokens';

/** Color real de un rol de tinta en una paleta (la "tinta" normal es el color de texto del tema). */
export function colorDeTinta(paleta: PaletaTema, color: ColorTinta): string {
  return color === 'tinta' ? paleta.texto : paleta.familias[color];
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

export const PALETA_EXPORTACION: PaletaTema = CLARO;
