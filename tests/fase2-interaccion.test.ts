// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Bloque, Cuerda, Elemento } from '../src/core/elementos';
import { arreglar } from '../src/grafo/arreglos';
import { alinearColgantes, conectarNuevo, iman, montar, pasoAlSalir, puertoHacia, regionDePaso, toque } from '../src/grafo/conectar';
import { prepararLote } from '../src/grafo/integridad';
import { posPuerto } from '../src/grafo/puertos';
import { validar } from '../src/grafo/validar';
import { crearBloque, crearCuerda, crearPolea, crearResorte, crearSuperficie } from '../src/physics/objetos';
import { construirModelo } from '../src/sim/modelo';
import { Simulacion } from '../src/sim/motor';

/** Fase 2: imanes, gesto continuo por poleas, alineación, montaje, problemas y sus arreglos, tope en la polea. */

const G = 9.8;

function correr(escena: Elemento[], t: number): Simulacion {
  const s = new Simulacion(construirModelo(escena, G), { h: 0.001 });
  for (let k = 0; k < Math.round(t / 0.001); k++) s.paso();
  return s;
}

/** Aplica un lote ya preparado (como la app) y devuelve la escena resultante. */
function aplicarLote(escena: Elemento[], l: { agregar?: Elemento[]; actualizar?: Elemento[]; borrar?: string[] }): Elemento[] {
  const p = prepararLote(l, escena);
  const fuera = new Set(p.borrar ?? []);
  const nuevos = new Map((p.actualizar ?? []).map((x) => [x.id, x]));
  return [...escena.filter((x) => !fuera.has(x.id)).map((x) => nuevos.get(x.id) ?? x), ...(p.agregar ?? [])];
}

/** Atwood con una sola cuerda dibujada de un gesto (unida y con su paso por la polea). */
function atwoodGesto(x2 = 0.3): Elemento[] {
  const pol = crearPolea({ x: 0, y: 1.4 }, 0.3, { id: 'p' });
  const b1: Bloque = { ...crearBloque({ x: -0.3, y: -0.6 }, 0.4, 0.4, { id: 'b1', masa: 2 }), apoyo: [] };
  const b2: Bloque = { ...crearBloque({ x: x2, y: -0.1 }, 0.4, 0.4, { id: 'b2', masa: 3 }), apoyo: [] };
  const c: Cuerda = {
    ...crearCuerda({ x: -0.3, y: -0.4 }, { x: x2, y: 0.1 }, { id: 'c' }),
    union: [
      { el: 'b1', puerto: 'cara-sup' },
      { el: 'b2', puerto: 'cara-sup' },
    ],
    ruta: [{ el: 'p', sentido: -1 }],
  };
  return [pol, b1, b2, c];
}

describe('imán', () => {
  const b = crearBloque({ x: 0, y: 0 }, 0.5, 0.4, { id: 'b' });
  const techo = crearSuperficie({ x: -2, y: 3 }, { x: 2, y: 3 }, { id: 'techo' });
  it('pega al puerto más cercano dentro del radio; dentro del cuerpo, siempre a su puerto más cercano', () => {
    expect(iman({ x: 0.03, y: 0.25 }, [b], 0.24)?.union).toEqual({ el: 'b', puerto: 'cara-sup' });
    expect(iman({ x: 0.22, y: 0.15 }, [b], 0.01)?.union).toEqual({ el: 'b', puerto: 'esq-sd' });
    expect(iman({ x: 0, y: 1 }, [b], 0.24)).toBeNull();
  });
  it('un punto de una superficie (el techo) sirve de imán: la unión queda en ese punto', () => {
    const m = iman({ x: 0.5, y: 2.9 }, [techo], 0.24)!;
    expect(m.union).toEqual({ el: 'techo', puerto: 'u:0.625' });
    expect(posPuerto(techo, 'u:0.625')).toEqual({ x: 0.5, y: 3 });
  });
});

describe('gesto continuo por poleas', () => {
  const pol = crearPolea({ x: 0, y: 1.4 }, 0.3, { id: 'p' });
  it('pasar por arriba de izquierda a derecha envuelve en sentido horario; por debajo, antihorario', () => {
    const reg = regionDePaso({ x: -0.2, y: 1.4 }, [pol], 0.14)!;
    expect(reg.el).toBe('p');
    expect(pasoAlSalir(reg, { x: -0.4, y: 0 }, { x: 0.4, y: 0 })).toEqual({ el: 'p', sentido: -1 });
    expect(pasoAlSalir(reg, { x: -0.4, y: 3 }, { x: 0.4, y: 3 })).toEqual({ el: 'p', sentido: 1 });
  });
  it('el extremo de una superficie es un paso de radio 0 (borde de mesa)', () => {
    const mesa = crearSuperficie({ x: -3, y: 0 }, { x: 0, y: 0 }, { id: 'mesa' });
    expect(regionDePaso({ x: 0.05, y: -0.05 }, [mesa], 0.14)).toMatchObject({ el: 'mesa', extremo: 'b', r: 0 });
  });
});

