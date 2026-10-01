import type { Punto } from './camara';
import type { Reductores } from './store';

/**
 * Escena de la Etapa 0: solo "marcas" de demostración, para probar el registro
 * de ops, deshacer/rehacer y la cámara. Desde la Etapa 1 aquí viven los trazos.
 * Las coordenadas están en el mundo (metros).
 */
export interface Escena {
  marcas: Punto[];
}

export const OP_MARCA = 'demo/marca';

export const escenaInicial = (): Escena => ({ marcas: [] });

export const reductoresEscena: Reductores<Escena> = {
  [OP_MARCA]: (e, p: Punto) => ({ ...e, marcas: [...e.marcas, p] }),
};
