import { describe, expect, it } from 'vitest';
import type { Bloque, Elemento, Superficie } from '../src/core/elementos';
import { construirDcl, contactoCon, distanciaAlCuerpo, escalaFlechas, planteamiento, resolverDcl, simboloEscalar } from '../src/physics/dcl';
import type { ModoRoce } from '../src/physics/dcl';
import { achurado, crearBloque, crearCuerda, crearEsfera, crearResorte, crearSuperficie, normalSuperficie, puntosResorte, trianguloCuna } from '../src/physics/objetos';
import { aGrados, aRadianes, crearVector, modulo, vectorPorValores } from '../src/physics/vectores';

const G = 9.8;

/** Plano inclinado θ que sube hacia la derecha, con un bloque de masa `m` apoyado y alineado. */
function plano(thetaDeg: number, muS: number, muK: number, m = 3): { sup: Superficie; bloque: Bloque; escena: Elemento[] } {
  const th = aRadianes(thetaDeg);
  const a = { x: -3, y: -2 };
  const sup = crearSuperficie(a, { x: a.x + 6 * Math.cos(th), y: a.y + 6 * Math.sin(th) }, { muS, muK });
  const n = normalSuperficie(sup);
  const alto = 0.6;
  const bloque = crearBloque({ x: a.x + 3 * Math.cos(th) + n.x * (alto / 2), y: a.y + 3 * Math.sin(th) + n.y * (alto / 2) }, 0.9, alto, { masa: m, angulo: th, etiqueta: 'm' });
  return { sup, bloque, escena: [sup, bloque] };
}

describe('contacto y geometría', () => {
  it('un bloque apoyado en una superficie la toca; uno en el aire, no', () => {
    const suelo = crearSuperficie({ x: -3, y: 0 }, { x: 3, y: 0 });
    expect(contactoCon(crearBloque({ x: 0, y: 0.3 }, 0.9, 0.6), suelo)).not.toBeNull();
    expect(contactoCon(crearBloque({ x: 0, y: 1.5 }, 0.9, 0.6), suelo)).toBeNull();
    expect(contactoCon(crearBloque({ x: 8, y: 0.3 }, 0.9, 0.6), suelo)).toBeNull(); // fuera del largo de la superficie
  });

  it('la normal del contacto apunta hacia el lado donde está el cuerpo', () => {
    const suelo = crearSuperficie({ x: -3, y: 0 }, { x: 3, y: 0 });
    const arriba = contactoCon(crearBloque({ x: 0, y: 0.3 }, 0.9, 0.6), suelo)!;
    expect(arriba.normal.y).toBeCloseTo(1);
    const techo = contactoCon(crearBloque({ x: 0, y: -0.3 }, 0.9, 0.6), suelo)!; // colgado por debajo
    expect(techo.normal.y).toBeCloseTo(-1);
  });

  it('una esfera toca el suelo en su punto más bajo', () => {
    const suelo = crearSuperficie({ x: -3, y: 0 }, { x: 3, y: 0 });
    expect(contactoCon(crearEsfera({ x: 0, y: 0.35 }, 0.35), suelo)).not.toBeNull();
  });

  it('distancia de un punto a un bloque girado', () => {
    const b = crearBloque({ x: 0, y: 0 }, 2, 1, { angulo: Math.PI / 2 }); // queda de pie: 1 de ancho, 2 de alto
    expect(distanciaAlCuerpo(b, { x: 0, y: 0.9 })).toBe(0);
    expect(distanciaAlCuerpo(b, { x: 1, y: 0 })).toBeCloseTo(0.5);
  });

  it('el achurado cae del lado sólido (opuesto a la normal) y la cuña cierra el triángulo por abajo', () => {
    const s = crearSuperficie({ x: 0, y: 0 }, { x: 4, y: 2 });
    const n = normalSuperficie(s);
    for (const [desde, hasta] of achurado(s)) expect((hasta.x - desde.x) * n.x + (hasta.y - desde.y) * n.y).toBeLessThan(0);
    const [, , esquina] = trianguloCuna(s);
    expect(esquina).toEqual({ x: 4, y: 0 }); // el lado sólido de una rampa que sube a la derecha es la esquina inferior derecha
  });

  it('el zigzag del resorte empieza y termina en sus extremos', () => {
    const r = crearResorte({ x: 0, y: 0 }, { x: 3, y: 0 });
    const p = puntosResorte(r);
    expect(p[0]).toEqual(r.a);
    expect(p.at(-1)).toEqual(r.b);
    expect(p.length).toBeGreaterThan(10);
  });
});

