// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Bloque, Cuerda, Elemento, Polea } from '../src/core/elementos';
import { resolverEscena } from '../src/grafo/resolver';
import { resolverDcl } from '../src/physics/dcl';
import { crearBloque, crearCuerda, crearPolea, crearSuperficie } from '../src/physics/objetos';
import { construirModelo } from '../src/sim/modelo';
import { Simulacion } from '../src/sim/motor';

const G = 9.8;

function correr(escena: Elemento[], t: number): Simulacion {
  const s = new Simulacion(construirModelo(escena, G), { h: 0.001 });
  for (let k = 0; k < Math.round(t / 0.001); k++) s.paso();
  return s;
}

/**
 * Polea móvil clásica: una cuerda fija al techo en A baja, envuelve por debajo la polea móvil (que lleva a m₂),
 * sube, pasa por arriba de la polea fija y baja hasta m₁. Con la cuerda inextensible a₁ = 2 a₂, y
 *   a₂ = (2 m₁ − m₂) g /(4 m₁ + m₂) (hacia arriba),  T = m₁ (g − a₁).
 */
export function poleaMovil(m1 = 2, m2 = 3): Elemento[] {
  const b2: Bloque = { ...crearBloque({ x: 0, y: 0.45 }, 0.4, 0.4, { id: 'm2', masa: m2, etiqueta: 'm_2' }), apoyo: [] };
  const movil: Polea = { ...crearPolea({ x: 0, y: 1 }, 0.3, { id: 'pm' }), montaje: { el: 'm2', puerto: 'local:0,0.55' } };
  const fija = crearPolea({ x: 0.6, y: 3 }, 0.3, { id: 'pf' });
  const b1: Bloque = { ...crearBloque({ x: 0.9, y: 1.3 }, 0.4, 0.4, { id: 'm1', masa: m1, etiqueta: 'm_1' }), apoyo: [] };
  const cuerda: Cuerda = {
    ...crearCuerda({ x: -0.3, y: 3 }, { x: 0.9, y: 1.5 }, { id: 'c' }),
    union: [{ fijo: true }, { el: 'm1', puerto: 'cara-sup' }],
    ruta: [
      { el: 'pm', sentido: 1 },
      { el: 'pf', sentido: -1 },
    ],
  };
  return [b2, movil, fija, b1, cuerda];
}

describe('polea móvil (montada sobre un cuerpo)', () => {
  it('la polea sigue al cuerpo y se dibuja su horquilla', () => {
    const escena = poleaMovil();
    const r = resolverEscena(escena.map((e) => (e.id === 'm2' ? { ...e, centro: { x: 0.5, y: 0 } } : e) as Elemento)).find((e) => e.id === 'pm') as Polea;
    expect(r.centro.x).toBeCloseTo(0.5, 12);
    expect(r.centro.y).toBeCloseTo(0.55, 12);
    expect(r.soporte).toEqual({ x: 0.5, y: 0.2 });
  });

  it('a₂ = (2m₁ − m₂) g /(4m₁ + m₂), a₁ = 2 a₂ y T = m₁ (g − a₁)', () => {
    const [m1, m2] = [2, 3];
    const s = correr(poleaMovil(m1, m2), 0.4);
    const a2 = ((2 * m1 - m2) * G) / (4 * m1 + m2);
    const i1 = s.modelo.cuerpos.findIndex((c) => c.id === 'm1');
    const i2 = s.modelo.cuerpos.findIndex((c) => c.id === 'm2');
    expect(s.estado.a[i2]!.y).toBeCloseTo(a2, 5);
    expect(s.estado.a[i1]!.y).toBeCloseTo(-2 * a2, 5);
    expect(Math.abs(s.estado.a[i2]!.x)).toBeLessThan(1e-6);
    expect(s.estado.T[0]).toBeCloseTo(m1 * (G - 2 * a2), 4);
    // La energía mecánica se conserva (poleas ideales).
    expect(Math.abs(s.energiaActual().residuo)).toBeLessThan(1e-6);
  });

  it('con 4 m₁ = 2 m₂ … el equilibrio: m₂ = 2 m₁ no se mueve', () => {
    const s = correr(poleaMovil(2, 4), 0.3);
    for (const a of s.estado.a) expect(Math.hypot(a.x, a.y)).toBeLessThan(1e-6);
    expect(s.estado.T[0]).toBeCloseTo(2 * G, 5); // T = m₁ g; 2T = m₂ g
  });

  it('el DCL del cuerpo que lleva la polea muestra las dos tensiones hacia arriba', () => {
    const escena = poleaMovil();
    const d = resolverDcl(escena[0] as Bloque, escena, G);
    const t = d.fuerzas.filter((f) => f.rol === 'tension');
    expect(t).toHaveLength(2);
    for (const f of t) expect(f.angulo).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('cuerda que dobla en el borde de una mesa', () => {
  it('mesa con roce + colgante, sin polea: a = (m₂ − μk m₁) g /(m₁ + m₂)', () => {
    const [m1, m2, muK] = [2, 3, 0.2];
    const mesa = crearSuperficie({ x: -3, y: 0 }, { x: 0, y: 0 }, { id: 'mesa', muS: 0.3, muK });
    const b1: Bloque = { ...crearBloque({ x: -1, y: 0.2 }, 0.4, 0.4, { id: 'm1', masa: m1 }), apoyo: ['mesa'] };
    const b2: Bloque = { ...crearBloque({ x: 0.2, y: -1.2 }, 0.4, 0.4, { id: 'm2', masa: m2 }), apoyo: [] };
    const c: Cuerda = {
      ...crearCuerda({ x: -0.8, y: 0 }, { x: 0, y: -1 }, { id: 'c' }),
      union: [
        { el: 'm1', puerto: 'esq-id' },
        { el: 'm2', puerto: 'esq-si' },
      ],
      ruta: [{ el: 'mesa', sentido: -1, extremo: 'b' }],
    };
    const s = correr([mesa, b1, b2, c], 0.3);
    const a = ((m2 - muK * m1) * G) / (m1 + m2);
    expect(s.estado.a[0]!.x).toBeCloseTo(a, 5);
    expect(s.estado.a[1]!.y).toBeCloseTo(-a, 5);
    expect(s.estado.T[0]).toBeCloseTo(m2 * (G - a), 4);
  });
});
