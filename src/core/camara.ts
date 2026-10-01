/**
 * Cámara: relaciona el mundo (metros, eje y hacia arriba) con la pantalla
 * (píxeles, eje y hacia abajo). Funciones puras, sin DOM.
 */

export interface Camara {
  /** Punto del mundo (m) que queda en el centro de la vista. */
  cx: number;
  cy: number;
  /** Píxeles por metro. */
  escala: number;
}

export interface Vista {
  ancho: number;
  alto: number;
}

export interface Punto {
  x: number;
  y: number;
}

export const ESCALA_MIN = 5;
export const ESCALA_MAX = 5000;
export const camaraInicial = (): Camara => ({ cx: 0, cy: 0, escala: 100 });

export function mundoAPantalla(c: Camara, v: Vista, p: Punto): Punto {
  return {
    x: v.ancho / 2 + (p.x - c.cx) * c.escala,
    y: v.alto / 2 - (p.y - c.cy) * c.escala,
  };
}

export function pantallaAMundo(c: Camara, v: Vista, p: Punto): Punto {
  return {
    x: c.cx + (p.x - v.ancho / 2) / c.escala,
    y: c.cy - (p.y - v.alto / 2) / c.escala,
  };
}

/** Desplaza la cámara según un arrastre en píxeles (el mundo sigue al dedo). */
export function desplazar(c: Camara, dxPx: number, dyPx: number): Camara {
  return { ...c, cx: c.cx - dxPx / c.escala, cy: c.cy + dyPx / c.escala };
}

/** Zoom multiplicativo manteniendo fijo el punto de pantalla `ancla`. */
export function acercarEn(c: Camara, v: Vista, ancla: Punto, factor: number): Camara {
  const escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, c.escala * factor));
  const antes = pantallaAMundo(c, v, ancla);
  const despues = pantallaAMundo({ ...c, escala }, v, ancla);
  return { escala, cx: c.cx + (antes.x - despues.x), cy: c.cy + (antes.y - despues.y) };
}
