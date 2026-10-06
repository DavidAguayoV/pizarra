// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Elemento } from '../src/core/elementos';
import { crearMontaje, MONTAJES } from '../src/grafo/montajes';
import { validar } from '../src/grafo/validar';
import { crearBloque } from '../src/physics/objetos';
import { construirModelo } from '../src/sim/modelo';
import { Simulacion } from '../src/sim/motor';

const G = 9.8;

function simular(escena: Elemento[], t: number): Simulacion {
  const s = new Simulacion(construirModelo(escena, G), { h: 0.001 });
  for (let k = 0; k < Math.round(t / 0.001); k++) s.paso();
  return s;
}
const indice = (s: Simulacion, etiqueta: string): number => s.modelo.cuerpos.findIndex((c) => c.elemento.etiqueta === etiqueta);

describe('biblioteca de montajes', () => {
  for (const m of MONTAJES) {
    it(`${m.nombre}: sin problemas en el validador y se simula sin avisos`, () => {
      for (const conRoce of [false, true]) {
        const escena = crearMontaje(m.id, { x: 1.5, y: -0.5 }, [], { conRoce });
        expect(validar(escena), JSON.stringify(validar(escena))).toEqual([]);
        const modelo = construirModelo(escena, G);
        expect(modelo.avisos).toEqual([]);
        const s = simular(escena, 0.3);
        for (const p of s.estado.p) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(Math.abs(s.energiaActual().residuo)).toBeLessThan(1e-6);
      }
    });
  }

  it('Atwood: a = g/5 y T = 2 m₁ m₂ g /(m₁ + m₂)', () => {
    const s = simular(crearMontaje('atwood', { x: 0, y: 0 }, []), 0.3);
    expect(s.estado.a[indice(s, 'm_1')]!.y).toBeCloseTo(G / 5, 6);
    expect(s.estado.T[0]).toBeCloseTo((2 * 2 * 3 * G) / 5, 5);
  });

  it('plano, polea y colgante (sin roce): a = (m₂ − m₁ sen 30°) g /(m₁ + m₂), con el tramo paralelo al plano', () => {
    const s = simular(crearMontaje('plano-polea', { x: 0, y: 0 }, []), 0.3);
    const a = ((3 - 2 * 0.5) * G) / 5;
    expect(s.estado.a[indice(s, 'm_2')]!.y).toBeCloseTo(-a, 3);
    const a1 = s.estado.a[indice(s, 'm_1')]!;
    expect(Math.hypot(a1.x, a1.y)).toBeCloseTo(a, 3);
  });

  it('mesa, polea y colgante: a = m₂ g /(m₁ + m₂); con roce, (m₂ − μk m₁) g /(m₁ + m₂)', () => {
    const s = simular(crearMontaje('mesa-polea', { x: 0, y: 0 }, []), 0.3);
    expect(s.estado.a[indice(s, 'm_1')]!.x).toBeCloseTo((3 * G) / 5, 5);
    const r = simular(crearMontaje('mesa-polea', { x: 0, y: 0 }, [], { conRoce: true }), 0.3);
    expect(r.estado.a[indice(r, 'm_1')]!.x).toBeCloseTo(((3 - 0.3 * 2) * G) / 5, 5);
  });

  it('masa y resorte horizontal: período 2π √(m/k)', () => {
    const s = new Simulacion(construirModelo(crearMontaje('resorte-horizontal', { x: 0, y: 0 }, []), G), { h: 0.001 });
    const naturales: number[] = [];
    for (let k = 0; k < 3000; k++) {
      s.paso();
      const ev = s.eventos.filter((e) => e.tipo === 'resorte-natural');
      if (ev.length > naturales.length) naturales.push(ev.at(-1)!.t);
    }
    expect(naturales.length).toBeGreaterThanOrEqual(3);
    expect(naturales[2]! - naturales[0]!).toBeCloseTo(2 * Math.PI * Math.sqrt(2 / 50), 3);
  });

  it('bloques apilados: con 15 N van juntos (a = F /(m₁ + m₂)), el roce entre ellos alcanza justo', () => {
    const s = simular(crearMontaje('apilados', { x: 0, y: 0 }, []), 0.3);
    expect(s.estado.a[indice(s, 'm_1')]!.x).toBeCloseTo(15 / 4, 6);
    expect(s.estado.a[indice(s, 'm_2')]!.x).toBeCloseTo(15 / 4, 6);
    expect(s.estado.contactos[0]!.k).toBe('adherido');
  });

  it('proyectil: vuela y cae a v₀² sen 2θ / g', () => {
    const s = simular(crearMontaje('proyectil', { x: 0, y: 0 }, []), 1);
    const imp = s.eventos.find((e) => e.tipo === 'impacto')!;
    expect(imp.t).toBeCloseTo((2 * 3.5355) / G, 3);
    // Alcance: en el instante del impacto x = x₀ + vₓ t (la última muestra antes del impacto sigue la recta)
    const antes = s.historial.filter((h) => h.t <= imp.t).at(-1)!;
    expect(antes.cuerpos[0]!.x).toBeCloseTo(-2.5 + 3.5355 * antes.t, 9);
    expect(-2.5 + 3.5355 * imp.t).toBeCloseTo(-2.5 + (2 * 3.5355 * 3.5355) / G, 3);
  });

  it('loop: la esfera baja por la rampa y da la vuelta completa sin despegarse (deslizando y rodando)', () => {
    // Desliza sin roce, o rueda sin deslizar (con roce: sin él una esfera no puede rodar). En los dos casos su centro parte
    // más alto que lo necesario: ρ/2 (desliza) o 0,7 ρ (rueda) sobre la cima del camino de su centro.
    for (const gira of [false, true]) {
      const escena = crearMontaje('loop', { x: 0, y: 0 }, [], { conRoce: gira }).map((e) => (e.tipo === 'esfera' ? { ...e, gira } : e)) as Elemento[];
      const s = new Simulacion(construirModelo(escena, G), { h: 0.001 });
      let arriba = false;
      for (let k = 0; k < 3000; k++) {
        s.paso();
        if (s.estado.p[0]!.y > 1.6 - 0.25 - 0.01 && Math.abs(s.estado.p[0]!.x) < 0.1) arriba = true;
      }
      expect(arriba, `gira=${gira}`).toBe(true);
      expect(s.eventos.some((e) => e.tipo === 'despegue'), `gira=${gira}`).toBe(false);
      expect(Math.abs(s.energiaActual().residuo)).toBeLessThan(1e-5);
    }
  });

  it('loma: la esfera se despega a 2/3 de la altura del centro de su camino y aterriza en el piso', () => {
    const s = simular(crearMontaje('loma', { x: 0, y: 0 }, []), 3);
    const tipos = s.eventos.map((e) => e.tipo);
    expect(tipos).toContain('despegue');
    expect(tipos.indexOf('impacto')).toBeGreaterThan(tipos.indexOf('despegue'));
    expect(s.estado.p[0]!.y).toBeCloseTo(0.25, 6);
  });

  it('las masas se numeran a continuación de las de la escena y el montaje queda donde se pide', () => {
    const escena = [crearBloque({ x: 5, y: 5 }, 0.5, 0.4, { etiqueta: 'm_1' }), crearBloque({ x: 6, y: 5 }, 0.5, 0.4, { etiqueta: 'm_2' })];
    const at = crearMontaje('atwood', { x: 10, y: -3 }, escena);
    const etiquetas = at.flatMap((e) => (e.tipo === 'bloque' ? [e.etiqueta] : []));
    expect(etiquetas).toEqual(['m_3', 'm_4']);
    const pol = at.find((e) => e.tipo === 'polea')!;
    expect(pol.tipo === 'polea' && pol.centro).toEqual({ x: 10, y: -1.5 });
  });
});
