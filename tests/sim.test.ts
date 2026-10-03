// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Elemento } from '../src/core/elementos';
import { crearBloque, crearCuerda, crearEsfera, crearPolea, crearResorte, crearSuperficie, normalSuperficie } from '../src/physics/objetos';
import { aRadianes, vectorPorValores } from '../src/physics/vectores';
import { construirModelo } from '../src/sim/modelo';
import type { EventoSim } from '../src/sim/motor';
import { Simulacion } from '../src/sim/motor';

const G = 9.8;

const sim = (escena: Elemento[], h = 0.001): Simulacion => new Simulacion(construirModelo(escena, G), { h });

/** Avanza hasta `t` segundos exactos de simulación (en pasos de h). */
function correr(s: Simulacion, t: number): void {
  const n = Math.round(t / s.h);
  for (let k = 0; k < n; k++) s.paso();
}

const tipos = (ev: readonly EventoSim[]): string[] => ev.map((e) => e.tipo);
const relativo = (a: number, b: number): number => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);

/** Plano inclinado θ que sube hacia la derecha, con un bloque apoyado y alineado. */
function plano(thetaDeg: number, muS: number, muK: number, v0: number, m = 2): Elemento[] {
  const th = aRadianes(thetaDeg);
  const a = { x: -4, y: -2 };
  const sup = crearSuperficie(a, { x: a.x + 12 * Math.cos(th), y: a.y + 12 * Math.sin(th) }, { muS, muK });
  const n = normalSuperficie(sup);
  const alto = 0.4;
  const u = 3;
  const bloque = crearBloque(
    { x: a.x + u * Math.cos(th) + n.x * (alto / 2), y: a.y + u * Math.sin(th) + n.y * (alto / 2) },
    0.6,
    alto,
    { masa: m, angulo: th, v0: { x: v0 * Math.cos(th), y: v0 * Math.sin(th) } },
  );
  return [sup, bloque];
}

describe('caída libre y proyectil (contra la solución analítica)', () => {
  it('caída libre: y = y0 − ½ g t² y la energía mecánica se conserva', () => {
    const b = crearEsfera({ x: 0, y: 10 }, 0.1, { masa: 2 });
    const s = sim([b]);
    correr(s, 1);
    expect(s.estado.p[0]!.y).toBeCloseTo(10 - 0.5 * G, 8);
    expect(s.estado.v[0]!.y).toBeCloseTo(-G, 8);
    const en = s.energiaActual();
    expect(Math.abs(en.residuo)).toBeLessThan(1e-9);
    expect(s.eventos).toEqual([]);
  });

  it('proyectil: alcance, altura máxima y tiempo de vuelo coinciden con la fórmula', () => {
    const v0 = 12;
    const ang = aRadianes(40);
    const r = 0.1;
    const y0 = 2;
    const suelo = crearSuperficie({ x: -5, y: 0 }, { x: 40, y: 0 });
    const bala = crearEsfera({ x: 0, y: y0 + r }, r, { masa: 0.5, v0: { x: v0 * Math.cos(ang), y: v0 * Math.sin(ang) } });
    const s = sim([suelo, bala]);
    correr(s, 3);
    const impacto = s.eventos.find((e) => e.tipo === 'impacto')!;
    // El centro llega a y = r cuando y0 + vy t − ½ g t² = 0
    const vy = v0 * Math.sin(ang);
    const tVuelo = (vy + Math.sqrt(vy * vy + 2 * G * y0)) / G;
    expect(impacto.t).toBeCloseTo(tVuelo, 4);
    const hMax = y0 + (vy * vy) / (2 * G);
    const maxY = Math.max(...s.historial.map((m) => m.cuerpos[0]!.y - r));
    expect(maxY).toBeCloseTo(hMax, 3);
    // Alcance: x en el momento del impacto
    const alcance = v0 * Math.cos(ang) * tVuelo;
    const enImpacto = s.historial.find((m) => m.t >= impacto.t)!;
    expect(enImpacto.cuerpos[0]!.x).toBeCloseTo(alcance, 1);
  });

  it('un lanzamiento horizontal desde una mesa: x = v0 t, y = y0 − ½ g t²', () => {
    const b = crearEsfera({ x: 0, y: 5 }, 0.1, { v0: { x: 3, y: 0 } });
    const s = sim([b]);
    correr(s, 0.8);
    expect(s.estado.p[0]!.x).toBeCloseTo(2.4, 8);
    expect(s.estado.p[0]!.y).toBeCloseTo(5 - 0.5 * G * 0.64, 8);
  });
});

