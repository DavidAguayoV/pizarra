// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Bloque, Cuerda, Elemento, Esfera, Polea } from '../src/core/elementos';
import { crearBloque, crearCuerda, crearEsfera, crearPolea, crearSuperficie } from '../src/physics/objetos';
import { crearVector } from '../src/physics/vectores';
import { resolverDcl } from '../src/physics/dcl';
import { apoyar } from '../src/grafo/conectar';
import { construirModelo } from '../src/sim/modelo';
import { Simulacion } from '../src/sim/motor';

const G = 9.8;

function correr(escena: Elemento[], t: number): Simulacion {
  const s = new Simulacion(construirModelo(escena, G), { h: 0.001 });
  for (let k = 0; k < Math.round(t / 0.001); k++) s.paso();
  return s;
}

/** Plano inclinado en θ = 30° con una esfera de radio r apoyada en su mitad. */
function esferaEnPlano(gira: boolean, muS: number, muK: number, r = 0.25): Elemento[] {
  const th = Math.PI / 6;
  const plano = crearSuperficie({ x: -2, y: 0 }, { x: 2, y: 0 }, { id: 'plano', muS, muK });
  plano.b = { x: 2, y: 4 * Math.tan(th) }; // exacto (crearSuperficie redondea a 0,1 mm)
  const medio = { x: 0, y: 2 * Math.tan(th) };
  const n = { x: -Math.sin(th), y: Math.cos(th) };
  const esf: Esfera = { ...crearEsfera({ x: medio.x + r * n.x, y: medio.y + r * n.y }, r, { id: 'e', masa: 2 }), apoyo: ['plano'], gira };
  // crearEsfera redondea el centro a 0,1 mm: se deja exacto para que el apoyo no tenga holgura.
  esf.centro = { x: medio.x + r * n.x, y: medio.y + r * n.y };
  return [plano, esf];
}

describe('cuerpos que giran: esfera en un plano inclinado', () => {
  const th = Math.PI / 6;

  it('con roce suficiente rueda sin deslizar: a = 5/7 g sen θ, α = a / r y sin trabajo del roce', () => {
    const s = correr(esferaEnPlano(true, 0.4, 0.3), 0.5);
    const a = Math.hypot(s.estado.a[0]!.x, s.estado.a[0]!.y);
    expect(a).toBeCloseTo((5 / 7) * G * Math.sin(th), 6);
    expect(Math.abs(s.estado.alfa[0]!)).toBeCloseTo(a / 0.25, 5);
    // v = ω r en todo momento (el punto de contacto no se mueve)
    expect(Math.hypot(s.estado.v[0]!.x, s.estado.v[0]!.y)).toBeCloseTo(Math.abs(s.estado.w[0]!) * 0.25, 6);
    // Roce estático f = 2/7 m g sen θ, que no hace trabajo: la energía mecánica se conserva
    expect(Math.abs(s.estado.fric[0]!)).toBeCloseTo((2 / 7) * 2 * G * Math.sin(th), 5);
    expect(Math.abs(s.energiaActual().residuo)).toBeLessThan(1e-6);
    expect(Math.abs(s.estado.W.roce)).toBeLessThan(1e-9);
    expect(s.descripcion(0)).toBe('rueda sin deslizar');
  });

  it('con roce insuficiente (μs < 2/7 tan θ) desliza y gira: a = g (sen θ − μk cos θ), α = 5 μk g cos θ /(2 r)', () => {
    const [muS, muK] = [0.1, 0.08];
    const s = correr(esferaEnPlano(true, muS, muK), 0.4);
    const a = Math.hypot(s.estado.a[0]!.x, s.estado.a[0]!.y);
    expect(a).toBeCloseTo(G * (Math.sin(th) - muK * Math.cos(th)), 5);
    expect(Math.abs(s.estado.alfa[0]!)).toBeCloseTo((5 * muK * G * Math.cos(th)) / (2 * 0.25), 4);
    expect(s.descripcion(0)).toBe('deslizando');
    // El trabajo del roce cinético (sobre el punto de contacto) da cuenta de la energía perdida
    expect(s.estado.W.roce).toBeLessThan(0);
    expect(Math.abs(s.energiaActual().residuo)).toBeLessThan(1e-6);
  });

  it('sin roce desliza sin girar (a = g sen θ); sin «gira» se mueve como partícula aunque haya roce', () => {
    const lisa = correr(esferaEnPlano(true, 0, 0), 0.3);
    expect(Math.hypot(lisa.estado.a[0]!.x, lisa.estado.a[0]!.y)).toBeCloseTo(G * Math.sin(th), 6);
    expect(Math.abs(lisa.estado.w[0]!)).toBeLessThan(1e-9);
    // Partícula: tan 30° = 0,577 > μs = 0,4: desliza con a = g (sen θ − μk cos θ)
    const p = correr(esferaEnPlano(false, 0.4, 0.3), 0.3);
    expect(Math.hypot(p.estado.a[0]!.x, p.estado.a[0]!.y)).toBeCloseTo(G * (Math.sin(th) - 0.3 * Math.cos(th)), 5);
    expect(p.estado.w[0]).toBe(0);
  });

  it('la misma esfera sin «gira» en un plano de 15° con μs = 0,4 queda en reposo; con «gira» rueda', () => {
    const t15 = Math.PI / 12;
    const escena = (gira: boolean): Elemento[] => {
      const plano = crearSuperficie({ x: -2, y: 0 }, { x: 2, y: 0 }, { id: 'plano', muS: 0.4, muK: 0.3 });
      plano.b = { x: 2, y: 4 * Math.tan(t15) };
      const n = { x: -Math.sin(t15), y: Math.cos(t15) };
      const c = { x: 0.25 * n.x, y: 2 * Math.tan(t15) + 0.25 * n.y };
      const e: Esfera = { ...crearEsfera(c, 0.25, { id: 'e', masa: 1 }), apoyo: ['plano'], gira };
      e.centro = c;
      return [plano, e];
    };
    const quieta = correr(escena(false), 0.3);
    expect(Math.hypot(quieta.estado.v[0]!.x, quieta.estado.v[0]!.y)).toBeLessThan(1e-9);
    const rueda = correr(escena(true), 0.3);
    expect(Math.hypot(rueda.estado.a[0]!.x, rueda.estado.a[0]!.y)).toBeCloseTo((5 / 7) * G * Math.sin(t15), 6);
  });
});

