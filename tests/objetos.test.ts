import { describe, expect, it } from 'vitest';
import { cajaDe, esquinasBloque, tocaElemento, trasladar } from '../src/core/elementos';
import type { Bloque, Elemento, Esfera, Polea } from '../src/core/elementos';
import { aSvg } from '../src/export/svg';
import { aTikz } from '../src/export/tikz';
import { contactoCon } from '../src/physics/dcl';
import { asasDe, moverAsa } from '../src/physics/edicion';
import {
  acomodarSobreSuperficie,
  anguloSuperficie,
  crearBloque,
  crearCuerda,
  crearEsfera,
  crearPolea,
  crearResorte,
  crearSuperficie,
  elongacion,
  IMAN_SUPERFICIE,
} from '../src/physics/objetos';
import { aGrados, aRadianes } from '../src/physics/vectores';
import { escenaEjemplo } from './fixtures';

const por = (id: string): Elemento => escenaEjemplo().find((e) => e.id === id)!;

describe('apoyar un cuerpo sobre una superficie', () => {
  const piso = crearSuperficie({ x: -4, y: 0 }, { x: 4, y: 0 });
  const rampa = crearSuperficie({ x: -3, y: -1 }, { x: 3, y: 2 }); // sube hacia la derecha, ~26,6°

  it('un bloque a menos de 30 cm del piso baja hasta tocarlo', () => {
    const b = acomodarSobreSuperficie(crearBloque({ x: 0, y: 0.5 }, 0.9, 0.6), [piso]);
    expect(b.centro.y).toBeCloseTo(0.3, 4); // medio alto sobre el piso
    expect(contactoCon(b, piso)).not.toBeNull();
  });

  it('un bloque en el piso se levanta si estaba hundido', () => {
    const b = acomodarSobreSuperficie(crearBloque({ x: 0, y: 0.1 }, 0.9, 0.6), [piso]);
    expect(b.centro.y).toBeCloseTo(0.3, 4);
  });

  it('en una rampa el bloque se gira para quedar paralelo y apoyado', () => {
    const b = acomodarSobreSuperficie(crearBloque({ x: 0, y: 1.0 }, 0.9, 0.6), [rampa]);
    expect(aGrados(b.angulo)).toBeCloseTo(aGrados(anguloSuperficie(rampa)), 2);
    expect(contactoCon(b, rampa)).not.toBeNull();
  });

  it('la esfera queda tangente a la superficie', () => {
    const e = acomodarSobreSuperficie(crearEsfera({ x: 1, y: 0.6 }, 0.35), [piso]);
    expect(e.centro.y).toBeCloseTo(0.35, 4);
    expect(contactoCon(e, piso)).not.toBeNull();
  });

  it('un cuerpo lejano de toda superficie queda como estaba', () => {
    const b = crearBloque({ x: 0, y: 3 }, 0.9, 0.6);
    expect(acomodarSobreSuperficie(b, [piso])).toEqual(b);
    expect(acomodarSobreSuperficie(b, [])).toEqual(b);
  });

  it('el imán tiene alcance limitado y es idempotente', () => {
    const justo = crearBloque({ x: 0, y: 0.3 + IMAN_SUPERFICIE * 0.9 }, 0.9, 0.6);
    const una = acomodarSobreSuperficie(justo, [piso]);
    expect(una.centro.y).toBeCloseTo(0.3, 4);
    expect(acomodarSobreSuperficie(una, [piso])).toEqual(una);
    const lejos = crearBloque({ x: 0, y: 0.3 + IMAN_SUPERFICIE * 1.5 }, 0.9, 0.6);
    expect(acomodarSobreSuperficie(lejos, [piso])).toEqual(lejos);
  });

  it('un bloque colgado por debajo de la superficie se apoya del lado de abajo', () => {
    const b = acomodarSobreSuperficie(crearBloque({ x: 0, y: -0.4 }, 0.9, 0.6), [piso]);
    expect(b.centro.y).toBeCloseTo(-0.3, 4);
  });

  it('un cuerpo pasado del extremo de la superficie no se pega', () => {
    const b = crearBloque({ x: 9, y: 0.5 }, 0.9, 0.6);
    expect(acomodarSobreSuperficie(b, [piso])).toEqual(b);
  });
});