describe('plano inclinado con roce', () => {
  it('desliza con a = g (sen θ − μk cos θ) hacia abajo: v(t) y x(t) analíticos', () => {
    const th = 30;
    const s = sim(plano(th, 0.2, 0.1, 0));
    expect(s.estado.modo[0]!.k).toBe('desliza');
    correr(s, 1);
    const a = G * (Math.sin(aRadianes(th)) - 0.1 * Math.cos(aRadianes(th)));
    const vt = s.estado.v[0]!.x * Math.cos(aRadianes(th)) + s.estado.v[0]!.y * Math.sin(aRadianes(th));
    expect(vt).toBeCloseTo(-a * 1, 4);
    const x0 = s.historial[0]!.cuerpos[0]!;
    const x1 = s.estado.p[0]!;
    const recorrido = Math.hypot(x1.x - x0.x, x1.y - x0.y);
    expect(recorrido).toBeCloseTo(0.5 * a, 4);
  });

  it('en reposo si tan θ ≤ μs: no se mueve y queda adherido', () => {
    const s = sim(plano(30, 0.8, 0.6, 0));
    expect(s.estado.modo[0]!.k).toBe('adherido');
    const antes = { ...s.estado.p[0]! };
    correr(s, 2);
    expect(s.estado.p[0]!.x).toBeCloseTo(antes.x, 9);
    expect(s.estado.p[0]!.y).toBeCloseTo(antes.y, 9);
    expect(s.estado.fric[0]!).toBeCloseTo(2 * G * Math.sin(aRadianes(30)), 3); // las coordenadas se guardan con 0,1 mm
  });

  it('balance de energía con roce: E − E0 = trabajo del roce (error < 1e-6)', () => {
    const s = sim(plano(35, 0.3, 0.25, 0));
    correr(s, 1.5);
    const en = s.energiaActual();
    expect(en.Wnc).toBeLessThan(0); // el roce disipa
    expect(relativo(en.E - s.energiaMecanicaInicial, en.Wnc)).toBeLessThan(1e-6);
  });

  it('sube, se detiene, y como tan θ > μs vuelve a bajar: eventos y tiempos', () => {
    const th = 30;
    const muK = 0.1;
    const v0 = 4;
    const s = sim(plano(th, 0.3, muK, v0));
    const aSube = G * (Math.sin(aRadianes(th)) + muK * Math.cos(aRadianes(th)));
    const tStop = v0 / aSube;
    correr(s, tStop + 0.5);
    expect(tipos(s.eventos)).toContain('invierte');
    const ev = s.eventos.find((e) => e.tipo === 'invierte')!;
    expect(ev.t).toBeCloseTo(tStop, 2);
    // Después baja con g (sen θ − μk cos θ)
    const aBaja = G * (Math.sin(aRadianes(th)) - muK * Math.cos(aRadianes(th)));
    const vt = s.estado.v[0]!.x * Math.cos(aRadianes(th)) + s.estado.v[0]!.y * Math.sin(aRadianes(th));
    expect(vt).toBeCloseTo(-aBaja * (0.5 - (ev.t - tStop)), 1);
  });

  it('sube y, como tan θ ≤ μs, se detiene definitivamente (detención)', () => {
    const th = 20;
    const s = sim(plano(th, 0.6, 0.4, 3));
    const aSube = G * (Math.sin(aRadianes(th)) + 0.4 * Math.cos(aRadianes(th)));
    correr(s, 3 / aSube + 0.5);
    expect(tipos(s.eventos)).toContain('detencion');
    expect(s.estado.modo[0]!.k).toBe('adherido');
    expect(Math.hypot(s.estado.v[0]!.x, s.estado.v[0]!.y)).toBeLessThan(1e-9);
    const quieto = { ...s.estado.p[0]! };
    correr(s, 1);
    expect(s.estado.p[0]!.x).toBeCloseTo(quieto.x, 9);
  });

  it.each([5, 15, 30, 45, 60])('barrido θ = %d°: reposo si tan θ ≤ μs, si no a = g (sen θ − μk cos θ)', (th) => {
    for (const [muS, muK] of [[0.25, 0.15], [0.7, 0.5], [1.2, 0.9]] as const) {
      const s = sim(plano(th, muS, muK, 0));
      correr(s, 0.5);
      const t = aRadianes(th);
      const vt = s.estado.v[0]!.x * Math.cos(t) + s.estado.v[0]!.y * Math.sin(t);
      if (Math.tan(t) <= muS) expect(Math.abs(vt)).toBeLessThan(1e-9);
      else expect(vt).toBeCloseTo(-G * (Math.sin(t) - muK * Math.cos(t)) * 0.5, 3);
    }
  });
});