/** Atwood con una polea de masa M (disco): la cuerda no desliza sobre ella. */
function atwoodMasiva(M: number, m1 = 2, m2 = 3): Elemento[] {
  const pol: Polea = crearPolea({ x: 0, y: 1.4 }, 0.3, { id: 'p', masa: M });
  const b1: Bloque = { ...crearBloque({ x: -0.3, y: -0.6 }, 0.4, 0.4, { id: 'b1', masa: m1 }), apoyo: [] };
  const b2: Bloque = { ...crearBloque({ x: 0.3, y: -0.1 }, 0.4, 0.4, { id: 'b2', masa: m2 }), apoyo: [] };
  const c: Cuerda = {
    ...crearCuerda({ x: -0.3, y: -0.4 }, { x: 0.3, y: 0.1 }, { id: 'c' }),
    union: [
      { el: 'b1', puerto: 'cara-sup' },
      { el: 'b2', puerto: 'cara-sup' },
    ],
    ruta: [{ el: 'p', sentido: -1 }],
  };
  return [pol, b1, b2, c];
}

describe('poleas con masa', () => {
  it('Atwood: a = (m₂ − m₁) g /(m₁ + m₂ + M/2), T₁ = m₁ (g + a) y T₂ = m₂ (g − a)', () => {
    const [m1, m2, M] = [2, 3, 4];
    const s = correr(atwoodMasiva(M, m1, m2), 0.4);
    const a = ((m2 - m1) * G) / (m1 + m2 + M / 2);
    expect(s.modelo.rotores).toHaveLength(1);
    expect(s.estado.a[0]!.y).toBeCloseTo(a, 6);
    expect(s.estado.a[1]!.y).toBeCloseTo(-a, 6);
    const [T1, T2] = s.estado.Tp[0]!;
    expect(T1).toBeCloseTo(m1 * (G + a), 5);
    expect(T2).toBeCloseTo(m2 * (G - a), 5);
    // (T₂ − T₁) r = I α, con α = a / r
    expect(Math.abs(s.estado.wrot[0]!) * 0.3).toBeCloseTo(Math.abs(s.estado.v[0]!.y), 6);
    // La energía se conserva contando la rotación de la polea
    expect(Math.abs(s.energiaActual().residuo)).toBeLessThan(1e-6);
  });

  it('con los tramos inclinados (los cuerpos se balancean) la energía se conserva: el contacto se corre por la polea', () => {
    const pol: Polea = crearPolea({ x: -2, y: 2 }, 0.25, { id: 'p', masa: 4 });
    const b1: Bloque = { ...crearBloque({ x: -2.3, y: -0.3 }, 0.5, 0.4, { id: 'b1', masa: 2 }), apoyo: [] };
    const b2: Bloque = { ...crearBloque({ x: -1.6, y: -0.8 }, 0.5, 0.4, { id: 'b2', masa: 3 }), apoyo: [] };
    const c: Cuerda = {
      ...crearCuerda({ x: -2.3, y: -0.1 }, { x: -1.6, y: -0.6 }, { id: 'c' }),
      union: [
        { el: 'b1', puerto: 'cara-sup' },
        { el: 'b2', puerto: 'cara-sup' },
      ],
      ruta: [{ el: 'p', sentido: -1 }],
    };
    const s = correr([pol, b1, b2, c], 0.8);
    expect(Math.abs(s.estado.a[0]!.x)).toBeGreaterThan(0.01); // se balancean
    expect(Math.abs(s.energiaActual().residuo)).toBeLessThan(1e-8);
  });

  it('con M = 0 es la polea ideal de siempre (una sola tensión)', () => {
    const s = correr(atwoodMasiva(0), 0.3);
    expect(s.modelo.rotores).toHaveLength(0);
    expect(s.estado.a[0]!.y).toBeCloseTo(G / 5, 6);
    expect(s.estado.Tp[0]).toHaveLength(1);
  });

  it('una polea móvil con masa avisa que se trata como ideal', () => {
    const escena = atwoodMasiva(0).map((e) => (e.id === 'p' ? { ...e, masa: 1, montaje: { el: 'b2', puerto: 'local:0,0.8' } } : e)) as Elemento[];
    expect(construirModelo(escena, G).avisos.some((x) => x.includes('polea móvil con masa'))).toBe(true);
  });
});