describe('alinear lo que cuelga de una polea', () => {
  it('al unir, un cuerpo corrido hasta 25° se alinea bajo la tangente (cae en línea recta)', () => {
    const escena = atwoodGesto(0.45);
    const c = escena.find((e) => e.id === 'c')!;
    const sinCuerda = escena.filter((e) => e.id !== 'c');
    const cambio = conectarNuevo(c, sinCuerda);
    const b2 = cambio.actualizar!.find((e) => e.id === 'b2') as Bloque;
    expect(b2.centro.x).toBeCloseTo(0.3, 3);
    const s = correr(aplicarLote(sinCuerda, cambio), 0.3);
    for (const a of s.estado.a) expect(Math.abs(a.x)).toBeLessThan(1e-6);
  });
  it('más de 25° es intencional: no se toca, pero se avisa y se puede arreglar', () => {
    const escena = atwoodGesto(1.5);
    expect(alinearColgantes('c', escena)).toEqual([]);
    const p = validar(escena).find((x) => x.tipo === 'tramo-inclinado')!;
    expect(p.texto).toContain('oscilará como un péndulo');
    const arreglada = aplicarLote(escena, arreglar(p, escena)!);
    expect(validar(arreglada).some((x) => x.tipo === 'tramo-inclinado')).toBe(false);
  });
});

describe('plano + polea: el tramo debe ser paralelo al plano', () => {
  it('se avisa y «Mover la polea» lo deja paralelo (y el colgante, vertical)', () => {
    const th = Math.PI / 6;
    const A = { x: -3, y: 0 };
    const plano = crearSuperficie(A, { x: A.x + 3 * Math.cos(th), y: A.y + 3 * Math.sin(th) }, { id: 'pl', relleno: 'cuna' });
    const centro = { x: A.x + 1.5 * Math.cos(th) - 0.2 * Math.sin(th), y: A.y + 1.5 * Math.sin(th) + 0.2 * Math.cos(th) };
    const b1: Bloque = { ...crearBloque(centro, 0.6, 0.4, { id: 'b1', masa: 2, angulo: th }), apoyo: ['pl'] };
    const pol = crearPolea({ x: 0.2, y: 1.6 }, 0.25, { id: 'pp' });
    const b2: Bloque = { ...crearBloque({ x: 0.5, y: 0 }, 0.4, 0.4, { id: 'b2', masa: 3 }), apoyo: [] };
    const c: Cuerda = {
      ...crearCuerda(posPuerto(b1, 'cara-der')!, posPuerto(b2, 'cara-sup')!, { id: 'c' }),
      union: [
        { el: 'b1', puerto: 'cara-der' },
        { el: 'b2', puerto: 'cara-sup' },
      ],
      ruta: [{ el: 'pp', sentido: -1 }],
    };
    const escena = [plano, b1, pol, b2, c];
    const p = validar(escena).find((x) => x.tipo === 'tramo-no-paralelo')!;
    expect(p.arreglo).toBe('alinear-polea');
    const arreglada = aplicarLote(escena, arreglar(p, escena)!);
    const quedan = validar(arreglada).map((x) => x.tipo);
    expect(quedan).not.toContain('tramo-no-paralelo');
    expect(quedan).not.toContain('tramo-inclinado');
  });
});

