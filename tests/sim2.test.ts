// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Elemento } from '../src/core/elementos';
import { crearBloque, crearCuerda, crearEsfera, crearPolea, crearResorte, crearSuperficie, normalSuperficie } from '../src/physics/objetos';
import { aRadianes } from '../src/physics/vectores';
import { errorMaximo, primerEvento, solucionAnalitica } from '../src/sim/analitico';
import { construirModelo } from '../src/sim/modelo';
import { Simulacion } from '../src/sim/motor';
import { aCsv, decimar, filasTabla, graficoATikz, graficoDe } from '../src/sim/series';

const G = 9.8;
const sim = (escena: Elemento[], h = 0.001): Simulacion => new Simulacion(construirModelo(escena, G), { h });
const correr = (s: Simulacion, t: number): void => {
  for (let k = 0; k < Math.round(t / s.h); k++) s.paso();
};

describe('solución analítica y comparación', () => {
  it('proyectil: la simulación coincide con x₀ + v₀t + ½at² hasta el impacto (error < 1e-9 m)', () => {
    const suelo = crearSuperficie({ x: -5, y: 0 }, { x: 40, y: 0 });
    const bala = crearEsfera({ x: 0, y: 2.1 }, 0.1, { masa: 0.5, v0: { x: 9, y: 7 } });
    const s = sim([suelo, bala]);
    correr(s, 2);
    const an = solucionAnalitica(s, 0)!;
    expect(an.tipo).toBe('aceleracion-constante');
    expect(an.validoHasta).toBeCloseTo(s.eventos.find((e) => e.tipo === 'impacto')!.t, 9);
    const err = errorMaximo(s, 0, an);
    expect(err.muestras).toBeGreaterThan(50);
    expect(err.posicion).toBeLessThan(1e-9);
    expect(err.velocidad).toBeLessThan(1e-9);
  });

  it('plano inclinado con roce cinético: coincide hasta que se detiene (error < 1e-6)', () => {
    const th = aRadianes(25);
    const a = { x: -3, y: -1 };
    const sup = crearSuperficie(a, { x: a.x + 12 * Math.cos(th), y: a.y + 12 * Math.sin(th) }, { muS: 0.3, muK: 0.15 });
    const n = normalSuperficie(sup);
    const v0 = 3;
    const b = crearBloque({ x: a.x + 2 * Math.cos(th) + n.x * 0.2, y: a.y + 2 * Math.sin(th) + n.y * 0.2 }, 0.5, 0.4, {
      angulo: th,
      masa: 2,
      v0: { x: v0 * Math.cos(th), y: v0 * Math.sin(th) },
    });
    const s = sim([sup, b]);
    correr(s, 2);
    const an = solucionAnalitica(s, 0)!;
    const tStop = v0 / (G * (Math.sin(th) + 0.15 * Math.cos(th)));
    expect(an.validoHasta).toBeCloseTo(tStop, 3);
    expect(errorMaximo(s, 0, an).posicion).toBeLessThan(1e-3); // las coordenadas de la superficie tienen 0,1 mm
  });

  it('masa-resorte sobre piso sin roce: x(t) y el período coinciden con A cos ωt (error < 1e-7)', () => {
    const piso = crearSuperficie({ x: -6, y: 0 }, { x: 6, y: 0 }, { muS: 0, muK: 0 });
    const b = crearBloque({ x: 0, y: 0.3 }, 0.6, 0.6, { masa: 2 });
    const r = crearResorte({ x: -2.3, y: 0.3 }, { x: -0.3, y: 0.3 }, { k: 50, largoNatural: 1.5 });
    const s = sim([piso, b, r], 0.0005);
    correr(s, 3);
    const an = solucionAnalitica(s, 0)!;
    expect(an.tipo).toBe('armonico');
    expect(an.periodo).toBeCloseTo(2 * Math.PI * Math.sqrt(2 / 50), 12);
    expect(an.validoHasta).toBe(Infinity);
    const err = errorMaximo(s, 0, an);
    expect(err.posicion).toBeLessThan(1e-7);
    expect(err.velocidad).toBeLessThan(1e-6);
  });

  it('resorte vertical con gravedad: oscila alrededor de m g / k (error < 1e-7)', () => {
    const b = crearEsfera({ x: 0, y: 0 }, 0.1, { masa: 1 });
    const r = crearResorte({ x: 0, y: 2.1 }, { x: 0, y: 0.1 }, { k: 40, largoNatural: 2 });
    const s = sim([b, r], 0.0005);
    correr(s, 2);
    const an = solucionAnalitica(s, 0)!;
    expect(an.tipo).toBe('armonico');
    expect(errorMaximo(s, 0, an).posicion).toBeLessThan(1e-7);
  });

  it('no hay solución analítica con cuerdas, con roce en un resorte o con dos resortes', () => {
    const b = crearEsfera({ x: 0, y: 0 }, 0.1, { masa: 1 });
    expect(solucionAnalitica(sim([b, crearCuerda({ x: 0, y: 2 }, { x: 0, y: 0.1 })]), 0)).toBeNull();
    const piso = crearSuperficie({ x: -4, y: -0.1 }, { x: 4, y: -0.1 }, { muS: 0.3, muK: 0.2 });
    const r = crearResorte({ x: -2, y: 0 }, { x: -0.1, y: 0 }, { k: 20, largoNatural: 1 });
    expect(solucionAnalitica(sim([piso, b, r]), 0)).toBeNull();
    const r2 = crearResorte({ x: 2, y: 0 }, { x: 0.1, y: 0 }, { k: 20, largoNatural: 1 });
    expect(solucionAnalitica(sim([b, r, r2]), 0)).toBeNull();
    expect(solucionAnalitica(sim([crearPolea({ x: 0, y: 5 }, 0.3)]), 0)).toBeNull(); // sin cuerpos
  });

  it('primerEvento ignora la detención y el paso por el largo natural', () => {
    expect(primerEvento([{ t: 1, tipo: 'resorte-natural', cuerpo: 0, texto: '' }, { t: 2, tipo: 'impacto', cuerpo: 0, texto: '' }], 0)).toBe(2);
    expect(primerEvento([], 0)).toBe(Infinity);
    expect(primerEvento([{ t: 1, tipo: 'impacto', cuerpo: 1, texto: '' }], 0)).toBe(Infinity);
  });
});

