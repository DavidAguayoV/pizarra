import { describe, expect, it } from 'vitest';
import {
  anclaEtiquetaVector,
  anguloRespecto,
  aGrados,
  aRadianes,
  arcoAngulo,
  conValores,
  crearEjes,
  crearVector,
  descomponer,
  etiquetaCompleta,
  geometriaComponentes,
  modulo,
  numeroEs,
  sumar,
  unidadATex,
  vectorPorValores,
} from '../src/physics/vectores';

const O = { x: 0, y: 0 };

describe('módulo y ángulo', () => {
  it('el valor físico es el largo de la flecha por las unidades por metro', () => {
    const v = crearVector('aplicada', O, { x: 3, y: 4 }); // 5 m × 10 N/m
    expect(modulo(v)).toBeCloseTo(50);
    expect(aGrados(anguloRespecto(v, null))).toBeCloseTo(53.1301, 3);
  });

  it('el ángulo se mide desde el eje x del sistema de referencia, no desde la horizontal', () => {
    const ejes = crearEjes(O, aRadianes(30));
    const v = crearVector('aplicada', O, { x: Math.cos(aRadianes(70)), y: Math.sin(aRadianes(70)) });
    expect(aGrados(anguloRespecto(v, ejes))).toBeCloseTo(40, 6);
    expect(aGrados(anguloRespecto(v, null))).toBeCloseTo(70, 6);
  });

  it('los ángulos negativos y el de 180° se normalizan', () => {
    expect(aGrados(anguloRespecto(crearVector('aplicada', O, { x: 1, y: -1 }), null))).toBeCloseTo(-45);
    expect(aGrados(anguloRespecto(crearVector('aplicada', O, { x: -1, y: 0 }), null))).toBeCloseTo(180);
  });
});

describe('vector por valores (módulo y ángulo)', () => {
  it.each([
    [50, 0], [50, 30], [12.5, 90], [7, 135], [30, -60], [100, 180],
  ])('valor %d y ángulo %d° vuelven a salir al medirlos', (valor, ang) => {
    const ejes = crearEjes({ x: 1, y: 2 }, aRadianes(25));
    const v = vectorPorValores('aplicada', { x: 1, y: 2 }, valor, ang, ejes);
    expect(modulo(v)).toBeCloseTo(valor, 2);
    // ±180° son el mismo ángulo: se compara la diferencia módulo 360.
    const dif = ((aGrados(anguloRespecto(v, ejes)) - ang + 540) % 360) - 180;
    expect(Math.abs(dif)).toBeLessThan(0.05);
    expect(v.ref).toBe(ejes.id);
  });

  it('conValores cambia la flecha sin mover su origen', () => {
    const v = crearVector('velocidad', { x: 2, y: 3 }, { x: 3, y: 3 });
    const w = conValores(v, null, 8, 90);
    expect(w.a).toEqual(v.a);
    expect(modulo(w)).toBeCloseTo(8, 3);
    expect(aGrados(anguloRespecto(w, null))).toBeCloseTo(90, 3);
  });
});

describe('descomposición (contra cálculo directo)', () => {
  it('F = 100 N a 30° del eje x: Fx = 100 cos 30°, Fy = 100 sin 30°', () => {
    const v = vectorPorValores('aplicada', O, 100, 30, null);
    const d = descomponer(v, null);
    expect(d.x).toBeCloseTo(100 * Math.cos(aRadianes(30)), 2);
    expect(d.y).toBeCloseTo(100 * Math.sin(aRadianes(30)), 2);
  });

  it('plano inclinado de 30°: el peso de 50 N se descompone en −P sen θ a lo largo y −P cos θ perpendicular', () => {
    const ejes = crearEjes(O, aRadianes(30)); // x a lo largo del plano, hacia arriba
    const peso = crearVector('peso', O, { x: 0, y: -5 }); // 5 m × 10 N/m = 50 N, hacia abajo
    const d = descomponer(peso, ejes);
    expect(d.x).toBeCloseTo(-50 * Math.sin(aRadianes(30)), 6);
    expect(d.y).toBeCloseTo(-50 * Math.cos(aRadianes(30)), 6);
    // Las componentes dibujadas suman el vector original.
    expect(d.puntaX.x + d.puntaY.x - peso.a.x).toBeCloseTo(peso.b.x, 9);
    expect(d.puntaX.y + d.puntaY.y - peso.a.y).toBeCloseTo(peso.b.y, 9);
  });

  it('el módulo se conserva: Fx² + Fy² = F²', () => {
    const v = vectorPorValores('aplicada', O, 37, 211, crearEjes(O, 0.7));
    const d = descomponer(v, crearEjes(O, 0.7));
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(37, 2);
  });

  it('las etiquetas de las componentes salen de la etiqueta del vector', () => {
    const g = geometriaComponentes(crearVector('aplicada', O, { x: 2, y: 1 }), null);
    expect(g.textoX).toBe('F_x');
    expect(g.textoY).toBe('F_y');
    expect(g.etiquetaX).not.toBeNull();
  });
});

