// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Bloque, Cuerda, Elemento, Superficie } from '../src/core/elementos';
import { alinear, alRejilla, cajaGeometrica, distribuir, duplicar, rotar } from '../src/grafo/disponer';
import { crearMontaje } from '../src/grafo/montajes';
import { validar } from '../src/grafo/validar';
import { crearBloque, crearEsfera, crearSuperficie } from '../src/physics/objetos';

const b = (x: number, y: number, id: string, ancho = 0.5): Bloque => crearBloque({ x, y }, ancho, 0.4, { id });

describe('alinear y distribuir', () => {
  const sel = [b(0, 0, 'a'), b(2, 1, 'b', 1), crearEsfera({ x: -1, y: 3 }, 0.25, { id: 'e' })];

  it('por la izquierda, el centro o abajo, con la caja del conjunto como referencia', () => {
    const izq = alinear(sel, 'izq');
    for (const e of izq) expect(cajaGeometrica(e).x0).toBeCloseTo(-1.25, 9);
    expect(izq.map((e) => e.id).sort()).toEqual(['a', 'b']); // la esfera ya estaba en el borde
    const abajo = alinear(sel, 'abajo');
    for (const e of abajo) expect(cajaGeometrica(e).y0).toBeCloseTo(-0.2, 9);
    const centro = alinear(sel, 'centro-h');
    const cx = (-1.25 + 2.5) / 2;
    for (const e of centro) expect((cajaGeometrica(e).x0 + cajaGeometrica(e).x1) / 2).toBeCloseTo(cx, 9);
  });

  it('distribuir: los del medio quedan a igual distancia; los extremos no se mueven', () => {
    const tres = [b(0, 0, 'a'), b(0.5, 0, 'b'), b(3, 0, 'c')];
    const d = distribuir(tres, 'horizontal');
    expect(d).toHaveLength(1);
    expect(d[0]!.tipo === 'bloque' && d[0]!.centro.x).toBeCloseTo(1.5, 9);
    expect(distribuir(tres.slice(0, 2), 'horizontal')).toEqual([]);
  });
});

describe('rotar', () => {
  it('un bloque gira sobre sí mismo; una superficie, en torno a su punto medio', () => {
    const [r] = rotar([b(1, 1, 'a')], Math.PI / 12) as [Bloque];
    expect(r.angulo).toBeCloseTo(Math.PI / 12, 4);
    expect(r.centro).toEqual({ x: 1, y: 1 });
    const s = crearSuperficie({ x: -1, y: 0 }, { x: 1, y: 0 }, { id: 's' });
    const [g] = rotar([s], Math.PI / 2) as [Superficie];
    expect(g.a.x).toBeCloseTo(0, 9);
    expect(g.a.y).toBeCloseTo(-1, 9);
  });
});

describe('duplicar', () => {
  it('un Atwood duplicado queda conectado consigo mismo (ids nuevos) y no tiene problemas', () => {
    const at = crearMontaje('atwood', { x: 0, y: 0 }, []);
    const copia = duplicar(at, { x: 3, y: 0 });
    const ids = new Set(at.map((e) => e.id));
    for (const e of copia) expect(ids.has(e.id)).toBe(false);
    const cuerda = copia.find((e): e is Cuerda => e.tipo === 'cuerda')!;
    const nuevos = new Set(copia.map((e) => e.id));
    for (const u of cuerda.union!) expect(u && 'el' in u && nuevos.has(u.el)).toBe(true);
    expect(nuevos.has(cuerda.ruta![0]!.el)).toBe(true);
    expect(validar([...at, ...copia] as Elemento[])).toEqual([]);
  });

  it('una copia sola de un bloque apoyado sigue apoyada en el mismo piso', () => {
    const piso = crearSuperficie({ x: -3, y: 0 }, { x: 3, y: 0 }, { id: 'piso' });
    const bl = { ...b(0, 0.2, 'b1'), apoyo: ['piso'] };
    const [c] = duplicar([bl], { x: 1, y: 0 }) as [Bloque];
    expect(c.apoyo).toEqual(['piso']);
    expect(c.centro).toEqual({ x: 1, y: 0.2 });
    void piso;
  });
});

describe('rejilla', () => {
  it('lleva centros y extremos a múltiplos del paso', () => {
    expect((alRejilla(b(0.137, 0.26, 'a'), 0.1) as Bloque).centro).toEqual({ x: 0.1, y: 0.3 });
    const s = alRejilla(crearSuperficie({ x: -1.04, y: 0.06 }, { x: 1.96, y: 0.01 }), 0.1);
    expect([s.a, s.b]).toEqual([
      { x: -1, y: 0.1 },
      { x: 2, y: 0 },
    ]);
  });
});