describe('asas de los objetos', () => {
  it('cada objeto expone las asas que le corresponden', () => {
    expect(asasDe(por('b1')).map((a) => a.nombre)).toEqual(['rotar', 'tam']);
    expect(asasDe(por('q1')).map((a) => a.nombre)).toEqual(['radio']);
    expect(asasDe(por('p1'))).toEqual([]); // la polea es de tamaño fijo: el radio se cambia en el panel
    expect(asasDe(por('s1')).map((a) => a.nombre)).toEqual(['a', 'b']);
    expect(asasDe(por('rs1')).map((a) => a.nombre)).toEqual(['a', 'b']);
    expect(asasDe(por('c1')).map((a) => a.nombre)).toEqual(['a', 'b']);
  });

  it('tirar del asa de rotación apunta el bloque hacia ese lado', () => {
    const b = crearBloque({ x: 0, y: 0 }, 1, 0.6);
    const arriba = moverAsa(b, 'rotar', { x: 0, y: 2 }) as Bloque;
    expect(aGrados(arriba.angulo)).toBeCloseTo(0, 3);
    const derecha = moverAsa(b, 'rotar', { x: 2, y: 0 }) as Bloque;
    expect(aGrados(derecha.angulo)).toBeCloseTo(-90, 3);
    const diag = moverAsa(b, 'rotar', { x: 1.3, y: 1.9 }, true) as Bloque; // con Mayús: múltiplos de 15°
    expect(Math.abs(aGrados(diag.angulo) / 15 - Math.round(aGrados(diag.angulo) / 15))).toBeLessThan(1e-3); // el ángulo se guarda con 4 decimales
  });

  it('el asa de tamaño cambia ancho y alto en el sistema del bloque', () => {
    const b = crearBloque({ x: 0, y: 0 }, 1, 0.6, { angulo: aRadianes(30) });
    const c = moverAsa(b, 'tam', { x: Math.cos(aRadianes(30)) * 1.0 - Math.sin(aRadianes(30)) * 0.5, y: Math.sin(aRadianes(30)) * 1.0 + Math.cos(aRadianes(30)) * 0.5 }) as Bloque;
    expect(c.ancho).toBeCloseTo(2, 3);
    expect(c.alto).toBeCloseTo(1, 3);
    expect(moverAsa(b, 'tam', { x: 0, y: 0 }) as Bloque).toMatchObject({ ancho: 0.2, alto: 0.2 }); // no desaparece
  });

  it('el asa de radio cambia el radio de esferas y poleas', () => {
    expect((moverAsa(crearEsfera({ x: 1, y: 1 }, 0.3), 'radio', { x: 2.5, y: 1 }) as Esfera).radio).toBeCloseTo(1.5, 4);
    expect((moverAsa(crearPolea({ x: 0, y: 0 }, 0.3), 'radio', { x: 0, y: 0.02 }) as Polea).radio).toBe(0.1);
  });

  it('mover un extremo de una superficie o un resorte cambia solo ese extremo', () => {
    const s = crearSuperficie({ x: 0, y: 0 }, { x: 2, y: 0 });
    const m = moverAsa(s, 'b', { x: 3, y: 1 });
    expect(m).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 3, y: 1 } });
  });
});