describe('piso horizontal con fuerza aplicada', () => {
  const piso = (muS: number, muK: number) => crearSuperficie({ x: -20, y: 0 }, { x: 20, y: 0 }, { muS, muK });
  const bloque = crearBloque({ x: 0, y: 0.2 }, 0.6, 0.4, { masa: 5 });

  it('F = 30 N vence el estático (24,5 N): a = (30 − 14,7)/5 = 3,06 m/s²', () => {
    const F = vectorPorValores('aplicada', bloque.centro, 30, 0, null);
    const s = sim([piso(0.5, 0.3), bloque, F]);
    expect(s.estado.modo[0]!.k).toBe('desliza');
    correr(s, 1);
    expect(s.estado.v[0]!.x).toBeCloseTo(3.06, 4);
    expect(s.estado.p[0]!.x).toBeCloseTo(1.53, 4);
    // El trabajo de la fuerza aplicada y del roce: W_F = 30·x, W_roce = −14,7·x
    const en = s.energiaActual();
    expect(en.Wnc).toBeCloseTo((30 - 14.7) * 1.53, 3);
    expect(Math.abs(en.residuo)).toBeLessThan(1e-6);
  });

  it('F = 20 N no vence el estático: queda quieto con f = 20 N', () => {
    const F = vectorPorValores('aplicada', bloque.centro, 20, 0, null);
    const s = sim([piso(0.5, 0.3), bloque, F]);
    expect(s.estado.modo[0]!.k).toBe('adherido');
    correr(s, 1);
    expect(s.estado.p[0]!.x).toBeCloseTo(0, 9);
    expect(Math.abs(s.estado.fric[0]!)).toBeCloseTo(20, 6);
  });

  it('con una fuerza que crece no se puede, pero con el bloque ya moviéndose el roce es cinético y constante', () => {
    const F = vectorPorValores('aplicada', bloque.centro, 20, 0, null);
    const lanzado = crearBloque({ x: 0, y: 0.2 }, 0.6, 0.4, { masa: 5, v0: { x: 2, y: 0 } });
    const s = sim([piso(0.5, 0.3), lanzado, F]);
    expect(s.estado.modo[0]!.k).toBe('desliza');
    correr(s, 1);
    expect(s.estado.v[0]!.x).toBeCloseTo(2 + ((20 - 14.7) / 5) * 1, 4);
  });

  it('una fuerza hacia arriba mayor que el peso despega al cuerpo', () => {
    const F = vectorPorValores('aplicada', bloque.centro, 80, 90, null);
    const s = sim([piso(0.5, 0.3), bloque, F]);
    correr(s, 0.5);
    expect(tipos(s.eventos)).toContain('despegue');
    expect(s.estado.modo[0]!.k).toBe('libre');
    expect(s.estado.v[0]!.y).toBeGreaterThan(0);
  });
});