describe('otras piezas y arreglos', () => {
  it('una polea soltada sobre un bloque queda montada encima (polea móvil)', () => {
    const b = crearBloque({ x: 1, y: 0 }, 0.4, 0.4, { id: 'b' });
    const p = montar(crearPolea({ x: 1.05, y: 0.15 }, 0.25, { id: 'p' }), [b]);
    expect(p.montaje).toEqual({ el: 'b', puerto: 'local:0,0.53' });
    expect(p.centro).toEqual({ x: 1, y: 0.53 });
    expect(montar(crearPolea({ x: 3, y: 3 }, 0.25), [b]).montaje).toBeUndefined();
  });
  it('«Fijar el extremo» y «Separar»', () => {
    const r: Cuerda = { ...crearCuerda({ x: 0, y: 0 }, { x: 1, y: 0 }, { id: 'c' }), union: [null, { fijo: true }] };
    const p1 = validar([r]).find((x) => x.tipo === 'extremo-suelto')!;
    expect((arreglar(p1, [r])!.actualizar![0] as Cuerda).union).toEqual([{ fijo: true }, { fijo: true }]);
    const a = crearBloque({ x: 0, y: 0 }, 0.5, 0.4, { id: 'a', apoyo: [] });
    const b = crearBloque({ x: 0.2, y: 0 }, 0.5, 0.4, { id: 'b', apoyo: [] });
    const p2 = validar([a, b]).find((x) => x.tipo === 'superpuestos')!;
    const separada = aplicarLote([a, b], arreglar(p2, [a, b])!);
    expect(validar(separada).some((x) => x.tipo === 'superpuestos')).toBe(false);
  });
  it('cuando un cuerpo llega a la polea, la simulación se detiene con un evento', () => {
    const s = correr(atwoodGesto(), 3);
    expect(s.detenida).toContain('llega a la polea');
    expect(s.eventos.at(-1)!.tipo).toBe('llega-polea');
    const t = s.estado.t;
    s.paso();
    expect(s.estado.t).toBe(t);
  });
});

describe('conexión toque a toque (para el dedo)', () => {
  const pol = crearPolea({ x: 0, y: 1.4 }, 0.3, { id: 'p' });
  const b1 = crearBloque({ x: -0.3, y: -0.6 }, 0.4, 0.4, { id: 'b1', apoyo: [] });
  const b2 = crearBloque({ x: 0.3, y: -0.6 }, 0.4, 0.4, { id: 'b2', apoyo: [] });
  const escena = [pol, b1, b2];
  const crear = (a: { x: number; y: number }, b: { x: number; y: number }, extra: object) => crearCuerda(a, b, extra);
  it('bloque, polea, bloque: una cuerda que envuelve la polea por arriba, unida a la cara de arriba de cada bloque', () => {
    let r = toque(null, 'cuerda', { x: -0.25, y: -0.7 }, escena, 0.4, 0.26, crear);
    expect(r.k).toBe('pendiente');
    if (r.k !== 'pendiente') return;
    r = toque(r.c, 'cuerda', { x: 0.1, y: 1.3 }, escena, 0.4, 0.26, crear);
    if (r.k !== 'pendiente') throw new Error('debía seguir pendiente');
    expect(r.c.pasos.map((x) => x.el)).toEqual(['p']);
    const fin = toque(r.c, 'cuerda', { x: 0.35, y: -0.65 }, escena, 0.4, 0.26, crear);
    if (fin.k !== 'lista' || fin.elemento.tipo !== 'cuerda') throw new Error('debía terminar');
    expect(fin.elemento.union).toEqual([
      { el: 'b1', puerto: 'cara-sup' },
      { el: 'b2', puerto: 'cara-sup' },
    ]);
    expect(fin.elemento.ruta).toEqual([{ el: 'p', sentido: -1 }]);
  });
  it('tocar dos veces el mismo cuerpo no termina nada; un resorte termina en el segundo toque', () => {
    const r = toque(null, 'cuerda', { x: -0.3, y: -0.6 }, escena, 0.4, 0.26, crear);
    if (r.k !== 'pendiente') throw new Error();
    expect(toque(r.c, 'cuerda', { x: -0.28, y: -0.62 }, escena, 0.4, 0.26, crear).k).toBe('pendiente');
    const pared = crearSuperficie({ x: -2, y: -1 }, { x: -2, y: 1 }, { id: 'pared' });
    const res = toque(null, 'resorte', { x: -2.02, y: -0.6 }, [pared, b1], 0.4, 0.26, (a, b, e) => crearResorte(a, b, e));
    if (res.k !== 'pendiente') throw new Error();
    const fin = toque(res.c, 'resorte', { x: -0.3, y: -0.6 }, [pared, b1], 0.4, 0.26, (a, b, e) => crearResorte(a, b, e));
    if (fin.k !== 'lista') throw new Error();
    expect(fin.elemento.union![1]).toEqual({ el: 'b1', puerto: 'cara-izq' });
    expect(fin.elemento.union![0]).toMatchObject({ el: 'pared' });
  });
  it('puertoHacia elige la cara que mira hacia el tramo (también con el bloque girado)', () => {
    expect(puertoHacia(b1, { x: -0.3, y: 3 }).puerto).toBe('cara-sup');
    expect(puertoHacia(b1, { x: 3, y: -0.6 }).puerto).toBe('cara-der');
    const girado = crearBloque({ x: 0, y: 0 }, 0.4, 0.4, { angulo: Math.PI / 2 });
    expect(puertoHacia(girado, { x: 0, y: 3 }).puerto).toBe('cara-der');
  });
});
