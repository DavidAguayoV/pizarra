// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Bloque, Elemento, Esfera } from '../src/core/elementos';
import { apoyarEn, crearBloque, crearEsfera, crearSuperficie } from '../src/physics/objetos';
import { construirModelo } from '../src/sim/modelo';
import { Simulacion } from '../src/sim/motor';

const G = 9.8;
const th = Math.PI / 6;

function simular(escena: Elemento[], t: number, opciones = {}): Simulacion {
  const s = new Simulacion(construirModelo(escena, G), { h: 0.001, ...opciones });
  for (let k = 0; k < Math.round(t / 0.001); k++) s.paso();
  return s;
}

/** Cuña de 30° apoyada en un piso largo: su pie en (0, 0), su cima en (3 cos θ, 3 sen θ). */
function cunaEnPiso(muK = 0): { piso: Elemento; plano: Elemento } {
  const piso = crearSuperficie({ x: -6, y: 0 }, { x: 6, y: 0 }, { id: 'piso' });
  const plano = crearSuperficie({ x: 0, y: 0 }, { x: 0, y: 0 }, { id: 'plano', relleno: 'cuna', muS: muK, muK });
  plano.b = { x: 3 * Math.cos(th), y: 3 * Math.sin(th) };
  return { piso, plano };
}

describe('pasar de una superficie a otra', () => {
  it('un bloque que baja por el plano pasa al piso al llegar al pie (sin atravesarlo) y sigue con v cos 30°', () => {
    const { piso, plano } = cunaEnPiso();
    const u = 2;
    const b0 = crearBloque({ x: u * Math.cos(th), y: u * Math.sin(th) + 0.3 }, 0.5, 0.4, { id: 'b', masa: 1 });
    const b: Bloque = { ...apoyarEn(b0, plano as never), apoyo: ['plano'] };
    // Llega al pie con v = √(2 g sen θ · u) (centro a la altura de la mitad del bloque)
    const s = simular([piso, plano, b], 1.6);
    const ev = s.eventos.find((e) => e.tipo === 'cambia-superficie')!;
    expect(ev).toBeDefined();
    expect(s.estado.modo[0]).toMatchObject({ k: 'desliza', s: 0 });
    expect(s.estado.p[0]!.y).toBeCloseTo(0.2, 9); // sobre el piso, no lo atraviesa
    expect(s.estado.v[0]!.y).toBeCloseTo(0, 9);
    // Se alineó con el piso
    expect(Math.abs(Math.sin(s.estado.th[0]!))).toBeLessThan(1e-9);
    // Rapidez en el piso = v (al pasar) · cos 30°; la energía que falta es la del impacto en la arista
    const vPie = Math.sqrt(2 * G * Math.sin(th) * u); // el cambio ocurre unos 5 cm antes del pie
    expect(Math.abs(s.estado.v[0]!.x)).toBeGreaterThan(0.8 * vPie * Math.cos(th));
    expect(Math.abs(s.estado.v[0]!.x)).toBeLessThan(vPie);
    expect(s.estado.W.impactos).toBeLessThan(0);
    expect(Math.abs(s.energiaActual().residuo)).toBeLessThan(1e-6);
  });

  it('un bloque que desliza por el piso hacia la cuña sube por ella', () => {
    const { piso, plano } = cunaEnPiso();
    const b: Bloque = { ...crearBloque({ x: -2, y: 0.2 }, 0.5, 0.4, { id: 'b', masa: 1, v0: { x: 4, y: 0 } }), apoyo: ['piso'] };
    const s = simular([piso, plano, b], 0.8);
    expect(s.eventos.some((e) => e.tipo === 'cambia-superficie')).toBe(true);
    expect(s.estado.modo[0]).toMatchObject({ s: 1 });
    expect(s.estado.p[0]!.y).toBeGreaterThan(0.3);
    expect(Math.abs(s.energiaActual().residuo)).toBeLessThan(1e-6);
  });

  it('dos tramos de piso seguidos: pasa de uno al otro sin perder energía', () => {
    const t1 = crearSuperficie({ x: -3, y: 0 }, { x: 0, y: 0 }, { id: 't1' });
    const t2 = crearSuperficie({ x: 0, y: 0 }, { x: 3, y: 0 }, { id: 't2' });
    const e: Esfera = { ...crearEsfera({ x: -1, y: 0.25 }, 0.25, { id: 'e', masa: 1, v0: { x: 2, y: 0 } }), apoyo: ['t1'] };
    const s = simular([t1, t2, e], 1);
    expect(s.estado.modo[0]).toMatchObject({ k: 'desliza', s: 1 });
    expect(s.estado.v[0]!.x).toBeCloseTo(2, 9);
    expect(s.estado.p[0]!.x).toBeCloseTo(1, 6);
    expect(Math.abs(s.estado.W.impactos)).toBeLessThan(1e-9);
  });

  it('en la cima de una rampa que da a una meseta, salta un poco y aterriza en la meseta', () => {
    const rampa = crearSuperficie({ x: -3, y: 0 }, { x: 0, y: 0 }, { id: 'rampa' });
    rampa.b = { x: 0, y: 1 };
    rampa.a = { x: -1 / Math.tan(th), y: 0 };
    const meseta = crearSuperficie({ x: 0, y: 1 }, { x: 12, y: 1 }, { id: 'meseta' });
    const e0 = crearEsfera({ x: 0, y: 0 }, 0.25, { id: 'e', masa: 1 });
    const u = 0.4; // a 40 cm del pie, lanzada rampa arriba a 6 m/s
    const p = { x: rampa.a.x + u * Math.cos(th) - 0.25 * Math.sin(th), y: u * Math.sin(th) + 0.25 * Math.cos(th) };
    const e: Esfera = { ...e0, centro: p, apoyo: ['rampa'], v0: { x: 6 * Math.cos(th), y: 6 * Math.sin(th) } };
    const s = simular([rampa, meseta, e], 1.5);
    expect(s.estado.modo[0]).toMatchObject({ k: 'desliza', s: 1 });
    expect(s.estado.p[0]!.y).toBeCloseTo(1.25, 9);
    expect(s.eventos.map((x) => x.tipo)).toContain('impacto');
  });
});