describe('bloque que gira', () => {
  it('colgado de una esquina se balancea (péndulo físico) y la energía se conserva', () => {
    const b: Bloque = { ...crearBloque({ x: 0.25, y: -0.2 }, 0.5, 0.4, { id: 'b', masa: 1 }), apoyo: [], gira: true };
    const c: Cuerda = { ...crearCuerda({ x: 0, y: 1 }, { x: 0, y: 0 }, { id: 'c' }), union: [{ fijo: true }, { el: 'b', puerto: 'esq-si' }] };
    const s = correr([b, c], 1);
    expect(Math.abs(s.estado.th[0]!)).toBeGreaterThan(0.05);
    expect(s.estado.T[0]).toBeGreaterThan(0);
    expect(Math.abs(s.energiaActual().residuo)).toBeLessThan(1e-6);
    // El extremo de la cuerda sigue en la esquina (girada con el bloque) a 1 m del techo
    const q = s.posicionExtremo(s.modelo.cuerdas[0]!.ext[1]);
    expect(Math.hypot(q.x, q.y - 1)).toBeCloseTo(1, 6);
  });

  it('sin «gira» el mismo bloque no rota (como en la v1)', () => {
    const b: Bloque = { ...crearBloque({ x: 0.25, y: -0.2 }, 0.5, 0.4, { id: 'b', masa: 1 }), apoyo: [] };
    const c: Cuerda = { ...crearCuerda({ x: 0, y: 1 }, { x: 0, y: 0 }, { id: 'c' }), union: [{ fijo: true }, { el: 'b', puerto: 'esq-si' }] };
    const s = correr([b, c], 0.5);
    expect(s.estado.th[0]).toBe(0);
  });

  it('un bloque inclinado que cae sobre el suelo queda apoyado sobre una cara y deja de girar', () => {
    const suelo = crearSuperficie({ x: -3, y: 0 }, { x: 3, y: 0 }, { id: 'suelo' });
    const b: Bloque = { ...crearBloque({ x: 0, y: 1 }, 0.5, 0.4, { id: 'b', masa: 1, angulo: 0.3 }), apoyo: [], gira: true };
    const s = correr([suelo, b], 1);
    expect(s.estado.modo[0]!.k).not.toBe('libre');
    expect(Math.abs(Math.sin(2 * s.estado.th[0]!))).toBeLessThan(1e-9);
    expect(s.estado.w[0]).toBe(0);
    expect(s.estado.p[0]!.y).toBeCloseTo(0.2, 6);
  });
});

