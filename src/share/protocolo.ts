import type { ColorTinta, Elemento } from '../core/elementos';
import type { Op } from '../core/ops';

/**
 * Protocolo para compartir la pizarra en vivo (ver docs/PROTOCOLO_COMPARTIR.md).
 * Un solo emisor (el profesor) y muchos receptores. Todo viaja como ops del registro.
 */

/** Sin 0/O/1/I para que se pueda dictar y leer de la pantalla sin confusión. */
export const ALFABETO_SALA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LARGO_CODIGO = 5;
/** Cada cuántas ops se publica un snapshot completo. */
export const SNAPSHOT_CADA = 50;
/** Los trazos en curso se envían por lotes cada tanto, no punto a punto. */
export const PERIODO_LOTE_MS = 50;
export const PERIODO_VISTA_MS = 120;

export type EstadoConexion = 'conectando' | 'conectado' | 'reconectando' | 'sin-conexion' | 'sin-sala';

export function generarCodigo(azar: () => number = Math.random): string {
  let c = '';
  for (let i = 0; i < LARGO_CODIGO; i++) c += ALFABETO_SALA[Math.floor(azar() * ALFABETO_SALA.length)];
  return c;
}

/** Limpia lo que escribe una persona (minúsculas, espacios, guiones) y valida. null si no sirve. */
export function normalizarCodigo(texto: string): string | null {
  const c = texto.toUpperCase().replace(/[\s-]/g, '');
  if (c.length !== LARGO_CODIGO) return null;
  return [...c].every((ch) => ALFABETO_SALA.includes(ch)) ? c : null;
}

/** Estado completo del registro en un instante. `epoca` cambia cuando se reemplaza la pizarra entera. */
export interface Snapshot {
  epoca: number;
  /** Número de la última op incluida. */
  seq: number;
  ops: Op[];
}

export interface OpMsg {
  epoca: number;
  seq: number;
  op: Op;
}

/** Encuadre del profesor: qué región del mundo ve y en qué tamaño de pantalla. */
export interface VistaMsg {
  cx: number;
  cy: number;
  escala: number;
  ancho: number;
  alto: number;
}

export interface BaseTrazo {
  color: ColorTinta;
  grosor: number;
  resaltador: boolean;
}

/**
 * Lote de un elemento en construcción. Un trazo se envía por incrementos (solo los
 * puntos nuevos desde `desde`); una forma, entera. Un lote sin `el` ni `pts` solo
 * actualiza qué elementos está borrando el borrador.
 */
export interface LoteVivo {
  id: string;
  ocultos: string[];
  el?: Elemento;
  base?: BaseTrazo;
  desde?: number;
  pts?: number[];
}

export function claveSeq(n: number): string {
  return String(n).padStart(8, '0');
}