describe('masa-resorte', () => {
  // Bloque de 2 kg sobre un piso sin roce, unido por un resorte (k = 50 N/m) a una pared fija.
  const escena = (): Elemento[] => {
    const piso = crearSuperficie({ x: -6, y: 0 }, { x: 6, y: 0 }, { muS: 0, muK: 0 });
    const bloque = crearBloque({ x: 0, y: 0.3 }, 0.6, 0.6, { masa: 2 });
    const resorte = crearResorte({ x: -2.3, y: 0.3 }, { x: -0.3, y: 0.3 }, { k: 50, largoNatural: 1.5 });
    return [piso, bloque, resorte];
  };

  it('el modelo ata el resorte al bloque por un extremo y a un punto fijo por el otro', () => {
    const m = construirModelo(escena(), G);
    expect(m.resortes).toHaveLength(1);
    expect(m.resortes[0]!.ext.map((e) => e.tipo).sort()).toEqual(['cuerpo', 'fijo']);
  });

  it('el período es 2π√(m/k) (error relativo < 1e-5) y la energía se conserva (< 1e-6)', () => {
    const s = sim(escena(), 0.0005);
    const T = 2 * Math.PI * Math.sqrt(2 / 50);
    const xEq = s.estado.p[0]!.x - 0.5; // el resorte parte estirado 0,5 m: el equilibrio queda 0,5 m a la izquierda
    const cruces: number[] = [];
    let ultimo = 0.5;
    for (let i = 0; i < Math.round((4 * T) / s.h); i++) {
      s.paso();
      const d = s.estado.p[0]!.x - xEq;
      if (ultimo > 0 && d <= 0) cruces.push(s.estado.t - (s.h * d) / (d - ultimo)); // interpolación lineal del cruce
      ultimo = d;
    }
    expect(cruces.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < cruces.length; i++) expect(relativo(cruces[i]! - cruces[i - 1]!, T)).toBeLessThan(1e-5);
    expect(Math.abs(s.energiaActual().residuo) / s.energiaMecanicaInicial).toBeLessThan(1e-6);
    // Energía inicial: potencial gravitatoria (y = 0,3) más elástica ½ k x²
    expect(s.energiaMecanicaInicial).toBeCloseTo(2 * G * 0.3 + 0.5 * 50 * 0.25, 9);
  });

  it('x(t) = x_eq + A cos(ωt) con A = 0,5 m y ω = √(k/m)', () => {
    const s = sim(escena(), 0.0005);
    const x0 = s.estado.p[0]!.x;
    const w = Math.sqrt(50 / 2);
    correr(s, 1.3);
    expect(s.estado.p[0]!.x).toBeCloseTo(x0 - 0.5 + 0.5 * Math.cos(w * 1.3), 5);
    expect(s.estado.v[0]!.x).toBeCloseTo(-0.5 * w * Math.sin(w * 1.3), 4);
  });

  it('registra el paso por el largo natural, dos veces por período', () => {
    const s = sim(escena(), 0.001);
    const T = 2 * Math.PI * Math.sqrt(2 / 50);
    correr(s, 2 * T + 0.01);
    expect(s.eventos.filter((e) => e.tipo === 'resorte-natural').length).toBe(4);
  });

  it('resorte vertical colgando: oscila con ω = √(k/m) alrededor de m g / k por debajo del largo natural', () => {
    const b = crearEsfera({ x: 0, y: 0 }, 0.1, { masa: 1 });
    const r = crearResorte({ x: 0, y: 2.1 }, { x: 0, y: 0.1 }, { k: 40, largoNatural: 2 }); // atado al tope de la esfera (y + r)
    const s = sim([b, r], 0.0005);
    const w = Math.sqrt(40);
    const T = (2 * Math.PI) / w;
    // Equilibrio: el resorte se estira m g/k = 0,245 m respecto de su largo natural
    const largoEq = 2 + G / 40;
    const yEq = 2.1 - largoEq - 0.1; // centro de la esfera en equilibrio
    correr(s, T);
    // Se compara con la solución analítica en el instante realmente simulado (el tiempo es múltiplo de h)
    const analitica = (tt: number): number => yEq + (0 - yEq) * Math.cos(w * tt);
    expect(s.estado.p[0]!.y).toBeCloseTo(analitica(s.estado.t), 5);
    correr(s, T / 4);
    expect(s.estado.p[0]!.y).toBeCloseTo(analitica(s.estado.t), 5);
    const en = s.energiaActual();
    expect(Math.abs(en.residuo)).toBeLessThan(1e-7);
  });
});