describe('DCL en un plano inclinado (contra las fórmulas del curso)', () => {
  it('sin roce: a = −g sen θ a lo largo del plano y N = m g cos θ', () => {
    const { bloque, escena } = plano(30, 0, 0, 3);
    const r = resolverDcl(bloque, escena, G);
    expect(r.superficie).not.toBeNull();
    expect(aGrados(r.anguloEjes)).toBeCloseTo(30, 3);
    expect(aGrados(r.inclinacion!)).toBeCloseTo(30, 3);
    const normal = r.fuerzas.find((f) => f.rol === 'normal')!;
    expect(normal.valor!).toBeCloseTo(3 * G * Math.cos(aRadianes(30)), 3);
    expect(r.aceleracion.x!).toBeCloseTo(-G * Math.sin(aRadianes(30)), 3); // x sube por el plano: acelera hacia abajo
    expect(r.aceleracion.y).toBe(0);
    expect(r.fuerzas.some((f) => f.rol === 'friccion')).toBe(false);
  });

  it('con roce desliza con a = g (sen θ − μk cos θ) cuando tan θ > μs', () => {
    const { bloque, escena } = plano(30, 0.2, 0.1, 3);
    const r = resolverDcl(bloque, escena, G);
    expect(r.estadoRoce).toBe('cinetico');
    const a = G * (Math.sin(aRadianes(30)) - 0.1 * Math.cos(aRadianes(30)));
    expect(r.aceleracion.x!).toBeCloseTo(-a, 3);
    const f = r.fuerzas.find((x) => x.rol === 'friccion')!;
    expect(f.valor!).toBeCloseTo(0.1 * 3 * G * Math.cos(aRadianes(30)), 3);
    expect(aGrados(f.angulo)).toBeCloseTo(30, 3); // el roce apunta plano arriba
  });

  it('en reposo cuando tan θ ≤ μs: el roce estático iguala a m g sen θ', () => {
    const { bloque, escena } = plano(30, 0.8, 0.6, 3);
    const r = resolverDcl(bloque, escena, G);
    expect(r.estadoRoce).toBe('estatico');
    expect(r.aceleracion.x).toBe(0);
    const f = r.fuerzas.find((x) => x.rol === 'friccion')!;
    expect(f.valor!).toBeCloseTo(3 * G * Math.sin(aRadianes(30)), 3);
    expect(r.avisos).toEqual([]);
  });

  it.each([5, 10, 20, 30, 40, 55, 70])('barrido de ángulos θ = %d°: reposo si tan θ ≤ μs, si no a = g(sen θ − μk cos θ)', (th) => {
    for (const [muS, muK] of [[0.3, 0.2], [0.6, 0.4], [1.0, 0.7], [0.15, 0.05]] as const) {
      const { bloque, escena } = plano(th, muS, muK, 4.5);
      const r = resolverDcl(bloque, escena, G);
      const t = aRadianes(th);
      if (Math.tan(t) <= muS) {
        expect(r.aceleracion.x).toBe(0);
        expect(r.estadoRoce).toBe('estatico');
      } else {
        expect(r.aceleracion.x!).toBeCloseTo(-G * (Math.sin(t) - muK * Math.cos(t)), 3);
        expect(r.estadoRoce).toBe('cinetico');
      }
      expect(r.fuerzas.find((f) => f.rol === 'normal')!.valor!).toBeCloseTo(4.5 * G * Math.cos(t), 3);
    }
  });

  it('en el límite tan θ = μs (±0,003) pasa de reposo a movimiento', () => {
    const th = 25;
    const mu = Math.tan(aRadianes(th));
    const quieto = plano(th, mu + 0.003, mu * 0.8);
    expect(resolverDcl(quieto.bloque, quieto.escena).aceleracion.x).toBe(0);
    const mueve = plano(th, mu - 0.003, mu * 0.8);
    expect(resolverDcl(mueve.bloque, mueve.escena).aceleracion.x!).toBeLessThan(0);
  });

  it('el modo "sin roce" ignora los coeficientes de la superficie', () => {
    const { bloque, escena } = plano(30, 0.8, 0.6);
    const r = resolverDcl(bloque, escena, G, 'ninguno');
    expect(r.aceleracion.x!).toBeCloseTo(-G * Math.sin(aRadianes(30)), 3);
  });
});

