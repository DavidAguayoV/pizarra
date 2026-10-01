import type { Elemento } from '../src/core/elementos';

/** Un PNG de 1×1 píxel, para probar imágenes sin archivos externos. */
export const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Escena determinista con un elemento de cada tipo (ids fijos). Mide unos 4 × 2,5 m. */
export function escenaEjemplo(): Elemento[] {
  return [
    {
      id: 't1',
      tipo: 'trazo',
      color: 'contacto',
      grosor: 0.026,
      resaltador: false,
      // Un arco suave (x, y, presión) con presión neutra.
      puntos: [0, 0, 0.5, 0.25, 0.2, 0.5, 0.5, 0.35, 0.5, 0.75, 0.4, 0.5, 1, 0.3, 0.5, 1.25, 0.1, 0.5],
    },
    { id: 'h1', tipo: 'trazo', color: 'acento', grosor: 0.1, resaltador: true, puntos: [0, -0.3, 0.5, 1.5, -0.3, 0.5] },
    { id: 'l1', tipo: 'linea', color: 'tinta', grosor: 0.026, a: { x: 0, y: -0.6 }, b: { x: 2, y: -0.6 } },
    { id: 'f1', tipo: 'flecha', color: 'campo', grosor: 0.026, a: { x: 2.5, y: 1 }, b: { x: 2.5, y: 0 } },
    { id: 'r1', tipo: 'rect', color: 'neutro', grosor: 0.012, a: { x: 2.2, y: -0.2 }, b: { x: 3.4, y: 0.6 } },
    { id: 'o1', tipo: 'elipse', color: 'movimiento', grosor: 0.026, a: { x: 3, y: 1 }, b: { x: 4, y: 1.8 } },
    { id: 'x1', tipo: 'texto', color: 'disipacion', pos: { x: 0.2, y: 1.8 }, texto: 'f_k = 5% de N\n$\\vec{F}=m\\vec{a}$', tam: 0.2 },
    { id: 'i1', tipo: 'imagen', pos: { x: 0, y: -1 }, ancho: 0.5, alto: 0.5, src: PNG_1X1 },
  ];
}