describe('cuerdas y poleas (tensiones reales)', () => {
  /** Máquina de Atwood: dos bloques colgando de una polea; las cuerdas llegan verticales a cada lado. */
  const atwood = (m1: number, m2: number): Elemento[] => [
    crearPolea({ x: 0, y: 3 }, 0.3),
    crearCuerda({ x: -0.3, y: 3 }, { x: -0.3, y: 0.9 }),
    crearCuerda({ x: 0.3, y: 3 }, { x: 0.3, y: 1.4 }),
    crearBloque({ x: -0.3, y: 0.7 }, 0.4, 0.4, { masa: m1 }),
    crearBloque({ x: 0.3, y: 1.2 }, 0.4, 0.4, { masa: m2 }),
  ];

  it('el modelo junta las dos cuerdas de la polea en una sola', () => {
    const m = construirModelo(atwood(3, 2), G);
    expect(m.cuerdas).toHaveLength(1);
    expect(m.cuerdas[0]!.polea).not.toBeNull();
    expect(m.cuerdas[0]!.ids).toHaveLength(2);
  });

  it('Atwood: a = (m1 − m2) g /(m1 + m2) y T = 2 m1 m2 g /(m1 + m2)', () => {
    const m1 = 3;
    const m2 = 2;
    const s = sim(atwood(m1, m2));
    correr(s, 0.5);
    const a = ((m1 - m2) * G) / (m1 + m2);
    expect(s.estado.p[0]!.y).toBeCloseTo(0.7 - 0.5 * a * 0.25, 5); // el pesado baja
    expect(s.estado.p[1]!.y).toBeCloseTo(1.2 + 0.5 * a * 0.25, 5); // el liviano sube lo mismo
    expect(s.estado.T[0]!).toBeCloseTo((2 * m1 * m2 * G) / (m1 + m2), 4);
    expect(s.estado.v[0]!.y).toBeCloseTo(-a * 0.5, 5);
  });

  it('Atwood con masas iguales: equilibrio (a = 0, T = m g)', () => {
    const s = sim(atwood(2, 2));
    correr(s, 1);
    expect(s.estado.v[0]!.y).toBeCloseTo(0, 9);
    expect(s.estado.T[0]!).toBeCloseTo(2 * G, 6);
  });

  it('Atwood: la energía mecánica se conserva (la tensión no hace trabajo neto)', () => {
    const s = sim(atwood(3, 1));
    correr(s, 0.6);
    const en = s.energiaActual();
    expect(Math.abs(en.residuo)).toBeLessThan(1e-6);
    expect(en.K).toBeGreaterThan(0);
  });

  it('bloque en una mesa con roce unido por una polea a una masa colgante', () => {
    const m1 = 2;
    const m2 = 3;
    const muK = 0.2;
    const escena: Elemento[] = [
      crearSuperficie({ x: -5, y: 0 }, { x: 0.9, y: 0 }, { muS: 0.3, muK }),
      crearBloque({ x: -1, y: 0.2 }, 0.4, 0.4, { masa: m1 }),
      crearPolea({ x: 1.2, y: 0.2 }, 0.3),
      crearCuerda({ x: -0.8, y: 0.2 }, { x: 0.9, y: 0.2 }),
      crearCuerda({ x: 1.5, y: 0.2 }, { x: 1.5, y: -1.3 }),
      crearBloque({ x: 1.5, y: -1.5 }, 0.4, 0.4, { masa: m2 }),
    ];
    const s = sim(escena);
    expect(s.estado.modo[0]!.k).toBe('desliza'); // m2 g = 29,4 N > μs m1 g = 5,9 N
    correr(s, 0.5);
    const a = (m2 * G - muK * m1 * G) / (m1 + m2);
    expect(s.estado.v[0]!.x).toBeCloseTo(a * 0.5, 4);
    expect(s.estado.v[1]!.y).toBeCloseTo(-a * 0.5, 4);
    expect(s.estado.T[0]!).toBeCloseTo(m2 * (G - a), 3);
    const en = s.energiaActual();
    expect(relativo(en.E - s.energiaMecanicaInicial, en.Wnc)).toBeLessThan(1e-5);
  });

  it('si el roce estático alcanza para sostener la masa colgante, nada se mueve y la tensión es m2 g', () => {
    const escena: Elemento[] = [
      crearSuperficie({ x: -5, y: 0 }, { x: 0.9, y: 0 }, { muS: 0.9, muK: 0.5 }),
      crearBloque({ x: -1, y: 0.2 }, 0.4, 0.4, { masa: 5 }),
      crearPolea({ x: 1.2, y: 0.2 }, 0.3),
      crearCuerda({ x: -0.8, y: 0.2 }, { x: 0.9, y: 0.2 }),
      crearCuerda({ x: 1.5, y: 0.2 }, { x: 1.5, y: -1.3 }),
      crearBloque({ x: 1.5, y: -1.5 }, 0.4, 0.4, { masa: 2 }), // 19,6 N < 0,9 · 49 N = 44,1 N
    ];
    const s = sim(escena);
    expect(s.estado.modo[0]!.k).toBe('adherido');
    correr(s, 1);
    expect(s.estado.v[1]!.y).toBeCloseTo(0, 9);
    expect(s.estado.T[0]!).toBeCloseTo(2 * G, 5);
    expect(Math.abs(s.estado.fric[0]!)).toBeCloseTo(2 * G, 5);
  });

  it('péndulo simple: período 2π√(L/g) (amplitud pequeña) y energía conservada', () => {
    const L = 2;
    const th0 = 0.05;
    const r = 0.1;
    const pivote = { x: 0, y: 3 };
    const centro = { x: L * Math.sin(th0), y: 3 - 0.1 - L * Math.cos(th0) + 0.1 }; // pivote efectivo (0, 2,9) + L (sen θ, −cos θ)
    const c = { x: L * Math.sin(th0), y: 2.9 - L * Math.cos(th0) };
    void centro;
    const bola = crearEsfera(c, r, { masa: 1 });
    const cuerda = crearCuerda(pivote, { x: c.x, y: c.y + r });
    const s = sim([bola, cuerda], 0.0005);
    const T0 = 2 * Math.PI * Math.sqrt(L / G);
    const T = T0 * (1 + (th0 * th0) / 16);
    const x0 = s.estado.p[0]!.x;
    const cruces: number[] = [];
    let previo = x0 - 0;
    const centroX = 0; // la vertical pasa por x = 0
    for (let i = 0; i < Math.round((3 * T) / s.h); i++) {
      s.paso();
      const x = s.estado.p[0]!.x - centroX;
      if (previo > 0 && x <= 0) cruces.push(s.estado.t - (s.h * x) / (x - previo));
      previo = x;
    }
    expect(cruces.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < cruces.length; i++) expect(relativo(cruces[i]! - cruces[i - 1]!, T)).toBeLessThan(2e-4);
    expect(Math.abs(s.energiaActual().residuo)).toBeLessThan(1e-6);
    // La tensión nunca es negativa mientras oscila
    expect(s.estado.T[0]!).toBeGreaterThan(0);
  });

  it('una cuerda que se acerca parte floja; el cuerpo vuela y la cuerda se tensa al volver a su largo', () => {
    const bola = crearEsfera({ x: 0, y: 1.9 }, 0.1, { masa: 1, v0: { x: 0, y: 3 } });
    const cuerda = crearCuerda({ x: 0, y: 4 }, { x: 0, y: 2 }); // 2 m, la bola cuelga debajo y sube
    const s = sim([bola, cuerda]);
    expect(s.estado.cuerdaActiva[0]).toBe(false); // sube hacia el amarre: la cuerda no puede empujar
    correr(s, 1.5);
    expect(tipos(s.eventos)).toContain('cuerda-tensa');
    // Subió h = v²/(2g) = 0,459 m en caída libre y volvió: tensarse con energía perdida en el tirón
    expect(s.energiaActual().Wnc).toBeLessThan(0);
    expect(Math.abs(s.energiaActual().residuo)).toBeLessThan(1e-6);
  });

  it('péndulo lanzado desde abajo con v² = 3 g L: la cuerda se afloja antes del tope y se tensa de nuevo', () => {
    const L = 1;
    const r = 0.1;
    const v0 = Math.sqrt(3 * G * L); // entre √(2gL) y √(5gL): sale de la circunferencia
    const c = { x: 0, y: 2.9 - L };
    const s = sim([crearEsfera(c, r, { masa: 1, v0: { x: v0, y: 0 } }), crearCuerda({ x: 0, y: 3 }, { x: 0, y: c.y + r })], 0.0005);
    correr(s, 2.5);
    const orden = tipos(s.eventos).filter((x) => x === 'cuerda-floja' || x === 'cuerda-tensa');
    expect(orden[0]).toBe('cuerda-floja');
    expect(orden).toContain('cuerda-tensa');
    expect(Math.abs(s.energiaActual().residuo)).toBeLessThan(1e-6);
  });
});

