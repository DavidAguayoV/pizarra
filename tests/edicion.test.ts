import { describe, expect, it } from 'vitest';
import { cajaDe, trasladar } from '../src/core/elementos';
import type { Ejes, Elemento, Vector } from '../src/core/elementos';
import { aplicarLote, escenaInicial, OP_AGREGAR, OP_LOTE, reductoresEscena } from '../src/core/escena';
import type { Escena } from '../src/core/escena';
import { Store } from '../src/core/store';
import { aTikz } from '../src/export/tikz';
import { aSvg, cajaEscena } from '../src/export/svg';
import { ajustarAngulo, asasDe, moverAsa, PASO_ANGULO } from '../src/physics/edicion';
import { aGrados, aRadianes, cajaConEtiquetas, crearEjes, crearVector, vectorPorValores } from '../src/physics/vectores';
import { escenaEjemplo } from './fixtures';

const por = (id: string): Elemento => escenaEjemplo().find((e) => e.id === id)!;

describe('trasladar', () => {
  it('mueve cada tipo de elemento sin tocar el original', () => {
    for (const id of ['t1', 'l1', 'f1', 'r1', 'o1', 'x1', 'i1', 'e1', 'v1']) {
      const e = por(id);
      const antes = JSON.stringify(e);
      const m = trasladar(e, 2, -3);
      expect(JSON.stringify(e)).toBe(antes);
      const c0 = cajaDe(e);
      const c1 = cajaDe(m);
      expect(c1.x0 - c0.x0).toBeCloseTo(2, 3);
      expect(c1.y0 - c0.y0).toBeCloseTo(-3, 3);
    }
  });

  it('un vector conserva su largo y su ángulo al moverse', () => {
    const v = vectorPorValores('aplicada', { x: 1, y: 1 }, 35, 40, null);
    const m = trasladar(v, 5, 5) as Vector;
    expect(Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y)).toBeCloseTo(Math.hypot(v.b.x - v.a.x, v.b.y - v.a.y), 3);
    expect(m.a).toEqual({ x: 6, y: 6 });
  });
});

describe('asas de edición', () => {
  it('un vector tiene dos asas (origen y punta); los ejes tienen tres; una figura, ninguna', () => {
    expect(asasDe(por('v1')).map((a) => a.nombre)).toEqual(['a', 'b']);
    expect(asasDe(por('e1')).map((a) => a.nombre)).toEqual(['origen', 'x', 'y']);
    expect(asasDe(por('r1'))).toEqual([]);
  });

  it('mover la punta de un vector cambia solo la punta', () => {
    const v = crearVector('aplicada', { x: 0, y: 0 }, { x: 1, y: 0 });
    const m = moverAsa(v, 'b', { x: 3, y: 4 }) as Vector;
    expect(m.a).toEqual(v.a);
    expect(m.b).toEqual({ x: 3, y: 4 });
  });

  it('tirar de la punta del eje x gira los ejes y cambia su largo', () => {
    const e = crearEjes({ x: 1, y: 1 }, 0, 1.5);
    const m = moverAsa(e, 'x', { x: 1 + 2 * Math.cos(aRadianes(40)), y: 1 + 2 * Math.sin(aRadianes(40)) }) as Ejes;
    expect(aGrados(m.angulo)).toBeCloseTo(40, 2);
    expect(m.largo).toBeCloseTo(2, 3);
    expect(m.origen).toEqual(e.origen);
  });

  it('tirar de la punta del eje y deja el eje x 90° más abajo', () => {
    const e = crearEjes({ x: 0, y: 0 }, 0, 1.5);
    const m = moverAsa(e, 'y', { x: 0, y: 2 }) as Ejes; // arriba: es la posición normal
    expect(aGrados(m.angulo)).toBeCloseTo(0, 2);
    const g = moverAsa(e, 'y', { x: -2, y: 0 }) as Ejes; // y apunta a la izquierda → x apunta hacia arriba (+90° respecto de y... 90°)
    expect(aGrados(g.angulo)).toBeCloseTo(90, 2);
  });

  it('los ejes no se pueden achicar hasta desaparecer', () => {
    const m = moverAsa(crearEjes({ x: 0, y: 0 }), 'x', { x: 0.01, y: 0 }) as Ejes;
    expect(m.largo).toBeGreaterThanOrEqual(0.3);
  });

  it('con Mayús el ángulo cae en múltiplos de 15°', () => {
    const p = ajustarAngulo({ x: 0, y: 0 }, { x: 2, y: 1.3 });
    const ang = aGrados(Math.atan2(p.y, p.x));
    expect(Math.abs(ang / aGrados(PASO_ANGULO) - Math.round(ang / aGrados(PASO_ANGULO)))).toBeLessThan(1e-9);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(Math.hypot(2, 1.3), 6); // no cambia el largo
  });
});