describe('series, tabla y CSV', () => {
  const caida = (): Simulacion => {
    const s = sim([crearEsfera({ x: 0, y: 10 }, 0.1, { masa: 2, v0: { x: 1, y: 0 } })]);
    correr(s, 1);
    return s;
  };

  it('el gráfico de posición trae x e y, y la analítica punteada si se pide', () => {
    const s = caida();
    const g = graficoDe(s, 0, 'posicion', solucionAnalitica(s, 0));
    expect(g.series.map((x) => x.nombre)).toContain('x');
    expect(g.series.filter((x) => x.discontinua)).toHaveLength(2);
    const sin = graficoDe(s, 0, 'posicion', null);
    expect(sin.series.filter((x) => x.discontinua)).toHaveLength(0);
    const y = sin.series.find((x) => x.nombre === 'y')!;
    expect(y.puntos.at(-1)![1]).toBeCloseTo(10 - 0.5 * G, 6);
  });

  it('el gráfico de energía muestra K, U_g, U_e, E_mec y el trabajo del roce', () => {
    const g = graficoDe(caida(), 0, 'energia');
    expect(g.series.map((x) => x.nombre)).toEqual(['K', 'U_g', 'U_e', 'E_{mec}', 'W_{roce}']);
    const E = g.series.find((x) => x.nombre === 'E_{mec}')!.puntos;
    expect(Math.max(...E.map((p) => p[1])) - Math.min(...E.map((p) => p[1]))).toBeLessThan(1e-8); // constante
  });

  it('la tabla trae una fila cada 0,1 s con la rapidez y la energía', () => {
    const f = filasTabla(caida(), 0, 0.1);
    expect(f.length).toBeGreaterThanOrEqual(10);
    expect(f[0]!.t).toBe(0);
    expect(f[1]!.t).toBeCloseTo(0.1, 2);
    expect(f.at(-1)!.v).toBeCloseTo(Math.hypot(1, G), 3);
    expect(filasTabla(caida(), 0, 0.1, 3)).toHaveLength(3);
  });

  it('el CSV usa ; y coma decimal por defecto (Excel en español) y trae todas las muestras', () => {
    const s = caida();
    const csv = aCsv(s);
    const lineas = csv.trim().split('\r\n');
    expect(lineas[0]).toContain('t (s);x (m);y (m)');
    expect(lineas).toHaveLength(s.historial.length + 1);
    expect(lineas[1]!.split(';')[0]).toBe('0');
    expect(lineas.at(-1)).toMatch(/^1;1;/);
    expect(lineas.at(-1)).toContain(',');
    const punto = aCsv(s, { separador: ',', decimal: '.' }).trim().split('\r\n');
    expect(punto[0]!.split(',').length).toBe(lineas[0]!.split(';').length);
    expect(punto.at(-1)!).toContain('5.1');
  });

  it('con varios cuerpos el CSV numera las columnas', () => {
    const s = sim([crearEsfera({ x: 0, y: 5 }, 0.1), crearEsfera({ x: 1, y: 5 }, 0.1)]);
    expect(aCsv(s).split('\r\n')[0]).toContain('x 1 (m);y 1 (m)');
    expect(aCsv(s).split('\r\n')[0]).toContain('x 2 (m)');
  });

  it('decimar conserva los extremos y el orden', () => {
    const pts = Array.from({ length: 1000 }, (_, i) => i);
    const d = decimar(pts, 50);
    expect(d).toHaveLength(50);
    expect(d[0]).toBe(0);
    expect(d.at(-1)).toBe(999);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
    expect(decimar([1, 2, 3], 50)).toEqual([1, 2, 3]);
  });

  it('el historial no crece sin límite: se aligera y el período de muestreo se duplica', () => {
    const s = sim([crearEsfera({ x: 0, y: 1000 }, 0.1)], 0.001);
    s.avanzar(250, 300_000);
    expect(s.historial.length).toBeLessThanOrEqual(20000);
    expect(s.historial.at(-1)!.t).toBeGreaterThan(200);
  }, 30_000); // 250 s simulados: ~3 s en un PC y más en la CI
});