describe('eventos de superficie', () => {
  it('un bloque que sale por el borde de la mesa cae como proyectil y aterriza donde predice la cinemática', () => {
    const v0 = 2;
    const mesa = crearSuperficie({ x: -6, y: 1 }, { x: 0, y: 1 }, { muS: 0, muK: 0 });
    const suelo = crearSuperficie({ x: -10, y: 0 }, { x: 10, y: 0 }, { muS: 0, muK: 0 });
    const bloque = crearBloque({ x: -2, y: 1.2 }, 0.4, 0.4, { masa: 1, v0: { x: v0, y: 0 } });
    const s = sim([mesa, suelo, bloque]);
    correr(s, 1.5);
    const sale = s.eventos.find((e) => e.tipo === 'sale-extremo')!;
    const choca = s.eventos.find((e) => e.tipo === 'impacto')!;
    expect(sale.t).toBeCloseTo(1, 2); // recorre 2 m a 2 m/s
    // Cae 1 m: t = √(2·1/g)
    expect(choca.t - sale.t).toBeCloseTo(Math.sqrt(2 / G), 2);
    const enImpacto = s.historial.find((m) => m.t >= choca.t)!;
    expect(enImpacto.cuerpos[0]!.x).toBeCloseTo(v0 * Math.sqrt(2 / G), 1);
  });

  it('el impacto contra el suelo disipa la energía vertical y queda registrada como trabajo de impacto', () => {
    const suelo = crearSuperficie({ x: -10, y: 0 }, { x: 10, y: 0 }, { muS: 0, muK: 0 });
    const bola = crearEsfera({ x: 0, y: 2.1 }, 0.1, { masa: 2 });
    const s = sim([suelo, bola]);
    correr(s, 1);
    const en = s.energiaActual();
    expect(en.Wnc).toBeLessThan(0);
    // Toda la energía potencial inicial (m g · 2) se disipó en el choque inelástico
    expect(en.Wnc).toBeCloseTo(-2 * G * 2, 1);
    expect(Math.abs(en.residuo)).toBeLessThan(1e-6);
  });
});