describe('suma punta con cola', () => {
  it('3 N + 4 N perpendiculares dan 5 N a 53,13° (triángulo 3-4-5)', () => {
    const a = vectorPorValores('aplicada', O, 30, 0, null); // 3 m
    const b = vectorPorValores('aplicada', { x: 9, y: 9 }, 40, 90, null); // 4 m, en otra parte
    const r = sumar([a, b])!;
    expect(modulo(r.resultante)).toBeCloseTo(50, 3);
    expect(aGrados(anguloRespecto(r.resultante, null))).toBeCloseTo(53.1301, 3);
    expect(r.resultante.rol).toBe('resultante');
    expect(r.resultante.a).toEqual(a.a);
  });

  it('el fantasma del segundo vector queda en la punta del primero y es una copia del mismo tamaño', () => {
    const a = vectorPorValores('aplicada', { x: 1, y: 1 }, 30, 0, null);
    const b = vectorPorValores('aplicada', { x: 9, y: 9 }, 40, 90, null);
    const { fantasmas } = sumar([a, b])!;
    expect(fantasmas).toHaveLength(1);
    expect(fantasmas[0]!.a).toEqual(a.b);
    expect(modulo(fantasmas[0]!)).toBeCloseTo(40, 3);
    expect(fantasmas[0]!.fantasma).toBe(true);
    expect(fantasmas[0]!.id).not.toBe(b.id);
  });

  it('es conmutativa en el módulo y asociativa con tres vectores', () => {
    const vs = [vectorPorValores('aplicada', O, 20, 10, null), vectorPorValores('aplicada', O, 35, 100, null), vectorPorValores('aplicada', O, 15, 200, null)];
    const m1 = modulo(sumar(vs)!.resultante);
    const m2 = modulo(sumar([vs[2]!, vs[0]!, vs[1]!])!.resultante);
    expect(m1).toBeCloseTo(m2, 6);
    // Contra la suma directa de componentes
    const sx = vs.reduce((s, v) => s + descomponer(v, null).x, 0);
    const sy = vs.reduce((s, v) => s + descomponer(v, null).y, 0);
    expect(m1).toBeCloseTo(Math.hypot(sx, sy), 2);
  });

  it('combina vectores con distinta escala en unidades físicas', () => {
    const a = crearVector('aplicada', O, { x: 2, y: 0 }, { porMetro: 10 }); // 20 N
    const b = crearVector('aplicada', O, { x: 0, y: 1 }, { porMetro: 40 }); // 40 N
    const r = sumar([a, b])!.resultante;
    expect(modulo(r)).toBeCloseTo(Math.hypot(20, 40), 6);
  });

  it('no suma si hay menos de dos vectores o si las unidades no coinciden', () => {
    const f = crearVector('aplicada', O, { x: 1, y: 0 });
    expect(sumar([f])).toBeNull();
    expect(sumar([f, crearVector('velocidad', O, { x: 1, y: 0 })])).toBeNull();
  });
});

describe('texto y etiquetas', () => {
  it('los números usan coma decimal y {,} dentro de LaTeX', () => {
    expect(numeroEs(12.5)).toBe('12,5');
    expect(numeroEs(12.5, true)).toBe('12{,}5');
    expect(numeroEs(100)).toBe('100');
    expect(numeroEs(0.333)).toBe('0,33');
    expect(numeroEs(-0.001)).toBe('0');
  });

  it('las unidades se convierten a LaTeX con potencias y productos', () => {
    expect(unidadATex('N')).toBe('\\mathrm{N}');
    expect(unidadATex('m/s²')).toBe('\\mathrm{m/s}^{2}');
    expect(unidadATex('kg·m/s')).toBe('\\mathrm{kg}\\cdot \\mathrm{m/s}');
  });

  it('la etiqueta completa agrega el valor solo si se pide', () => {
    const v = vectorPorValores('normal', O, 43.3, 90, null);
    expect(etiquetaCompleta(v)).toBe('\\vec{N}');
    expect(etiquetaCompleta({ ...v, mostrarValor: true })).toBe('\\vec{N}=43{,}3\\,\\mathrm{N}');
  });

  it('un vector fantasma no lleva etiqueta y la etiqueta no tapa la flecha', () => {
    const v = crearVector('peso', O, { x: 0, y: -2 });
    expect(anclaEtiquetaVector({ ...v, fantasma: true })).toBeNull();
    const a = anclaEtiquetaVector(v)!;
    expect(Math.abs(a.centro.x)).toBeGreaterThan(0.1); // al costado de la flecha vertical
  });

  it('el arco del ángulo va del eje x al vector por el camino corto', () => {
    const v = vectorPorValores('aplicada', O, 50, 40, crearEjes(O, aRadianes(10)));
    const arco = arcoAngulo(v, crearEjes(O, aRadianes(10)))!;
    expect(aGrados(arco.desde)).toBeCloseTo(10);
    expect(aGrados(arco.hasta)).toBeCloseTo(50);
    expect(arcoAngulo(crearVector('aplicada', O, { x: 1, y: 0 }), null)).toBeNull(); // 0°: nada que marcar
  });
});
