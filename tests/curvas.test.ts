// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { arcoDe, barridoPorPunto, distanciaATramo, marcoTramo, medioTramo, puntoEnTramo } from '../src/physics/curvas';

describe('geometría de las superficies curvas', () => {
  // Valle: semicircunferencia antihoraria de (−1, 0) a (1, 0) por abajo, centro (0, 0), radio 1
  const valle = { a: { x: -1, y: 0 }, b: { x: 1, y: 0 }, barrido: Math.PI };

  it('el arco tiene el centro y el radio que corresponden', () => {
    const arco = arcoDe(valle)!;
    expect(arco.c.x).toBeCloseTo(0, 12);
    expect(arco.c.y).toBeCloseTo(0, 12);
    expect(arco.r).toBeCloseTo(1, 12);
    expect(arco.largo).toBeCloseTo(Math.PI, 12);
    // Antihorario de (−1, 0): baja por el fondo (0, −1)
    expect(medioTramo(valle).y).toBeCloseTo(-1, 12);
    expect(arcoDe({ ...valle, barrido: 0 })).toBeNull();
  });

  it('el marco: normal hacia el centro (el lado del cuerpo), u a lo largo y d con signo', () => {
    const m = marcoTramo(valle, { x: 0, y: -0.75 });
    expect(m.u).toBeCloseTo(Math.PI / 2, 12);
    expect(m.d).toBeCloseTo(0.25, 12); // dentro del valle, a 25 cm del fondo
    expect(m.n.y).toBeCloseTo(1, 12);
    expect(m.t.x).toBeCloseTo(1, 12); // avanza hacia la derecha en el fondo
    // Fuera del arco: antes de a o después de b
    expect(marcoTramo(valle, { x: -1.2, y: 0.3 }).u).toBeLessThan(0);
    expect(marcoTramo(valle, { x: 1.2, y: 0.3 }).u).toBeGreaterThan(Math.PI);
  });

  it('con un punto de paso se obtiene el barrido, y la recta es el caso límite', () => {
    expect(barridoPorPunto(valle.a, valle.b, { x: 0, y: -1 })).toBeCloseTo(Math.PI, 12);
    expect(barridoPorPunto(valle.a, valle.b, { x: 0, y: 1 })).toBeCloseTo(-Math.PI, 12); // loma
    expect(barridoPorPunto(valle.a, valle.b, { x: 0, y: 0.0001 })).toBe(0);
    expect(puntoEnTramo({ ...valle, barrido: 0 }, 0.25)).toEqual({ x: -0.5, y: 0 });
    expect(distanciaATramo(valle, { x: 0, y: -1.1 })).toBeCloseTo(0.1, 12);
  });
});
