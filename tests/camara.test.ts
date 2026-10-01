import { describe, expect, it } from 'vitest';
import {
  acercarEn,
  camaraInicial,
  desplazar,
  ESCALA_MAX,
  ESCALA_MIN,
  mundoAPantalla,
  pantallaAMundo,
} from '../src/core/camara';

const vista = { ancho: 800, alto: 600 };

describe('cámara', () => {
  it('el centro del mundo cae en el centro de la vista, con y hacia arriba', () => {
    const c = { cx: 2, cy: 3, escala: 50 };
    expect(mundoAPantalla(c, vista, { x: 2, y: 3 })).toEqual({ x: 400, y: 300 });
    // 1 m a la derecha y 1 m hacia arriba: x aumenta, y de pantalla disminuye.
    expect(mundoAPantalla(c, vista, { x: 3, y: 4 })).toEqual({ x: 450, y: 250 });
  });

  it('pantallaAMundo es la inversa de mundoAPantalla', () => {
    const c = { cx: -1.5, cy: 0.7, escala: 137 };
    const p = { x: 3.2, y: -4.1 };
    const q = pantallaAMundo(c, vista, mundoAPantalla(c, vista, p));
    expect(q.x).toBeCloseTo(p.x, 12);
    expect(q.y).toBeCloseTo(p.y, 12);
  });

  it('desplazar hace que el mundo siga al puntero', () => {
    const c = camaraInicial();
    const antes = mundoAPantalla(c, vista, { x: 1, y: 1 });
    const c2 = desplazar(c, 30, -20);
    const despues = mundoAPantalla(c2, vista, { x: 1, y: 1 });
    expect(despues.x - antes.x).toBeCloseTo(30, 10);
    expect(despues.y - antes.y).toBeCloseTo(-20, 10);
  });

  it('el zoom mantiene fijo el punto bajo el cursor', () => {
    const c = { cx: 0.4, cy: -0.2, escala: 100 };
    const ancla = { x: 123, y: 456 };
    const mundoAntes = pantallaAMundo(c, vista, ancla);
    const c2 = acercarEn(c, vista, ancla, 2.5);
    const mundoDespues = pantallaAMundo(c2, vista, ancla);
    expect(c2.escala).toBeCloseTo(250, 10);
    expect(mundoDespues.x).toBeCloseTo(mundoAntes.x, 10);
    expect(mundoDespues.y).toBeCloseTo(mundoAntes.y, 10);
  });

  it('la escala se limita a [ESCALA_MIN, ESCALA_MAX]', () => {
    const c = camaraInicial();
    expect(acercarEn(c, vista, { x: 0, y: 0 }, 1e9).escala).toBe(ESCALA_MAX);
    expect(acercarEn(c, vista, { x: 0, y: 0 }, 1e-9).escala).toBe(ESCALA_MIN);
  });
});