describe('lote de cambios', () => {
  it('reemplaza en su lugar, borra y agrega en un solo paso', () => {
    const v = crearVector('aplicada', { x: 0, y: 0 }, { x: 1, y: 0 }, { id: 'a' });
    const w = crearVector('aplicada', { x: 0, y: 0 }, { x: 0, y: 1 }, { id: 'b' });
    const base: Escena = { elementos: [v, w] };
    const nuevo = { ...v, etiqueta: 'otra' };
    const r = aplicarLote(base, { actualizar: [nuevo], borrar: ['b'], agregar: [crearVector('normal', { x: 0, y: 0 }, { x: 2, y: 2 }, { id: 'c' })] });
    expect(r.elementos.map((e) => e.id)).toEqual(['a', 'c']);
    expect((r.elementos[0] as Vector).etiqueta).toBe('otra');
  });

  it('actualizar un id que no existe no agrega nada', () => {
    const r = aplicarLote(escenaInicial(), { actualizar: [crearVector('aplicada', { x: 0, y: 0 }, { x: 1, y: 0 }, { id: 'zz' })] });
    expect(r.elementos).toEqual([]);
  });

  it('un lote se deshace de una vez y se transmite como una sola op', () => {
    let n = 0;
    const s = new Store<Escena>(escenaInicial, reductoresEscena, { nuevoId: () => `op${++n}` });
    const v = crearVector('aplicada', { x: 0, y: 0 }, { x: 1, y: 0 }, { id: 'a' });
    s.emitir(OP_AGREGAR, v);
    const ops0 = s.ops.length;
    s.emitir(OP_LOTE, { actualizar: [{ ...v, etiqueta: 'x' }], agregar: [crearVector('normal', { x: 0, y: 0 }, { x: 0, y: 2 }, { id: 'b' })] });
    expect(s.ops.length).toBe(ops0 + 1);
    expect(s.estado.elementos).toHaveLength(2);
    s.deshacer();
    expect(s.estado.elementos).toHaveLength(1);
    expect((s.estado.elementos[0] as Vector).etiqueta).toBe(v.etiqueta);
  });
});

describe('exportación de vectores y ejes', () => {
  const soloFisica = escenaEjemplo().filter((e) => e.tipo === 'vector' || e.tipo === 'ejes');

  it('el recuadro incluye las etiquetas (no se recortan al exportar)', () => {
    const ejes = por('e1') as Ejes;
    const v = por('v1') as Vector;
    const sin = cajaDe(v);
    const con = cajaConEtiquetas(v, ejes);
    expect(con.x0).toBeLessThanOrEqual(sin.x0);
    expect(con.y0).toBeLessThanOrEqual(sin.y0);
    const caja = cajaEscena(soloFisica)!;
    expect(caja.x0).toBeLessThanOrEqual(con.x0 + 1e-9);
  });

  it('TikZ: el color del vector sale de su rol y las unidades usan LaTeX básico', () => {
    const { codigo } = aTikz(soloFisica);
    expect(codigo).toContain('definecolor{pzcampo}'); // peso → familia "campo"
    expect(codigo).toContain('definecolor{pzcontacto}'); // normal
    expect(codigo).toContain('definecolor{pzdisipacion}'); // roce
    expect(codigo).toContain('\\mathrm{N}');
    expect(codigo).not.toContain('\\text{'); // \text exigiría amsmath
    expect(codigo).toContain('-7{,}5'); // coma decimal protegida
    expect(codigo).toContain('% --- sistema de referencia ---');
    expect(codigo).toContain('% --- vectores ---');
  });

  it('TikZ: el vector fantasma va punteado y translúcido, sin etiqueta', () => {
    const { codigo } = aTikz([por('v3')]);
    expect(codigo).toContain('dash pattern');
    expect(codigo).toContain('opacity=0.65');
    expect(codigo).not.toContain('\\node');
  });

  it('SVG: los ejes y los vectores salen como líneas y polígonos, y los fantasmas con trazo discontinuo', () => {
    const svg = aSvg(soloFisica);
    expect(svg).toContain('<polygon');
    expect(svg).toContain('stroke-dasharray');
    expect(svg).toContain('>x</text>');
    expect(svg).toContain('<path d="M'); // el arco del ángulo
  });

  it('el texto libre con matemática se compone igual en SVG', () => {
    const svg = aSvg([por('x1')]);
    expect(svg).toContain('<line'); // la flecha de \\vec
    expect(svg).toContain('>F</text>');
  });
});