describe('contacto, caja y traslado de los objetos', () => {
  it.each(['b1', 'q1', 's1', 'p1', 'c1', 'rs1'])('%s: se traslada sin cambiar de forma y su caja se mueve igual', (id) => {
    const e = por(id);
    const m = trasladar(e, 2, -1);
    const a = cajaDe(e);
    const b = cajaDe(m);
    expect(b.x0 - a.x0).toBeCloseTo(2, 3);
    expect(b.y0 - a.y0).toBeCloseTo(-1, 3);
    expect(b.x1 - b.x0).toBeCloseTo(a.x1 - a.x0, 3);
  });

  it('el borrador toca un bloque girado por dentro y no por fuera', () => {
    const b = crearBloque({ x: 0, y: 0 }, 2, 0.4, { angulo: aRadianes(45) });
    expect(tocaElemento(b, { x: 0.5, y: 0.5 }, 0.01)).toBe(true); // sobre su eje largo
    expect(tocaElemento(b, { x: 0.5, y: -0.5 }, 0.01)).toBe(false); // perpendicular, fuera
  });

  it('una esfera y una polea se tocan por todo el disco; cuerda, resorte y superficie, por el trazo', () => {
    expect(tocaElemento(crearEsfera({ x: 0, y: 0 }, 0.5), { x: 0.3, y: 0.2 }, 0.01)).toBe(true);
    expect(tocaElemento(crearPolea({ x: 0, y: 0 }, 0.5), { x: 0.9, y: 0 }, 0.01)).toBe(false);
    expect(tocaElemento(crearCuerda({ x: 0, y: 0 }, { x: 3, y: 0 }), { x: 1.5, y: 0.02 }, 0.02)).toBe(true);
    expect(tocaElemento(crearCuerda({ x: 0, y: 0 }, { x: 3, y: 0 }), { x: 1.5, y: 0.5 }, 0.02)).toBe(false);
    expect(tocaElemento(crearResorte({ x: 0, y: 0 }, { x: 2, y: 0 }), { x: 1, y: 0.05 }, 0.02)).toBe(true);
    expect(tocaElemento(crearSuperficie({ x: 0, y: 0 }, { x: 2, y: 0 }), { x: 1, y: 0.02 }, 0.02)).toBe(true);
  });

  it('las esquinas del bloque giran alrededor de su centro', () => {
    const [a, b] = esquinasBloque(crearBloque({ x: 1, y: 1 }, 2, 1, { angulo: Math.PI / 2 }));
    expect(a.x).toBeCloseTo(1.5, 6);
    expect(a.y).toBeCloseTo(0, 6);
    expect(b.x).toBeCloseTo(1.5, 6);
    expect(b.y).toBeCloseTo(2, 6);
  });

  it('el resorte nace sin deformar y su elongación sale del largo y del largo natural', () => {
    const r = crearResorte({ x: 0, y: 0 }, { x: 2, y: 0 });
    expect(elongacion(r)).toBeCloseTo(0, 6);
    expect(elongacion({ ...r, b: { x: 2.5, y: 0 } })).toBeCloseTo(0.5, 6);
    expect(elongacion({ ...r, b: { x: 1.2, y: 0 } })).toBeCloseTo(-0.8, 6);
  });
});

describe('exportación de los objetos', () => {
  const objetos = ['b1', 'q1', 's1', 's2', 'p1', 'c1', 'rs1'].map(por);

  it('TikZ: los cuerpos usan los colores del tema claro y todo sale en la capa "objetos"', () => {
    const { codigo } = aTikz(objetos);
    expect(codigo).toContain('definecolor{pzcuerpo}{HTML}{E6EEF8}');
    expect(codigo).toContain('definecolor{pzborde}{HTML}{2C3E57}');
    expect(codigo).toContain('% --- objetos ---');
    expect(codigo).toContain('\\filldraw[fill=pzcuerpo, draw=pzborde');
    expect(codigo).toContain('circle'); // esfera y polea
    expect(codigo).toContain('$m_1$'); // la etiqueta del bloque, como matemática
    expect(codigo).toContain('\\fill[pzcuerpo, opacity=0.5]'); // la cuña
  });

  it('TikZ: el achurado sale como rayitas y el resorte como una línea quebrada', () => {
    const achur = aTikz([por('s2')]).codigo;
    expect((achur.match(/--/g) ?? []).length).toBeGreaterThan(10);
    const res = aTikz([por('rs1')]).codigo;
    expect(res).toMatch(/\\draw\[pztinta[^\]]*line join=round[^\]]*\] \(/);
    expect((res.match(/\n {4}-- /g) ?? []).length).toBeGreaterThan(8);
  });

  it('SVG: bloque como polígono, esfera y polea como círculos, resorte como polilínea', () => {
    const svg = aSvg(objetos);
    expect(svg).toContain('<polygon');
    expect(svg).toContain('<circle');
    expect(svg).toContain('<polyline');
    expect(svg).toContain('>m</text>');
  });

  it('sin objetos con relleno no se definen colores de cuerpo de más', () => {
    expect(aTikz([por('c1'), por('l1')]).codigo).not.toContain('pzcuerpo');
  });
});
