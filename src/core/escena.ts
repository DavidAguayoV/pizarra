import type { Elemento } from './elementos';
import type { Reductores } from './store';

/**
 * Escena: lista ordenada de elementos (el último se dibuja encima).
 * Cambia solo por ops. Borrar y editar son ops normales, así que se pueden deshacer.
 */
export interface Escena {
  elementos: Elemento[];
}

export const OP_AGREGAR = 'elemento/agregar';
export const OP_BORRAR = 'elemento/borrar';
/** Varios cambios juntos (agregar, reemplazar y borrar): un solo deshacer los revierte todos. */
export const OP_LOTE = 'elemento/lote';
/**
 * Migración de un proyecto de la v1 (`grafo/migracion.ts`): un lote con las uniones que la v1 deducía por cercanía.
 * Se aplica como un lote corriente, pero no se deshace (`TIPOS_NO_DESHACIBLES`).
 */
export const OP_MIGRACION = 'escena/migracion';

export interface BorrarPayload {
  ids: string[];
}

export interface LotePayload {
  agregar?: Elemento[];
  /** Reemplaza, en su lugar, los elementos que tengan el mismo id. */
  actualizar?: Elemento[];
  borrar?: string[];
}

export const escenaInicial = (): Escena => ({ elementos: [] });

export function aplicarLote(e: Escena, p: LotePayload): Escena {
  const fuera = new Set(p.borrar ?? []);
  const nuevos = new Map((p.actualizar ?? []).map((x) => [x.id, x]));
  const elementos = e.elementos.filter((x) => !fuera.has(x.id)).map((x) => nuevos.get(x.id) ?? x);
  return { elementos: [...elementos, ...(p.agregar ?? [])] };
}

export const reductoresEscena: Reductores<Escena> = {
  [OP_AGREGAR]: (e, p: Elemento) => ({ elementos: [...e.elementos, p] }),
  [OP_BORRAR]: (e, p: BorrarPayload) => aplicarLote(e, { borrar: p.ids }),
  [OP_LOTE]: (e, p: LotePayload) => aplicarLote(e, p),
  [OP_MIGRACION]: (e, p: LotePayload) => aplicarLote(e, p),
};