describe('modelo desde la escena', () => {
  it('sin cuerpos avisa; los cuerpos no atados no generan cuerdas; las fuerzas aplicadas se toman del vector', () => {
    expect(construirModelo([], G).avisos.join(' ')).toContain('No hay cuerpos');
    const b = crearBloque({ x: 0, y: 0 }, 0.6, 0.4, { masa: 3 });
    const suelta = crearCuerda({ x: 5, y: 5 }, { x: 6, y: 5 });
    const F = vectorPorValores('aplicada', b.centro, 15, 30, null);
    const m = construirModelo([b, suelta, F], G);
    expect(m.cuerdas).toHaveLength(0);
    expect(m.fuerzas).toHaveLength(1);
    expect(m.fuerzas[0]!.F.x).toBeCloseTo(15 * Math.cos(aRadianes(30)), 2);
    expect(m.fuerzas[0]!.F.y).toBeCloseTo(15 * Math.sin(aRadianes(30)), 2);
  });

  it('reiniciar vuelve a las posiciones y velocidades dibujadas', () => {
    const b = crearEsfera({ x: 1, y: 5 }, 0.1, { v0: { x: 2, y: 1 } });
    const s = sim([b]);
    correr(s, 0.7);
    s.reiniciar();
    expect(s.estado.t).toBe(0);
    expect(s.estado.p[0]).toEqual({ x: 1, y: 5 });
    expect(s.estado.v[0]).toEqual({ x: 2, y: 1 });
    expect(s.historial).toHaveLength(1);
  });

  it('un cuerpo dibujado tocando la superficie arranca exactamente apoyado sobre ella', () => {
    const suelo = crearSuperficie({ x: -3, y: 0 }, { x: 3, y: 0 });
    const b = crearBloque({ x: 0, y: 0.23 }, 0.6, 0.4); // 3 cm de más
    const s = sim([suelo, b]);
    expect(s.estado.p[0]!.y).toBeCloseTo(0.2, 9);
  });

  it('avanzar(dt) acumula el tiempo en pasos fijos y no se atrasa', () => {
    const s = sim([crearEsfera({ x: 0, y: 10 }, 0.1)]);
    s.avanzar(0.0105);
    expect(s.estado.t).toBeCloseTo(0.01, 12);
    s.avanzar(0.0005);
    expect(s.estado.t).toBeCloseTo(0.011, 12);
  });
});
