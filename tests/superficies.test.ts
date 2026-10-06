// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Bloque, Elemento, Esfera } from '../src/core/elementos';
import { apoyarEn, crearBloque, crearEsfera, crearSuperficie } from '../src/physics/objetos';
import { construirModelo } from '../src/sim/modelo';
import { Simulacion } from '../src/sim/motor';
import { analiticaVigente, errorMaximo, solucionAnalitica } from '../src/sim/analitico';

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

  it('la solución analítica (aceleración constante en el plano) vale solo hasta que pasa al piso', () => {
    const { piso, plano } = cunaEnPiso();
    const b0 = crearBloque({ x: 2 * Math.cos(th), y: 2 * Math.sin(th) + 0.3 }, 0.5, 0.4, { id: 'b', masa: 1 });
    const b: Bloque = { ...apoyarEn(b0, plano as never), apoyo: ['plano'] };
    const s = new Simulacion(construirModelo([piso, plano, b], G), { h: 0.001 });
    const an = solucionAnalitica(s, 0)!;
    expect(an.validoHasta).toBe(Infinity);
    for (let k = 0; k < 1600; k++) s.paso();
    const cambio = s.eventos.find((e) => e.tipo === 'cambia-superficie')!.t;
    const vig = analiticaVigente(s, 0, an);
    expect(vig.validoHasta).toBe(cambio);
    expect(errorMaximo(s, 0, vig).posicion).toBeLessThan(1e-6);
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

describe('superficies curvas', () => {
  const r = 0.25;

  /** Valle: semicircunferencia de radio R con centro en (0, R); fondo en el origen. */
  function valle(R: number, mu = 0): Elemento {
    return { ...crearSuperficie({ x: -R, y: R }, { x: R, y: R }, { id: 'valle', muS: mu, muK: mu * 0.8 }), barrido: Math.PI };
  }
  /** Esfera apoyada dentro del valle, a un ángulo φ del fondo. */
  function esferaEnValle(R: number, phi: number, extra: Partial<Esfera> = {}): Esfera {
    const d = R - r;
    const c = { x: d * Math.sin(phi), y: R - d * Math.cos(phi) };
    const e = { ...crearEsfera(c, r, { id: 'e', masa: 1, ...extra }), apoyo: ['valle'] } as Esfera;
    e.centro = c;
    return e;
  }

  /** Período: tiempo entre el 1.º y el 3.º cruce del fondo (x pasa por 0). */
  function periodo(s: Simulacion, t: number): number {
    const cruces: number[] = [];
    let xPrev = s.estado.p[0]!.x;
    for (let k = 0; k < Math.round(t / 0.001); k++) {
      s.paso();
      const x = s.estado.p[0]!.x;
      if (xPrev * x < 0) cruces.push(s.estado.t - (0.001 * x) / (x - xPrev));
      xPrev = x;
    }
    return cruces[2]! - cruces[0]!;
  }

  it('una esfera que desliza en un valle oscila con T = 2π √((R − r)/g) (amplitud pequeña) y conserva la energía', () => {
    const R = 2;
    const s = new Simulacion(construirModelo([valle(R), esferaEnValle(R, 0.05)], G), { h: 0.001 });
    expect(s.estado.modo[0]).toMatchObject({ k: 'desliza', s: 0 });
    const T = periodo(s, 6);
    expect(T).toBeCloseTo(2 * Math.PI * Math.sqrt((R - r) / G), 3);
    expect(Math.abs(s.energiaActual().residuo)).toBeLessThan(1e-6);
  });

  it('si rueda sin deslizar, el período es 2π √(7 (R − r)/(5 g))', () => {
    const R = 2;
    const s = new Simulacion(construirModelo([valle(R, 0.5), esferaEnValle(R, 0.05, { gira: true })], G), { h: 0.001 });
    const T = periodo(s, 6);
    expect(T).toBeCloseTo(2 * Math.PI * Math.sqrt((7 * (R - r)) / (5 * G)), 3);
    expect(Math.abs(s.energiaActual().residuo)).toBeLessThan(1e-6);
  });

  /** Loop de radio R con el fondo en el origen: arco antihorario de casi una vuelta que empieza en el fondo. */
  function loop(R: number): Elemento {
    const beta = 2 * Math.PI - 0.3;
    const b = { x: R * Math.cos(-Math.PI / 2 + beta), y: R + R * Math.sin(-Math.PI / 2 + beta) };
    return { ...crearSuperficie({ x: 0, y: 0 }, { x: 0, y: 0 }, { id: 'loop' }), b, barrido: beta };
  }
  function enElFondo(v0: number): Esfera {
    const e = { ...crearEsfera({ x: 0, y: r }, r, { id: 'e', masa: 1, v0: { x: v0, y: 0 } }), apoyo: ['loop'] } as Esfera;
    e.centro = { x: 0.0001, y: r };
    return e;
  }

  it('loop: con v₀² = 5 g (R − r) + un poco da la vuelta; arriba N = m (v²/ρ − g) ≥ 0', () => {
    const R = 1;
    const rho = R - r;
    const v0 = Math.sqrt(5 * G * rho) * 1.02;
    const s = new Simulacion(construirModelo([loop(R), enElFondo(v0)], G), { h: 0.001 });
    let arriba = false;
    for (let k = 0; k < 1500 && !arriba; k++) {
      s.paso();
      if (s.estado.p[0]!.y > 2 * R - r - 1e-3 && Math.abs(s.estado.p[0]!.x) < 0.02) arriba = true;
    }
    expect(arriba).toBe(true);
    expect(s.eventos.some((x) => x.tipo === 'despegue')).toBe(false);
    const v = Math.hypot(s.estado.v[0]!.x, s.estado.v[0]!.y);
    expect(s.estado.N[0]).toBeCloseTo(v * v / rho - G, 1);
    expect(s.estado.N[0]).toBeGreaterThan(0);
    expect(Math.abs(s.energiaActual().residuo)).toBeLessThan(1e-6);
  });

  it('loop: con v₀² = 4 g (R − r) se despega antes de llegar arriba (donde N = 0: cos θ = −2/3 … desde el fondo)', () => {
    const R = 1;
    const rho = R - r;
    const s = new Simulacion(construirModelo([loop(R), enElFondo(Math.sqrt(4 * G * rho))], G), { h: 0.001 });
    for (let k = 0; k < 1500 && !s.eventos.some((x) => x.tipo === 'despegue'); k++) s.paso();
    expect(s.eventos.some((x) => x.tipo === 'despegue')).toBe(true);
    // N = 0 cuando v² = −g ρ cos α (α desde el fondo): con v² = v₀² − 2 g ρ (1 − cos α) ⇒ cos α = −(v₀²/(gρ) − 2)/3 = −2/3
    const altura = s.estado.p[0]!.y - r;
    expect(altura / rho).toBeCloseTo(1 + 2 / 3, 2);
  });

  it('loma: partiendo casi quieta desde arriba, se despega a cos θ = 2/3 (bajó ρ/3)', () => {
    const R = 2;
    const loma = { ...crearSuperficie({ x: -R, y: 0 }, { x: R, y: 0 }, { id: 'loma' }), barrido: -Math.PI } as Elemento;
    const rho = R + r;
    const e = { ...crearEsfera({ x: 0, y: rho }, r, { id: 'e', masa: 1, v0: { x: 0.01, y: 0 } }), apoyo: ['loma'] } as Esfera;
    e.centro = { x: 0, y: rho };
    const s = new Simulacion(construirModelo([loma, e], G), { h: 0.001 });
    expect(s.estado.modo[0]).toMatchObject({ k: 'desliza', s: 0 });
    for (let k = 0; k < 4000 && !s.eventos.some((x) => x.tipo === 'despegue'); k++) s.paso();
    expect(s.eventos.some((x) => x.tipo === 'despegue')).toBe(true);
    expect(s.estado.p[0]!.y / rho).toBeCloseTo(2 / 3, 2);
  });

  it('un bloque que no gira desliza por el valle alineado con la curva', () => {
    const R = 2;
    const phi = 0.6;
    const d = R - 0.2;
    const b: Bloque = { ...crearBloque({ x: d * Math.sin(phi), y: R - d * Math.cos(phi) }, 0.5, 0.4, { id: 'b', masa: 1, angulo: phi }), apoyo: ['valle'] };
    b.centro = { x: d * Math.sin(phi), y: R - d * Math.cos(phi) };
    const s = simular([valle(R), b], 0.4);
    const ang = Math.atan2(s.estado.p[0]!.x, R - s.estado.p[0]!.y); // ángulo desde el fondo
    expect(s.estado.th[0]).toBeCloseTo(ang, 6);
    expect(Math.hypot(s.estado.p[0]!.x, s.estado.p[0]!.y - R)).toBeCloseTo(d, 9);
    expect(Math.abs(s.energiaActual().residuo)).toBeLessThan(1e-6);
  });
});