describe('contacto y choques entre cuerpos', () => {
  const suelo = (): Elemento => crearSuperficie({ x: -6, y: 0 }, { x: 6, y: 0 }, { id: 'suelo' });

  it('bloque sobre bloque, tirando del de abajo: con poca fuerza van juntos (f = m₂ a); con mucha, el de arriba desliza (a₂ = μk g)', () => {
    const [m1, m2, muS, muK] = [2, 1, 0.5, 0.4];
    const escena = (F: number): Elemento[] => {
      const b1: Bloque = { ...crearBloque({ x: 0, y: 0.2 }, 1, 0.4, { id: 'b1', masa: m1 }), apoyo: ['suelo'] };
      const b2: Bloque = { ...crearBloque({ x: 0, y: 0.6 }, 0.5, 0.4, { id: 'b2', masa: m2, muS, muK }), apoyo: ['b1'] };
      const f = crearVector('aplicada', { x: 0, y: 0.2 }, { x: F / 10, y: 0.2 }, { id: 'F', porMetro: 10, cuerpo: 'b1' });
      return [suelo(), b1, b2, f];
    };
    // F = 9 N < μs (m₁ + m₂) g = 14,7 N: juntos con a = F /(m₁ + m₂) = 3 m/s²
    const juntos = correr(escena(9), 0.3);
    expect(juntos.estado.a[0]!.x).toBeCloseTo(3, 6);
    expect(juntos.estado.a[1]!.x).toBeCloseTo(3, 6);
    expect(Math.abs(juntos.estado.fc[0]!)).toBeCloseTo(m2 * 3, 6);
    expect(juntos.estado.Nc[0]).toBeCloseTo(m2 * G, 6);
    // F = 20 N: el de arriba desliza hacia atrás respecto del de abajo
    const desliza = correr(escena(20), 0.3);
    expect(desliza.estado.contactos[0]!.k).toBe('desliza');
    expect(desliza.estado.a[1]!.x).toBeCloseTo(muK * G, 5);
    expect(desliza.estado.a[0]!.x).toBeCloseTo((20 - muK * m2 * G) / m1, 5);
    expect(Math.abs(desliza.energiaActual().residuo)).toBeLessThan(1e-6);
  });

  it('el de arriba, lanzado sobre el de abajo sin roce, cae por el borde cuando su centro sale de la cara', () => {
    const b1: Bloque = { ...crearBloque({ x: 0, y: 0.2 }, 1, 0.4, { id: 'b1', masa: 2 }), apoyo: ['suelo'] };
    const b2: Bloque = { ...crearBloque({ x: 0, y: 0.6 }, 0.4, 0.4, { id: 'b2', masa: 1, v0: { x: 1, y: 0 } }), apoyo: ['b1'] };
    const s = correr([suelo(), b1, b2], 0.8);
    const cae = s.eventos.find((e) => e.tipo === 'sale-extremo')!;
    expect(cae.t).toBeCloseTo(0.5, 2);
    expect(s.estado.contactos).toHaveLength(0);
    expect(s.estado.p[0]!.x).toBeCloseTo(0, 9); // el de abajo ni se enteró (sin roce)
  });

  it('choque frontal en un piso sin roce: e = 1 intercambia velocidades (masas iguales); e = 0 siguen juntos con v/2', () => {
    const escena = (): Elemento[] => [
      suelo(),
      { ...crearBloque({ x: -1, y: 0.2 }, 0.4, 0.4, { id: 'a', masa: 1, v0: { x: 2, y: 0 } }), apoyo: ['suelo'] } as Bloque,
      { ...crearBloque({ x: 0.5, y: 0.2 }, 0.4, 0.4, { id: 'b', masa: 1 }), apoyo: ['suelo'] } as Bloque,
    ];
    const elastico = new Simulacion(construirModelo(escena(), G), { h: 0.001, restitucion: 1 });
    for (let k = 0; k < 1000; k++) elastico.paso();
    expect(elastico.estado.v[0]!.x).toBeCloseTo(0, 9);
    expect(elastico.estado.v[1]!.x).toBeCloseTo(2, 9);
    expect(elastico.eventos.find((e) => e.tipo === 'rebote')!.t).toBeCloseTo(1.1 / 2, 6);
    expect(Math.abs(elastico.estado.W.impactos)).toBeLessThan(1e-9);
    const plastico = new Simulacion(construirModelo(escena(), G), { h: 0.001 });
    for (let k = 0; k < 1000; k++) plastico.paso();
    expect(plastico.estado.v[0]!.x).toBeCloseTo(1, 9);
    expect(plastico.estado.v[1]!.x).toBeCloseTo(1, 9);
    expect(plastico.estado.W.impactos).toBeCloseTo(-1, 6); // ΔK = ½·1·4 − ½·2·1
    expect(Math.abs(plastico.energiaActual().residuo)).toBeLessThan(1e-6);
  });

  it('choque oblicuo de dos esferas iguales (e = 1): salen en ángulo recto y se conservan p y K', () => {
    const a: Esfera = { ...crearEsfera({ x: -1, y: 0.1 }, 0.25, { id: 'a', masa: 1, v0: { x: 3, y: 0 } }), apoyo: [] };
    const b: Esfera = { ...crearEsfera({ x: 0, y: 0 }, 0.25, { id: 'b', masa: 1 }), apoyo: [] };
    const m = construirModelo([a, b], 0);
    const s = new Simulacion(m, { h: 0.001, restitucion: 1 });
    for (let k = 0; k < 600; k++) s.paso();
    const [va, vb] = s.estado.v as [{ x: number; y: number }, { x: number; y: number }];
    expect(va.x + vb.x).toBeCloseTo(3, 9);
    expect(va.y + vb.y).toBeCloseTo(0, 9);
    expect(va.x * vb.x + va.y * vb.y).toBeCloseTo(0, 9);
    expect(vb.y).toBeLessThan(0);
  });

  it('una pelota que cae sobre el suelo con e = 0,8 rebota hasta e² h', () => {
    const p: Esfera = { ...crearEsfera({ x: 0, y: 1.25 }, 0.25, { id: 'p', masa: 1 }), apoyo: [] };
    const s = new Simulacion(construirModelo([suelo(), p], G), { h: 0.001, restitucion: 0.8 });
    let ymax = 0;
    let rebotó = false;
    for (let k = 0; k < 1300; k++) {
      s.paso();
      if (s.eventos.some((e) => e.tipo === 'rebote')) rebotó = true;
      if (rebotó) ymax = Math.max(ymax, s.estado.p[0]!.y);
    }
    expect(ymax - 0.25).toBeCloseTo(0.64 * 1, 4);
  });

  it('un bloque que cae sobre otro queda encima (e = 0) y el sistema queda en reposo', () => {
    const b1: Bloque = { ...crearBloque({ x: 0, y: 0.2 }, 1, 0.4, { id: 'b1', masa: 2 }), apoyo: ['suelo'] };
    const b2: Bloque = { ...crearBloque({ x: 0.2, y: 1.5 }, 0.4, 0.4, { id: 'b2', masa: 1 }), apoyo: [] };
    const s = correr([suelo(), b1, b2], 1);
    expect(s.eventos.find((e) => e.tipo === 'choque')!.texto).toContain('cae sobre');
    expect(s.estado.p[1]!.y).toBeCloseTo(0.6, 9);
    expect(Math.hypot(s.estado.v[1]!.x, s.estado.v[1]!.y)).toBeLessThan(1e-9);
    expect(s.estado.Nc[0]).toBeCloseTo(G, 6);
    expect(s.descripcion(1)).toContain('sobre');
  });
});