describe('DCL en un piso horizontal', () => {
  const piso = (mu: [number, number]) => crearSuperficie({ x: -4, y: 0 }, { x: 4, y: 0 }, { muS: mu[0], muK: mu[1] });
  const bloque = crearBloque({ x: 0, y: 0.3 }, 0.9, 0.6, { masa: 5 });

  it('en reposo sobre el piso: N = m g, sin roce y sin aceleración', () => {
    const r = resolverDcl(bloque, [piso([0.5, 0.3]), bloque], G);
    expect(r.fuerzas.find((f) => f.rol === 'normal')!.valor!).toBeCloseTo(49, 3);
    expect(r.aceleracion.x).toBe(0);
    expect(r.fuerzas.find((f) => f.rol === 'friccion')!.valor).toBe(0);
  });

  it('empuje de 30 N con μs = 0,5 y μk = 0,3: vence el roce máximo (24,5 N) y acelera a = (30 − 14,7)/5', () => {
    const F = vectorPorValores('aplicada', bloque.centro, 30, 0, null);
    const r = resolverDcl(bloque, [piso([0.5, 0.3]), bloque, F], G);
    expect(r.estadoRoce).toBe('cinetico');
    expect(r.aceleracion.x!).toBeCloseTo((30 - 0.3 * 49) / 5, 3);
    expect(r.fuerzas.find((f) => f.rol === 'friccion')!.valor!).toBeCloseTo(14.7, 3);
  });

  it('empuje de 20 N: no vence el roce estático y el cuerpo sigue quieto con f = 20 N', () => {
    const F = vectorPorValores('aplicada', bloque.centro, 20, 0, null);
    const r = resolverDcl(bloque, [piso([0.5, 0.3]), bloque, F], G);
    expect(r.estadoRoce).toBe('estatico');
    expect(r.aceleracion.x).toBe(0);
    const f = r.fuerzas.find((x) => x.rol === 'friccion')!;
    expect(f.valor!).toBeCloseTo(20, 3);
    expect(aGrados(f.angulo)).toBeCloseTo(180, 3); // opuesto al empuje
  });

  it('una fuerza oblicua hacia arriba reduce la normal: N = m g − F sen φ', () => {
    const F = vectorPorValores('aplicada', bloque.centro, 20, 30, null);
    const r = resolverDcl(bloque, [piso([0.5, 0.3]), bloque, F], G);
    expect(r.fuerzas.find((f) => f.rol === 'normal')!.valor!).toBeCloseTo(49 - 20 * Math.sin(aRadianes(30)), 3);
  });

  it('si la fuerza hacia arriba supera al peso, el cuerpo se despega y se avisa', () => {
    const F = vectorPorValores('aplicada', bloque.centro, 80, 90, null);
    const r = resolverDcl(bloque, [piso([0.5, 0.3]), bloque, F], G);
    expect(r.fuerzas.find((f) => f.rol === 'normal')!.valor).toBe(0);
    expect(r.avisos.some((a) => a.includes('despega'))).toBe(true);
  });

  it('el modo estático avisa si el roce necesario supera μs·N', () => {
    const F = vectorPorValores('aplicada', bloque.centro, 40, 0, null);
    const r = resolverDcl(bloque, [piso([0.5, 0.3]), bloque, F], G, 'estatico' as ModoRoce);
    expect(r.avisos.some((a) => a.includes('roce estático'))).toBe(true);
  });
});

