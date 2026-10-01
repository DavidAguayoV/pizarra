import { describe, expect, it } from 'vitest';
import { cajaDe, dimensionesTexto, geometriaPunta, tocaElemento, unirCajas } from '../src/core/elementos';
import type { Elemento, Linea } from '../src/core/elementos';
import { escenaInicial, OP_AGREGAR, OP_BORRAR, reductoresEscena } from '../src/core/escena';
import type { Escena } from '../src/core/escena';
import { Store } from '../src/core/store';
import { crearForma, crearTrazo, factorPresion, formaValida, grosorMedio, restringir } from '../src/ink/herramientas';
import { bezierPorPuntos, simplificarRdp } from '../src/ink/suavizado';
import { RechazoPalma } from '../src/ink/rechazoPalma';
import { escenaEjemplo } from './fixtures';

const por = (id: string): Elemento => escenaEjemplo().find((e) => e.id === id)!;

describe('cajas y contacto', () => {
  it('la caja de una línea incluye el medio grosor', () => {
    const c = cajaDe(por('l1'));
    expect(c.x0).toBeCloseTo(0 - 0.013);
    expect(c.x1).toBeCloseTo(2 + 0.013);
  });

  it('la caja de un texto cuelga hacia abajo desde su esquina superior', () => {
    const t = por('x1');
    const { ancho, alto } = dimensionesTexto(t as never);
    const c = cajaDe(t);
    expect(c.y1).toBe(1.8);
    expect(c.y0).toBeCloseTo(1.8 - alto);
    expect(c.x1).toBeCloseTo(0.2 + ancho);
  });

  it('unirCajas de nada es null', () => {
    expect(unirCajas([])).toBeNull();
  });

  it('el borrador toca una línea cerca y no lejos', () => {
    const l = por('l1');
    expect(tocaElemento(l, { x: 1, y: -0.55 }, 0.05)).toBe(true);
    expect(tocaElemento(l, { x: 1, y: -0.2 }, 0.05)).toBe(false);
  });

  it('un rectángulo solo se borra por el contorno, no por dentro', () => {
    const r = por('r1');
    expect(tocaElemento(r, { x: 2.8, y: 0.2 }, 0.05)).toBe(false);
    expect(tocaElemento(r, { x: 2.2, y: 0.2 }, 0.05)).toBe(true);
  });

  it('una elipse se toca por el contorno y no por el centro', () => {
    const o = por('o1');
    expect(tocaElemento(o, { x: 3.5, y: 1.4 }, 0.05)).toBe(false);
    expect(tocaElemento(o, { x: 4, y: 1.4 }, 0.05)).toBe(true);
  });

  it('un texto se toca por toda su caja', () => {
    expect(tocaElemento(por('x1'), { x: 0.4, y: 1.7 }, 0.01)).toBe(true);
    expect(tocaElemento(por('x1'), { x: 5, y: 5 }, 0.01)).toBe(false);
  });
});

describe('flecha', () => {
  it('la punta termina exactamente en b y su base queda sobre la línea', () => {
    const f = por('f1') as Linea;
    const g = geometriaPunta(f);
    expect(g.cola).toEqual(f.b);
    expect(g.base.x).toBeCloseTo(f.a.x);
    expect(g.base.y).toBeGreaterThan(f.b.y);
    expect(g.base.y).toBeLessThan(f.a.y);
  });
});

describe('herramientas', () => {
  it('la presión neutra (mouse) no cambia el grosor', () => {
    expect(factorPresion(0.5)).toBeCloseTo(1);
    expect(grosorMedio(crearTrazo([0, 0, 0.5, 1, 1, 0.5], 'tinta', 0.03, false))).toBeCloseTo(0.03);
  });

  it('el resaltador es 4 veces más ancho y no depende de la presión', () => {
    const t = crearTrazo([0, 0, 1, 1, 1, 1], 'acento', 0.03, true);
    expect(t.grosor).toBeCloseTo(0.12);
    expect(grosorMedio(t)).toBeCloseTo(0.12);
  });

  it('Shift fuerza múltiplos de 45° en líneas y cuadrados en cajas', () => {
    const p = restringir('linea', { x: 0, y: 0 }, { x: 3, y: 0.4 });
    expect(p.y).toBeCloseTo(0);
    const d = restringir('linea', { x: 0, y: 0 }, { x: 3, y: 2.8 });
    expect(d.x).toBeCloseTo(d.y);
    const c = restringir('elipse', { x: 0, y: 0 }, { x: 2, y: -1 });
    expect(c).toEqual({ x: 2, y: -2 });
  });

  it('descarta formas sin arrastre', () => {
    expect(formaValida(crearForma('rect', { x: 1, y: 1 }, { x: 1, y: 1 }, 'tinta', 0.02))).toBe(false);
    expect(formaValida(crearForma('rect', { x: 1, y: 1 }, { x: 2, y: 1 }, 'tinta', 0.02))).toBe(true);
  });
});

describe('suavizado', () => {
  it('RDP quita puntos colineales y conserva los extremos', () => {
    const pts = [0, 1, 2, 3, 4].map((x) => ({ x, y: 0 }));
    expect(simplificarRdp(pts, 0.01)).toEqual([pts[0], pts[4]]);
  });

  it('RDP conserva una esquina marcada', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ];
    expect(simplificarRdp(pts, 0.05)).toEqual([pts[0], pts[2], pts[4]]);
  });

  it('la curva Bézier pasa por todos los puntos (termina en cada uno)', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 3, y: 1 },
      { x: 4, y: 3 },
    ];
    const segs = bezierPorPuntos(pts);
    expect(segs.map((s) => s.fin)).toEqual(pts.slice(1));
  });

  it('un punto o dos puntos no producen curva rota', () => {
    expect(bezierPorPuntos([{ x: 0, y: 0 }])).toEqual([]);
    expect(bezierPorPuntos([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toHaveLength(1);
  });
});

describe('rechazo de palma', () => {
  it('ignora el toque mientras el lápiz está cerca y lo acepta después', () => {
    const r = new RechazoPalma(800);
    expect(r.ignorar('touch', 0)).toBe(false);
    r.registrar('pen', 1000);
    expect(r.ignorar('touch', 1500)).toBe(true);
    expect(r.ignorar('touch', 1900)).toBe(false);
  });

  it('nunca ignora el lápiz ni el mouse', () => {
    const r = new RechazoPalma();
    r.registrar('pen', 0);
    expect(r.ignorar('pen', 10)).toBe(false);
    expect(r.ignorar('mouse', 10)).toBe(false);
  });
});

describe('escena como ops', () => {
  const nuevo = () => {
    let n = 0;
    return new Store<Escena>(escenaInicial, reductoresEscena, { nuevoId: () => `op${++n}` });
  };

  it('agregar y borrar son ops: borrar se puede deshacer', () => {
    const s = nuevo();
    for (const e of escenaEjemplo().slice(0, 3)) s.emitir(OP_AGREGAR, e);
    s.emitir(OP_BORRAR, { ids: ['t1', 'l1'] });
    expect(s.estado.elementos.map((e) => e.id)).toEqual(['h1']);
    s.deshacer();
    expect(s.estado.elementos.map((e) => e.id)).toEqual(['t1', 'h1', 'l1']);
  });

  it('borrar un id que no existe no rompe nada', () => {
    const s = nuevo();
    s.emitir(OP_BORRAR, { ids: ['nada'] });
    expect(s.estado.elementos).toEqual([]);
  });
});