describe('apilar en el editor y DCL de cuerpos apilados', () => {
  const suelo = crearSuperficie({ x: -3, y: 0 }, { x: 3, y: 0 }, { id: 'suelo' });
  const b1: Bloque = { ...crearBloque({ x: 0, y: 0.2 }, 1, 0.4, { id: 'b1', masa: 2, etiqueta: 'm_1' }), apoyo: ['suelo'] };

  it('un bloque soltado sobre otro queda justo encima, apoyado en él', () => {
    const suelto = crearBloque({ x: 0.2, y: 0.75 }, 0.5, 0.4, { id: 'b2', masa: 1, etiqueta: 'm_2' });
    const r = apoyar(suelto, [suelo, b1]);
    expect(r.apoyo).toEqual(['b1']);
    expect(r.centro).toEqual({ x: 0.2, y: 0.6 });
    // Lejos de la cara de arriba (o fuera de ella) no se apoya
    expect(apoyar({ ...suelto, centro: { x: 0.8, y: 0.6 } }, [suelo, b1]).apoyo).toEqual([]);
  });

  it('el DCL muestra N₁₂ hacia arriba sobre el de arriba y N₂₁ hacia abajo sobre el de abajo', () => {
    const b2: Bloque = { ...crearBloque({ x: 0, y: 0.6 }, 0.5, 0.4, { id: 'b2', masa: 1, etiqueta: 'm_2' }), apoyo: ['b1'] };
    const escena = [suelo, b1, b2];
    const arriba = resolverDcl(b2, escena, G).fuerzas.filter((f) => f.rol === 'normal');
    expect(arriba.map((f) => [f.simbolo, f.angulo])).toEqual([['N_{12}', Math.PI / 2]]);
    const abajo = resolverDcl(b1, escena, G).fuerzas.filter((f) => f.rol === 'normal');
    expect(abajo.map((f) => f.simbolo).sort()).toEqual(['N', 'N_{21}']);
    expect(abajo.find((f) => f.simbolo === 'N_{21}')!.angulo).toBeCloseTo(-Math.PI / 2, 12);
  });
});