describe('gráfico a TikZ (pgfplots)', () => {
  const s = (() => {
    const x = sim([crearEsfera({ x: 0, y: 10 }, 0.1, { masa: 2 })]);
    correr(x, 1);
    return x;
  })();

  it('un gráfico por curva, con leyenda en matemática, la analítica punteada y colores definidos adentro', () => {
    const g = graficoDe(s, 0, 'posicion', solucionAnalitica(s, 0));
    const t = graficoATikz(g);
    expect(t).toContain('\\begin{axis}');
    expect(t).toContain('xlabel={$t$ (s)}');
    expect(t).toContain('ylabel={Posición (m)}');
    expect(t).toContain('\\addlegendentry{$x$}');
    expect(t).toContain('dashed, thick');
    expect(t).toContain('\\definecolor{pzcontacto}{HTML}{0B6FA8}');
    expect((t.match(/\\addplot/g) ?? []).length).toBe(g.series.length);
    expect(t).toContain('\\usepackage{pgfplots}');
  });

  it('limita los puntos por curva y no deja texto en inglés', () => {
    const t = graficoATikz(graficoDe(s, 0, 'energia'), { puntos: 20 });
    const primera = /coordinates \{([^}]*)\}/.exec(t)![1]!;
    expect(primera.split(') (').length).toBeLessThanOrEqual(20);
    expect(t).not.toMatch(/\b(Position|Time|Energy)\b/);
  });

  it('el modo documento es standalone y compilable', () => {
    const t = graficoATikz(graficoDe(s, 0, 'velocidad'), { modo: 'documento', anchoCm: 10, altoCm: 6 });
    expect(t).toContain('\\documentclass[tikz,border=4pt]{standalone}');
    expect(t).toContain('\\pgfplotsset{compat=1.17}');
    expect(t).toContain('width=10cm, height=6cm');
  });
});
