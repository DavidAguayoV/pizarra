// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Bloque, Cuerda, Elemento, Resorte, Vector } from '../src/core/elementos';
import { crearBloque, crearCuerda, crearEsfera, crearPolea, crearResorte, crearSuperficie } from '../src/physics/objetos';
import { elementosAnimados } from '../src/sim/animacion';
import { construirModelo } from '../src/sim/modelo';
import { Simulacion } from '../src/sim/motor';
import { graficoDe } from '../src/sim/series';
import { rangoY, ticksBonitos } from '../src/ui/grafico';

const G = 9.8;
const sim = (escena: Elemento[]): Simulacion => new Simulacion(construirModelo(escena, G), { h: 0.001 });
const correr = (s: Simulacion, t: number): void => {
  for (let k = 0; k < Math.round(t / s.h); k++) s.paso();
};
const op = { vectores: true, trayectoria: true };

describe('elementos animados', () => {
  it('el cuerpo se dibuja en su posición actual y el original queda oculto', () => {
    const b = crearEsfera({ x: 0, y: 5 }, 0.1, { id: 'e1' });
    const s = sim([b]);
    correr(s, 0.5);
    const a = elementosAnimados(s, [b], op);
    const copia = a.locales.find((e) => e.tipo === 'esfera')!;
    expect(copia.tipo === 'esfera' && copia.centro.y).toBeCloseTo(5 - 0.5 * G * 0.25, 6);
    expect(copia.id).toBe('e1'); // misma identidad: se reemplaza al original
    expect(a.ocultos.has('e1')).toBe(true);
  });

  it('los vectores v y a aparecen solo si el cuerpo se mueve o acelera, con la escala de los videos (2 m/s por metro)', () => {
    const reposo = sim([crearEsfera({ x: 0, y: 5 }, 0.1, { id: 'q', masa: 1 })]);
    reposo.estado.v[0] = { x: 0, y: 0 };
    const quieto = elementosAnimados(reposo, reposo.modelo.cuerpos.map((c) => c.elemento), op);
    // Recién empieza: v = 0 pero a = −g: solo la aceleración
    const ids = quieto.locales.filter((e) => e.tipo === 'vector').map((e) => e.id);
    expect(ids).toEqual(['sim-a-q']);
    const b = crearEsfera({ x: 0, y: 5 }, 0.1, { id: 'q', v0: { x: 1, y: 0 } });
    const s = sim([b]);
    const v = elementosAnimados(s, [b], op).locales.find((e) => e.id === 'sim-v-q') as Vector;
    expect(v.rol).toBe('velocidad');
    expect(Math.hypot(v.b.x - v.a.x, v.b.y - v.a.y)).toBeCloseTo(0.5, 3); // 1 m/s ÷ 2 m/s por metro
    expect(elementosAnimados(s, [b], { vectores: false, trayectoria: false }).locales.some((e) => e.tipo === 'vector')).toBe(false);
  });

  it('las flechas muy largas se acortan a 2,5 m (la escala crece)', () => {
    const b = crearEsfera({ x: 0, y: 50 }, 0.1, { id: 'q', v0: { x: 80, y: 0 } });
    const s = sim([b]);
    const v = elementosAnimados(s, [b], op).locales.find((e) => e.id === 'sim-v-q') as Vector;
    expect(Math.hypot(v.b.x - v.a.x, v.b.y - v.a.y)).toBeCloseTo(2.5, 3);
    expect(v.porMetro).toBeCloseTo(32, 6);
  });

  it('la trayectoria es un trazo que crece con el tiempo y no se envía por la red', () => {
    const b = crearEsfera({ x: 0, y: 5 }, 0.1, { id: 'q', v0: { x: 2, y: 0 } });
    const s = sim([b]);
    const antes = elementosAnimados(s, [b], op);
    correr(s, 0.6);
    const despues = elementosAnimados(s, [b], op);
    const t0 = antes.locales.find((e) => e.id === 'sim-tray-q');
    const t1 = despues.locales.find((e) => e.id === 'sim-tray-q');
    expect(t1 && t1.tipo === 'trazo' && t1.puntos.length).toBeGreaterThan(t0 && t0.tipo === 'trazo' ? t0.puntos.length : 0);
    expect(despues.red.some((e) => e.id.startsWith('sim-tray-'))).toBe(false);
  });

  it('un resorte sigue al cuerpo por el extremo atado y deja el otro fijo', () => {
    const piso = crearSuperficie({ x: -6, y: 0 }, { x: 6, y: 0 }, { muS: 0, muK: 0 });
    const bloque = crearBloque({ x: 0, y: 0.3 }, 0.6, 0.6, { masa: 2 });
    const res = crearResorte({ x: -2.3, y: 0.3 }, { x: -0.3, y: 0.3 }, { id: 'r', k: 50, largoNatural: 1.5 });
    const s = sim([piso, bloque, res]);
    correr(s, 0.4);
    const r = elementosAnimados(s, [piso, bloque, res], op).locales.find((e) => e.id === 'r') as Resorte;
    expect(r.a).toEqual({ x: -2.3, y: 0.3 }); // el extremo en la pared no se mueve
    expect(r.b.x).toBeCloseTo(s.estado.p[0]!.x - 0.3, 6); // el del bloque acompaña su borde izquierdo
  });

  it('las dos cuerdas de una polea (v1) se animan como una sola: los puntos de la polea quedan fijos', () => {
    const c1: Cuerda = crearCuerda({ x: -0.3, y: 3 }, { x: -0.3, y: 0.9 }, { id: 'c1' });
    const c2: Cuerda = crearCuerda({ x: 0.3, y: 1.4 }, { x: 0.3, y: 3 }, { id: 'c2' }); // dibujada al revés: la polea es el extremo b
    const escena = [crearPolea({ x: 0, y: 3 }, 0.3), c1, c2, crearBloque({ x: -0.3, y: 0.7 }, 0.4, 0.4, { masa: 3 }), crearBloque({ x: 0.3, y: 1.2 }, 0.4, 0.4, { masa: 2 })];
    const s = sim(escena);
    correr(s, 0.5);
    const anim = elementosAnimados(s, escena, op);
    // La migración funde c2 en c1 (una cuerda con un paso por la polea): se anima c1 y se ocultan las dos.
    expect(anim.ocultos.has('c1') && anim.ocultos.has('c2')).toBe(true);
    const n = anim.locales.find((e) => e.id === 'c1') as Cuerda;
    expect(anim.locales.some((e) => e.id === 'c2')).toBe(false);
    const [t1, t2] = n.camino! as Array<{ k: 'recta'; a: { x: number; y: number }; b: { x: number; y: number } }>;
    expect(t1!.b).toEqual({ x: -0.3, y: 3 }); // en la polea: fijo
    expect(n.a.y).toBeCloseTo(0.9 - 0.5 * ((3 - 2) * G) / 5 * 0.25, 5); // el extremo del bloque pesado baja
    expect(t2!.a).toEqual({ x: 0.3, y: 3 }); // el otro punto de la polea, fijo
    expect(n.b.y).toBeGreaterThan(1.4); // el del bloque liviano sube
    const bloques = anim.locales.filter((e): e is Bloque => e.tipo === 'bloque');
    expect(bloques[0]!.centro.y).toBeLessThan(0.7);
  });
});

describe('marcas y rango del gráfico', () => {
  it('ticksBonitos usa pasos de 1, 2 o 5 por potencia de 10', () => {
    expect(ticksBonitos(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(ticksBonitos(0, 10)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(ticksBonitos(-3, 3, 6)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    expect(ticksBonitos(0, 0.0123).every((t) => Number.isFinite(t))).toBe(true);
    expect(ticksBonitos(5, 5)).toEqual([5, 5.2, 5.4, 5.6, 5.8, 6]);
    for (const t of ticksBonitos(0, 600, 6)) expect(t % 100).toBe(0);
  });

  it('el rango vertical tiene margen y no se colapsa con una curva constante', () => {
    const s = sim([crearEsfera({ x: 0, y: 5 }, 0.1)]);
    correr(s, 0.5);
    const [lo, hi] = rangoY(graficoDe(s, 0, 'posicion'));
    expect(lo).toBeLessThan(hi);
    const plana = graficoDe(s, 0, 'posicion');
    plana.series = [{ nombre: 'k', color: 'tinta', puntos: [[0, 3], [1, 3]] }];
    expect(rangoY(plana)).toEqual([2, 4]);
    plana.series = [];
    expect(rangoY(plana)).toEqual([-1, 1]);
  });
});
