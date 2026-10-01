import type { Elemento } from './elementos';
import type { Reductores } from './store';

/**
 * Escena: lista ordenada de elementos (el último se dibuja encima).
 * Cambia solo por ops: agregar y borrar. Borrar es una op normal, así que se puede deshacer.
 */
export interface Escena {
  elementos: Elemento[];
}

export const OP_AGREGAR = 'elemento/agregar';
export const OP_BORRAR = 'elemento/borrar';

export interface BorrarPayload {
  ids: string[];
}

export const escenaInicial = (): Escena => ({ elementos: [] });

export const reductoresEscena: Reductores<Escena> = {
  [OP_AGREGAR]: (e, p: Elemento) => ({ elementos: [...e.elementos, p] }),
  [OP_BORRAR]: (e, p: BorrarPayload) => {
    const fuera = new Set(p.ids);
    return { elementos: e.elementos.filter((el) => !fuera.has(el.id)) };
  },
};
