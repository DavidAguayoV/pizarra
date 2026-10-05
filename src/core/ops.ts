/**
 * Registro de operaciones (ops).
 *
 * Todo cambio en la pizarra es una op en un registro append-only. El estado
 * actual es el resultado de reducir las ops "activas". Deshacer y rehacer son
 * también ops (meta-ops) que se agregan al registro, nunca lo editan; así el
 * mismo registro sirve para guardar, transmitir y reproducir.
 */

export interface Op<P = unknown> {
  id: string;
  /** Marca de tiempo en ms (epoch). */
  t: number;
  autor: string;
  tipo: string;
  payload: P;
}

export const OP_DESHACER = 'core/deshacer';
export const OP_REHACER = 'core/rehacer';

export interface ObjetivoPayload {
  /** id de la op afectada. */
  objetivo: string;
}

/**
 * Ops normales que **no se deshacen** (la pila de deshacer las salta y no vacían la de rehacer). Hoy, solo la
 * migración de un proyecto de la v1: deshacerla dejaría la escena sin sus uniones.
 */
export const TIPOS_NO_DESHACIBLES: ReadonlySet<string> = new Set(['escena/migracion']);

export function esDeshacible(op: Op): boolean {
  return !esMeta(op) && !TIPOS_NO_DESHACIBLES.has(op.tipo);
}

export function esMeta(op: Op): boolean {
  return op.tipo === OP_DESHACER || op.tipo === OP_REHACER;
}

/** Ids de las ops normales actualmente deshechas. */
function deshechas(registro: readonly Op[]): Set<string> {
  const set = new Set<string>();
  for (const op of registro) {
    if (op.tipo === OP_DESHACER) set.add((op.payload as ObjetivoPayload).objetivo);
    else if (op.tipo === OP_REHACER) set.delete((op.payload as ObjetivoPayload).objetivo);
  }
  return set;
}

/** Ops normales vigentes (no deshechas), en orden de registro. */
export function opsActivas(registro: readonly Op[]): Op[] {
  const fuera = deshechas(registro);
  return registro.filter((op) => !esMeta(op) && !fuera.has(op.id));
}

/**
 * Pila de rehacer derivada del registro: deshacer apila, rehacer desapila y
 * cualquier op normal nueva la vacía. Al ser función pura del registro, un
 * espectador que reproduce las ops obtiene exactamente la misma pila.
 */
export function pilaRehacer(registro: readonly Op[]): string[] {
  const pila: string[] = [];
  for (const op of registro) {
    if (op.tipo === OP_DESHACER) pila.push((op.payload as ObjetivoPayload).objetivo);
    else if (op.tipo === OP_REHACER) pila.pop();
    else if (!TIPOS_NO_DESHACIBLES.has(op.tipo)) pila.length = 0;
  }
  return pila;
}
