import { describe, expect, it } from 'vitest';
import { componerLinea, componerMat, esMatematica, etiquetaComponente, matASvg } from '../src/core/matematica';
import type { Prim } from '../src/core/matematica';

const textos = (prims: Prim[]) => prims.filter((p): p is Extract<Prim, { k: 't' }> => p.k === 't');
const t = (src: string, s: string) => textos(componerMat(src).prims).find((p) => p.s === s)!;

describe('compositor de etiquetas', () => {
  it('las letras van en cursiva y los dígitos y operadores, rectos', () => {
    expect(t('F', 'F').cursiva).toBe(true);
    expect(t('2', '2').cursiva).toBe(false);
    expect(t('a+b', '+').cursiva).toBe(false);
  });

  it('un subíndice queda más abajo y más chico que la base', () => {
    const base = t('F_g', 'F');
    const sub = t('F_g', 'g');
    expect(sub.y).toBeLessThan(base.y);
    expect(sub.tam).toBeLessThan(base.tam);
    expect(sub.x).toBeGreaterThan(base.x);
  });

  it('un superíndice queda más arriba', () => {
    expect(t('v^2', '2').y).toBeGreaterThan(t('v^2', 'v').y);
  });

  it('los scripts anidados se achican más', () => {
    const c = componerMat('a_{b_c}');
    const tam = (s: string) => t('a_{b_c}', s).tam;
    expect(c.prims.length).toBe(3);
    expect(tam('c')).toBeLessThan(tam('b'));
    expect(tam('b')).toBeLessThan(tam('a'));
  });

  it('las letras griegas se convierten a su símbolo', () => {
    expect(t('\\theta', 'θ').cursiva).toBe(true);
    expect(textos(componerMat('\\mu_k N').prims).map((p) => p.s)).toEqual(['μ', 'k', 'N']);
    expect(t('\\Delta', 'Δ').cursiva).toBe(false); // las mayúsculas griegas van rectas
  });

  it('\\vec dibuja una flecha por encima de la letra', () => {
    const c = componerMat('\\vec{F}');
    const linea = c.prims.find((p) => p.k === 'l')!;
    const punta = c.prims.find((p) => p.k === 'p')!;
    expect(linea).toBeDefined();
    expect(punta).toBeDefined();
    expect(linea.k === 'l' && linea.y1).toBeGreaterThan(componerMat('F').ascenso * 0.9);
    expect(c.ascenso).toBeGreaterThan(componerMat('F').ascenso);
  });

  it('\\frac apila numerador y denominador alrededor de una barra', () => {
    const c = componerMat('\\frac{a}{b}');
    const barra = c.prims.find((p) => p.k === 'l')!;
    const a = t('\\frac{a}{b}', 'a');
    const b = t('\\frac{a}{b}', 'b');
    expect(a.y).toBeGreaterThan(barra.k === 'l' ? barra.y1 : 0);
    expect(b.y).toBeLessThan(barra.k === 'l' ? barra.y1 : 0);
    expect(c.descenso).toBeGreaterThan(0);
  });

  it('las funciones salen rectas y el texto se respeta', () => {
    expect(t('\\sin\\theta', 'sin').cursiva).toBe(false);
    expect(t('\\text{neta}', 'neta').cursiva).toBe(false);
  });

  it('un comando desconocido o llaves mal cerradas no rompen', () => {
    expect(() => componerMat('\\inventado{x')).not.toThrow();
    expect(() => componerMat('}}{{ ^ _')).not.toThrow();
    expect(componerMat('').ancho).toBe(0);
  });

  it('el ancho crece con el contenido y es el mismo cada vez (caché)', () => {
    expect(componerMat('F_{neta}').ancho).toBeGreaterThan(componerMat('F_g').ancho);
    expect(componerMat('F_g')).toBe(componerMat('F_g'));
  });
});

describe('texto que mezcla letras y matemática', () => {
  it('compone solo lo que va entre $...$', () => {
    const c = componerLinea('fuerza $\\vec{F}$ neta');
    const ss = textos(c.prims).map((p) => p.s);
    expect(ss).toEqual(['fuerza ', 'F', ' neta']);
    expect(c.prims.some((p) => p.k === 'l')).toBe(true);
  });

  it('con $ sin cerrar todo es texto', () => {
    const c = componerLinea('cuesta $5');
    expect(textos(c.prims).map((p) => p.s)).toEqual(['cuesta $5']);
  });
});

describe('etiquetas de componentes', () => {
  it.each([
    ['\\vec{F}', 'x', 'F_x'],
    ['\\vec{F}', 'y', 'F_y'],
    ['\\vec{N}_k', 'x', 'N_{k,x}'],
    ['v', 'y', 'v_y'],
    ['\\vec{f}_{k}', 'y', 'f_{k,y}'],
    ['m\\vec{g}', 'x', '(m\\vec{g})_x'],
  ] as const)('%s → componente %s = %s', (e, eje, esperado) => {
    expect(etiquetaComponente(e, eje)).toBe(esperado);
  });

  it('esMatematica distingue texto simple de lo que hay que componer', () => {
    expect(esMatematica('N')).toBe(false);
    expect(esMatematica('F_g')).toBe(true);
    expect(esMatematica('\\theta')).toBe(true);
  });
});

describe('salida SVG', () => {
  it('convierte a coordenadas de pantalla con y hacia abajo', () => {
    const caja = componerMat('F_g');
    const conv = { X: (v: number) => String(v * 100), Y: (v: number) => String(-v * 100), L: (v: number) => String(v * 100) };
    const svg = matASvg(caja, 1, 2, 0.2, conv, '#000', 'sans');
    expect(svg).toContain('>F</text>');
    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain('x="100"');
    expect(svg).toContain('y="-200"');
  });
});