describe('DCL sin superficie, con cuerdas y con resortes', () => {
  it('caída libre: a = −g y solo actúa el peso', () => {
    const b = crearBloque({ x: 0, y: 5 }, 0.9, 0.6, { masa: 2 });
    const r = resolverDcl(b, [b], G);
    expect(r.fuerzas).toHaveLength(1);
    expect(r.aceleracion.y!).toBeCloseTo(-G, 9);
    expect(r.aceleracion.x!).toBeCloseTo(0, 9);
    expect(r.inclinacion).toBeNull();
  });

  it('un bloque colgado de una cuerda: la tensión sube y su valor queda como incógnita', () => {
    const b = crearBloque({ x: 0, y: 0 }, 0.8, 0.6, { masa: 2 });
    const cuerda = crearCuerda({ x: 0, y: 0.3 }, { x: 0, y: 2 });
    const r = resolverDcl(b, [b, cuerda], G);
    const t = r.fuerzas.find((f) => f.rol === 'tension')!;
    expect(aGrados(t.angulo)).toBeCloseTo(90, 3);
    expect(t.valor).toBeNull();
    expect(r.aceleracion.y).toBeNull();
    expect(r.avisos.some((a) => a.includes('incógnitas'))).toBe(true);
    expect(planteamiento(r).y).toBe('\\sum F_y = -2 g + T = 2\\,a_y'.replace('2 g', 'm g').replace('2\\,a_y', 'm\\,a_y'));
  });

  it('un resorte estirado tira hacia su otro extremo con k·x; comprimido, empuja hacia afuera', () => {
    const b = crearBloque({ x: 0, y: 0 }, 0.8, 0.6, { masa: 2 });
    const estirado = crearResorte({ x: 0.4, y: 0 }, { x: 2.4, y: 0 }, { k: 50, largoNatural: 1.5 }); // 2,0 m, natural 1,5 m
    const r = resolverDcl(b, [b, estirado], G);
    const fe = r.fuerzas.find((f) => f.simbolo.startsWith('F_{el'))!;
    expect(fe.valor!).toBeCloseTo(25, 3);
    expect(aGrados(fe.angulo)).toBeCloseTo(0, 3);

    const comprimido = crearResorte({ x: 0.4, y: 0 }, { x: 1.2, y: 0 }, { k: 50, largoNatural: 1.5 }); // 0,8 m
    const r2 = resolverDcl(b, [b, comprimido], G);
    const fc = r2.fuerzas.find((f) => f.simbolo.startsWith('F_{el'))!;
    expect(fc.valor!).toBeCloseTo(35, 3);
    expect(Math.abs(aGrados(fc.angulo))).toBeCloseTo(180, 3);
  });

  it('un resorte en su largo natural no ejerce fuerza', () => {
    const b = crearBloque({ x: 0, y: 0 }, 0.8, 0.6);
    const r = resolverDcl(b, [b, crearResorte({ x: 0.4, y: 0 }, { x: 1.9, y: 0 }, { largoNatural: 1.5 })], G);
    expect(r.fuerzas).toHaveLength(1);
  });

  it('ignora vectores que no salen del cuerpo, fantasmas y los de otros roles', () => {
    const b = crearBloque({ x: 0, y: 0 }, 0.8, 0.6);
    const lejos = crearVector('aplicada', { x: 5, y: 5 }, { x: 6, y: 5 });
    const fantasma = crearVector('aplicada', { x: 0, y: 0 }, { x: 1, y: 0 }, { fantasma: true });
    const velocidad = crearVector('velocidad', { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(resolverDcl(b, [b, lejos, fantasma, velocidad], G).fuerzas).toHaveLength(1);
  });
});

describe('planteamiento ΣF = m a', () => {
  it('en el plano inclinado usa sen θ y cos θ y deja el roce como f_k', () => {
    const { bloque, escena } = plano(30, 0.2, 0.1);
    const p = planteamiento(resolverDcl(bloque, escena, G));
    expect(p.x).toContain('m g\\sin\\theta');
    expect(p.x).toContain('f_k');
    expect(p.x.startsWith('\\sum F_x = -m g\\sin\\theta')).toBe(true);
    expect(p.y).toContain('N');
    expect(p.y).toContain('m g\\cos\\theta');
    expect(p.y.endsWith('= 0')).toBe(true);
    expect(p.lineas.some((l) => l.includes('\\theta=30'))).toBe(true);
    expect(p.numerica).toContain('N=');
  });

  it('en reposo estático la ecuación a lo largo del plano iguala a cero', () => {
    const { bloque, escena } = plano(30, 0.8, 0.6);
    expect(planteamiento(resolverDcl(bloque, escena, G)).x.endsWith('= 0')).toBe(true);
  });

  it('sobre el piso: N − m g = 0 y la fuerza horizontal en el eje x', () => {
    const piso = crearSuperficie({ x: -4, y: 0 }, { x: 4, y: 0 }, { muS: 0.5, muK: 0.3 });
    const b = crearBloque({ x: 0, y: 0.3 }, 0.9, 0.6, { masa: 5 });
    const F = vectorPorValores('aplicada', b.centro, 30, 0, null, { etiqueta: '\\vec{F}' });
    const p = planteamiento(resolverDcl(b, [piso, b, F], G));
    expect(p.x).toBe('\\sum F_x = F - f_k = m\\,a');
    expect(p.y).toBe('\\sum F_y = -m g + N = 0');
  });

  it('un ángulo cualquiera de una fuerza aplicada sale con cos y sen de ese ángulo', () => {
    const piso = crearSuperficie({ x: -4, y: 0 }, { x: 4, y: 0 }, { muS: 0.5, muK: 0.3 });
    const b = crearBloque({ x: 0, y: 0.3 }, 0.9, 0.6, { masa: 5 });
    const F = vectorPorValores('aplicada', b.centro, 30, 35, null);
    const p = planteamiento(resolverDcl(b, [piso, b, F], G));
    expect(p.x).toContain('F\\cos\\left(35^{\\circ}\\right)');
    expect(p.y).toContain('F\\sin\\left(35^{\\circ}\\right)');
  });

  it('los símbolos de la masa salen de la etiqueta del cuerpo', () => {
    const b = crearBloque({ x: 0, y: 5 }, 0.9, 0.6, { masa: 2, etiqueta: 'm_1' });
    expect(planteamiento(resolverDcl(b, [b], G)).y).toContain('m_1 g');
  });

  it('simboloEscalar quita el \\vec de la etiqueta', () => {
    expect(simboloEscalar('\\vec{F}')).toBe('F');
    expect(simboloEscalar('\\vec{T}_1')).toBe('T_1');
    expect(simboloEscalar('P')).toBe('P');
  });
});

describe('construcción del diagrama', () => {
  it('la fuerza mayor mide entre 0,85 y 2,2 m y todas comparten la escala', () => {
    for (const mayor of [3, 49, 98, 500, 12345]) {
      const porMetro = escalaFlechas([mayor, mayor / 3]);
      expect(mayor / porMetro).toBeGreaterThan(0.85);
      expect(mayor / porMetro).toBeLessThanOrEqual(2.2 + 1e-9);
    }
  });

  it('el DCL trae el cuerpo, los ejes alineados, un vector por fuerza (a escala) y el planteamiento', () => {
    const { bloque, escena } = plano(30, 0.2, 0.1, 3);
    const r = resolverDcl(bloque, escena, G);
    const elementos = construirDcl(r, { x: 6, y: 0 });
    const tipos = elementos.map((e) => e.tipo);
    expect(tipos.filter((t) => t === 'vector')).toHaveLength(r.fuerzas.length);
    expect(tipos).toContain('bloque');
    expect(tipos).toContain('ejes');
    expect(tipos).toContain('texto');
    const ejes = elementos.find((e) => e.tipo === 'ejes')!;
    if (ejes.tipo === 'ejes') expect(aGrados(ejes.angulo)).toBeCloseTo(30, 3);
    for (const v of elementos) {
      if (v.tipo !== 'vector') continue;
      const f = r.fuerzas.find((x) => x.etiqueta === v.etiqueta)!;
      expect(modulo(v)).toBeCloseTo(f.valor!, 2); // la flecha mide su valor a la escala común
      expect(v.a).toEqual({ x: 6, y: 0 });
      expect(v.ref).toBe(ejes.id);
    }
  });

  it('los ids del diagrama son nuevos (no pisan los de la escena)', () => {
    const { bloque, escena } = plano(30, 0, 0);
    const ids = new Set(escena.map((e) => e.id));
    for (const e of construirDcl(resolverDcl(bloque, escena, G), { x: 6, y: 0 })) expect(ids.has(e.id)).toBe(false);
  });
});
