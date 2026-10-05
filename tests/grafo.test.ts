// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Bloque, Cuerda, Elemento, Resorte, Superficie } from '../src/core/elementos';
import { escenaInicial, OP_LOTE, OP_MIGRACION, reductoresEscena } from '../src/core/escena';
import type { Escena } from '../src/core/escena';
import { Store } from '../src/core/store';
import { leerProyecto, SCHEMA_VERSION, serializarProyecto } from '../src/export/json';
import { aSvg } from '../src/export/svg';
import { aTikz } from '../src/export/tikz';
import { apoyar, conectarNuevo, marcasDeUnion, unirExtremo } from '../src/grafo/conectar';
import { prepararLote } from '../src/grafo/integridad';
import { posPuerto, puertoLocal, puertosDe } from '../src/grafo/puertos';
import { dependientes, resolverEscena, sinDerivados } from '../src/grafo/resolver';
import { barrido, geometriaRuta, sentidoNatural, tangente } from '../src/grafo/ruta';
import { completarV1 } from '../src/grafo/v1';
import { validar } from '../src/grafo/validar';
import { resolverDcl } from '../src/physics/dcl';
import { crearBloque, crearCuerda, crearEsfera, crearPolea, crearResorte, crearSuperficie } from '../src/physics/objetos';
import { crearVector } from '../src/physics/vectores';
import { construirModelo } from '../src/sim/modelo';
import { Simulacion } from '../src/sim/motor';

const G = 9.8;
const cerca = (a: { x: number; y: number }, b: { x: number; y: number }, d = 9) => {
  expect(a.x).toBeCloseTo(b.x, d);
  expect(a.y).toBeCloseTo(b.y, d);
};

/** Aplica un cambio de conexión (como lo haría la app) y devuelve la escena resultante. */
function aplicar(escena: Elemento[], cambio: { agregar?: Elemento[]; actualizar?: Elemento[]; borrar?: string[] }): Elemento[] {
  const fuera = new Set(cambio.borrar ?? []);
  const nuevos = new Map((cambio.actualizar ?? []).map((x) => [x.id, x]));
  return [...escena.filter((x) => !fuera.has(x.id)).map((x) => nuevos.get(x.id) ?? x), ...(cambio.agregar ?? [])];
}
/** Dibuja elementos uno tras otro con la conexión provisoria de la Fase 1. */
function dibujar(...els: Elemento[]): Elemento[] {
  let escena: Elemento[] = [];
  for (const e of els) escena = aplicar(escena, conectarNuevo(e, escena));
  return escena;
}
function correr(escena: Elemento[], t: number): Simulacion {
  const s = new Simulacion(construirModelo(escena, G), { h: 0.001 });
  for (let k = 0; k < Math.round(t / 0.001); k++) s.paso();
  return s;
}

describe('puertos', () => {
  it('los del bloque giran con él', () => {
    const b = crearBloque({ x: 1, y: 2 }, 0.8, 0.4, { angulo: Math.PI / 2 });
    cerca(posPuerto(b, 'cara-sup')!, { x: 0.8, y: 2 });
    cerca(posPuerto(b, 'cara-der')!, { x: 1, y: 2.4 });
    expect(puertosDe(b).map((p) => p.nombre)).toContain('esq-id');
  });
  it('un puerto local conserva exactamente el punto (también girado)', () => {
    const b = crearBloque({ x: 0.3, y: -0.6 }, 0.4, 0.4, { angulo: 0.7 });
    const p = { x: 0.41, y: -0.33 };
    cerca(posPuerto(b, puertoLocal(b, p))!, p, 12);
  });
  it('esfera, polea y superficie', () => {
    const e = crearEsfera({ x: 0, y: 0 }, 0.5);
    cerca(posPuerto(e, 'borde:90')!, { x: 0, y: 0.5 });
    expect(posPuerto(crearPolea({ x: 1, y: 1 }), 'eje')).toEqual({ x: 1, y: 1 });
    cerca(posPuerto(crearSuperficie({ x: 0, y: 0 }, { x: 4, y: 2 }), 'u:0.25')!, { x: 1, y: 0.5 });
    expect(posPuerto(e, 'no-existe')).toBeNull();
  });
});

describe('geometría de la cuerda por poleas', () => {
  const C = { x: 0, y: 1.4 };
  it('Atwood: tramos verticales tangentes y media vuelta por arriba', () => {
    const g = geometriaRuta({ x: -0.3, y: -0.4 }, [{ k: 'circulo', c: C, r: 0.3, s: -1 }], { x: 0.3, y: 0.1 });
    expect(g.valida).toBe(true);
    cerca(g.haciaA, { x: -0.3, y: 1.4 });
    cerca(g.haciaB, { x: 0.3, y: 1.4 });
    const arco = g.tramos[1]!;
    expect(arco.k).toBe('arco');
    if (arco.k === 'arco') expect(arco.barrido).toBeCloseTo(-Math.PI, 9);
    expect(g.largo).toBeCloseTo(1.8 + Math.PI * 0.3 + 1.3, 9);
  });
  it('el sentido decide por qué lado envuelve', () => {
    const g = geometriaRuta({ x: -0.3, y: -0.4 }, [{ k: 'circulo', c: C, r: 0.3, s: 1 }], { x: 0.3, y: 0.1 });
    // Antihorario desde abajo a la izquierda: la cuerda cruza por debajo del eje… y da la vuelta por abajo.
    expect(g.haciaA.x).toBeGreaterThan(-0.3);
    expect(sentidoNatural({ x: -0.3, y: -0.4 }, C, { x: 0.3, y: 0.1 })).toBe(-1);
    expect(sentidoNatural({ x: 0.3, y: 0.1 }, C, { x: -0.3, y: -0.4 })).toBe(1);
  });
  it('entre dos poleas, la tangente exterior (mismo sentido) y la cruzada (sentidos opuestos)', () => {
    const ext = tangente({ c: { x: 0, y: 0 }, r: 0.2, s: -1 }, { c: { x: 2, y: 0 }, r: 0.2, s: -1 })!;
    cerca(ext.t1, { x: 0, y: 0.2 });
    cerca(ext.t2, { x: 2, y: 0.2 });
    const cruz = tangente({ c: { x: 0, y: 0 }, r: 0.2, s: -1 }, { c: { x: 2, y: 0 }, r: 0.2, s: 1 })!;
    expect(cruz.t1.y).toBeGreaterThan(0);
    expect(cruz.t2.y).toBeLessThan(0);
  });
  it('un extremo dentro de la polea no tiene tangente: se marca como inválida', () => {
    expect(geometriaRuta({ x: 0.1, y: 1.4 }, [{ k: 'circulo', c: C, r: 0.3, s: 1 }], { x: 2, y: 0 }).valida).toBe(false);
  });
  it('barrido en [0, 2π) según el sentido', () => {
    expect(barrido(0, Math.PI / 2, 1)).toBeCloseTo(Math.PI / 2, 12);
    expect(barrido(0, Math.PI / 2, -1)).toBeCloseTo(-1.5 * Math.PI, 12);
  });
  it('un paso de la v1 (fijos): dos rectas sueltas y sin arco', () => {
    const g = geometriaRuta({ x: 0, y: 0 }, [{ k: 'fijos', p: [{ x: 0, y: 1 }, { x: 1, y: 1 }] }], { x: 1, y: 0 });
    expect(g.tramos.map((t) => t.k)).toEqual(['recta', 'recta']);
    expect(g.largo).toBeCloseTo(2, 12);
  });
});

describe('escena resuelta', () => {
  const bloque = crearBloque({ x: 0, y: 0 }, 0.4, 0.4, { id: 'b' });
  const cuerda: Cuerda = { ...crearCuerda({ x: 0, y: 0.2 }, { x: 0, y: 2 }, { id: 'c' }), union: [{ el: 'b', puerto: 'cara-sup' }, { fijo: true }] };
  it('el extremo unido sigue al cuerpo (la cuerda no guarda su posición)', () => {
    const r = resolverEscena([{ ...bloque, centro: { x: 1, y: -1 } }, cuerda]).find((e) => e.id === 'c') as Cuerda;
    expect(r.a).toEqual({ x: 1, y: -0.8 });
    expect(r.b).toEqual({ x: 0, y: 2 });
  });
  it('se memoriza por lista y lo derivado no se guarda', () => {
    const lista = [bloque, crearPolea({ x: 0, y: 3 }, 0.3, { id: 'p' }), { ...cuerda, ruta: [{ el: 'p', sentido: -1 as const }] }];
    expect(resolverEscena(lista)).toBe(resolverEscena(lista));
    const c = resolverEscena(lista)[2] as Cuerda;
    expect(c.camino?.length).toBe(3);
    expect('camino' in sinDerivados(c)).toBe(false);
  });
  it('dependientes: lo que hay que redibujar al arrastrar un cuerpo', () => {
    const deps = dependientes([bloque, cuerda], [{ ...bloque, centro: { x: 0.5, y: 0 } }]);
    expect(deps.map((d) => d.id)).toEqual(['c']);
    expect((deps[0] as Cuerda).a).toEqual({ x: 0.5, y: 0.2 });
  });
});

describe('migración de la v1', () => {
  const v1 = (): Elemento[] => [
    crearPolea({ x: 0, y: 1.4 }, 0.3, { id: 'p' }),
    crearCuerda({ x: -0.3, y: 1.4 }, { x: -0.3, y: -0.4 }, { id: 'c1' }),
    crearCuerda({ x: 0.3, y: 1.4 }, { x: 0.3, y: 0.1 }, { id: 'c2' }),
    crearBloque({ x: -0.3, y: -0.6 }, 0.4, 0.4, { id: 'b1', masa: 3 }),
    crearBloque({ x: 0.3, y: -0.1 }, 0.4, 0.4, { id: 'b2', masa: 2 }),
    crearCuerda({ x: 5, y: 5 }, { x: 6, y: 5 }, { id: 'suelta' }),
  ];
  it('funde las dos cuerdas de la polea en una con un paso `fijos`; un extremo sin cuerpo queda fijo', () => {
    const m = completarV1(v1());
    expect(m.find((e) => e.id === 'c2')).toBeUndefined();
    const c = m.find((e) => e.id === 'c1') as Cuerda;
    expect(c.ruta).toEqual([{ el: 'p', fijos: [{ x: -0.3, y: 1.4 }, { x: 0.3, y: 1.4 }] }]);
    expect(c.union![0]).toMatchObject({ el: 'b1' });
    expect(c.union![1]).toMatchObject({ el: 'b2' });
    expect((m.find((e) => e.id === 'suelta') as Cuerda).union).toEqual([{ fijo: true }, { fijo: true }]);
    expect(completarV1(m)).toBe(m); // idempotente
  });
  it('apoyo: todas las superficies a menos de 9 cm, de la más cercana a la más lejana', () => {
    const piso = crearSuperficie({ x: -2, y: 0 }, { x: 2, y: 0 }, { id: 'piso' });
    const pared = crearSuperficie({ x: -1, y: 2 }, { x: -1, y: 0 }, { id: 'pared' });
    const b = crearBloque({ x: -0.75, y: 0.21 }, 0.4, 0.4, { id: 'b' });
    expect((completarV1([piso, pared, b])[2] as Bloque).apoyo).toEqual(['piso', 'pared']);
  });
  it('un proyecto v1 se abre con una op de migración que no se deshace, y se guarda como v2', () => {
    const ops = v1().map((e, i) => ({ id: `o${i}`, t: i, autor: 'x', tipo: 'elemento/agregar', payload: e }));
    const abierto = leerProyecto(JSON.stringify({ app: 'pizarra', schemaVersion: 1, ops }));
    expect(abierto).toHaveLength(ops.length + 1);
    expect(abierto.at(-1)!.tipo).toBe(OP_MIGRACION);
    const store = new Store<Escena>(escenaInicial, reductoresEscena);
    store.cargar(abierto);
    expect(store.estado.elementos.find((e) => e.id === 'c2')).toBeUndefined();
    // Deshacer salta la migración: deshace la última op del usuario.
    store.deshacer();
    expect(store.estado.elementos.some((e) => e.id === 'suelta')).toBe(false);
    expect((store.estado.elementos.find((e) => e.id === 'c1') as Cuerda).ruta).toBeDefined();
    store.rehacer();
    expect(store.estado.elementos.some((e) => e.id === 'suelta')).toBe(true);
    const guardado = serializarProyecto(store.ops);
    expect(JSON.parse(guardado).schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(2);
    expect(leerProyecto(guardado)).toHaveLength(store.ops.length); // un v2 no se vuelve a migrar
  });
  it('una pizarra v1 sin objetos físicos no recibe op de migración', () => {
    const ops = [{ id: 'o', t: 0, autor: 'x', tipo: 'elemento/agregar', payload: { id: 't', tipo: 'trazo', color: 'tinta', grosor: 0.02, puntos: [0, 0, 0.5, 1, 1, 0.5], resaltador: false } }];
    expect(leerProyecto(JSON.stringify({ app: 'pizarra', schemaVersion: 1, ops }))).toHaveLength(1);
  });
  it('el Atwood migrado simula igual (a y T de la teoría)', () => {
    const s = correr(completarV1(v1()), 0.3);
    expect(s.estado.T[0]).toBeCloseTo((2 * 3 * 2 * G) / 5, 6);
    expect(s.estado.a[1]!.y).toBeCloseTo(G / 5, 6);
  });
});

describe('conexión al dibujar (Fase 1)', () => {
  const polea = crearPolea({ x: 0, y: 1.4 }, 0.3, { id: 'p' });
  const b1 = crearBloque({ x: -0.3, y: -0.6 }, 0.4, 0.4, { id: 'b1', masa: 3, etiqueta: 'm_1' });
  const b2 = crearBloque({ x: 0.3, y: -0.1 }, 0.4, 0.4, { id: 'b2', masa: 2, etiqueta: 'm_2' });

  it('un extremo cerca de un cuerpo se une a su puerto más cercano; si no, queda fijo', () => {
    const u = unirExtremo({ x: -0.27, y: -0.35 }, [b1]);
    expect(u.union).toEqual({ el: 'b1', puerto: 'cara-sup' });
    cerca(u.p, { x: -0.3, y: -0.4 });
    expect(unirExtremo({ x: 3, y: 3 }, [b1]).union).toEqual({ fijo: true });
  });

  it('dos cuerdas que llegan a la misma polea se funden en una que la envuelve', () => {
    const escena = dibujar(polea, b1, b2, crearCuerda({ x: -0.28, y: -0.38 }, { x: -0.3, y: 1.4 }, { id: 'c1' }), crearCuerda({ x: 0.31, y: 1.38 }, { x: 0.3, y: 0.12 }, { id: 'c2' }));
    const cuerdas = escena.filter((e): e is Cuerda => e.tipo === 'cuerda');
    expect(cuerdas).toHaveLength(1);
    expect(cuerdas[0]!.ruta).toEqual([{ el: 'p', sentido: -1 }]);
    expect(cuerdas[0]!.union).toEqual([
      { el: 'b1', puerto: 'cara-sup' },
      { el: 'b2', puerto: 'cara-sup' },
    ]);
  });

  it('Atwood dibujado (con envoltura real): a = (m₁ − m₂) g /(m₁ + m₂), T = 2 m₁ m₂ g /(m₁ + m₂)', () => {
    const escena = dibujar(polea, b1, b2, crearCuerda({ x: -0.3, y: -0.4 }, { x: -0.3, y: 1.4 }), crearCuerda({ x: 0.3, y: 1.4 }, { x: 0.3, y: 0.1 }));
    const s = correr(escena, 0.5);
    expect(s.estado.a[0]!.x).toBeCloseTo(0, 9);
    expect(s.estado.a[0]!.y).toBeCloseTo(-G / 5, 6);
    expect(s.estado.a[1]!.y).toBeCloseTo(G / 5, 6);
    expect(s.estado.T[0]).toBeCloseTo((2 * 3 * 2 * G) / 5, 6);
    // El DCL lee lo mismo: la tensión de cada bloque apunta hacia arriba (hacia la tangente).
    const dcl = resolverDcl(b1, escena, G);
    const t = dcl.fuerzas.find((f) => f.rol === 'tension')!;
    expect(t.angulo).toBeCloseTo(Math.PI / 2, 9);
  });

  it('aunque la cuerda termine en el centro de la polea, con envoltura sigue siendo un Atwood (sin tirones de lado)', () => {
    const escena = dibujar(polea, b1, b2, crearCuerda({ x: -0.3, y: -0.4 }, { x: 0, y: 1.4 }), crearCuerda({ x: 0, y: 1.42 }, { x: 0.3, y: 0.1 }));
    const s = correr(escena, 0.3);
    expect(Math.abs(s.estado.a[0]!.x)).toBeLessThan(1e-9);
    expect(s.estado.a[0]!.y).toBeCloseTo(-G / 5, 6);
  });

  it('plano inclinado + polea en la arista + bloque colgante: la aceleración de la teoría', () => {
    const th = Math.PI / 6;
    const [m1, m2, muK] = [2, 3, 0.1];
    const A = { x: -3, y: 0 };
    const t = { x: Math.cos(th), y: Math.sin(th) };
    const n = { x: -Math.sin(th), y: Math.cos(th) };
    const plano = crearSuperficie(A, { x: A.x + 3 * t.x, y: A.y + 3 * t.y }, { id: 'pl', muS: 0.15, muK, relleno: 'cuna' });
    const alto = 0.4;
    const bl = crearBloque({ x: A.x + 1.5 * t.x + (alto / 2) * n.x, y: A.y + 1.5 * t.y + (alto / 2) * n.y }, 0.6, alto, { id: 'b1', masa: m1, angulo: th });
    const cara = posPuerto(bl, 'cara-der')!;
    // La polea toca por arriba la recta de la cuerda (paralela al plano) un poco más allá de la arista.
    const r = 0.25;
    const Q = { x: cara.x + 1.6 * t.x, y: cara.y + 1.6 * t.y };
    const pol = crearPolea({ x: Q.x - r * n.x, y: Q.y - r * n.y }, r, { id: 'pp' });
    const colgante = crearBloque({ x: pol.centro.x + r, y: pol.centro.y - 1.6 }, 0.4, 0.4, { id: 'b2', masa: m2 });
    const escena = dibujar(plano, bl, pol, colgante, crearCuerda(cara, Q), crearCuerda({ x: pol.centro.x + r, y: pol.centro.y }, posPuerto(colgante, 'cara-sup')!));
    expect((escena.find((e) => e.id === 'b1') as Bloque).apoyo).toEqual(['pl']);
    expect((escena.find((e) => e.id === 'b2') as Bloque).apoyo).toEqual([]);
    const cuerda = escena.find((e): e is Cuerda => e.tipo === 'cuerda')!;
    expect(cuerda.ruta).toEqual([{ el: 'pp', sentido: -1 }]);
    const s = correr(escena, 0.2);
    const aTeo = (m2 * G - m1 * G * Math.sin(th) - muK * m1 * G * Math.cos(th)) / (m1 + m2);
    // Tolerancia 5e-4: las coordenadas se guardan con 0,1 mm, así que el plano y la cuerda no son exactamente de 30°.
    expect(s.estado.a[0]!.x).toBeCloseTo(aTeo * t.x, 3);
    expect(s.estado.a[0]!.y).toBeCloseTo(aTeo * t.y, 3);
    expect(s.estado.a[1]!.y).toBeCloseTo(-aTeo, 3);
    expect(s.estado.T[0]).toBeCloseTo(m2 * (G - aTeo), 3);
    // Y con una cuerda inextensible los dos bloques tienen la misma rapidez de cambio a lo largo de ella.
    expect(Math.hypot(s.estado.a[0]!.x, s.estado.a[0]!.y)).toBeCloseTo(-s.estado.a[1]!.y, 4);
  });

  it('un cuerpo soltado cerca de una superficie queda apoyado y lo registra', () => {
    const piso = crearSuperficie({ x: -2, y: 0 }, { x: 2, y: 0 }, { id: 'piso' });
    expect(apoyar(crearBloque({ x: 0, y: 0.5 }, 0.4, 0.4), [piso]).apoyo).toEqual(['piso']);
    expect(apoyar(crearBloque({ x: 0, y: 3 }, 0.4, 0.4), [piso]).apoyo).toEqual([]);
  });

  it('una fuerza aplicada dibujada desde un cuerpo actúa sobre él', () => {
    const escena = dibujar(b1, crearVector('aplicada', { x: -0.3, y: -0.6 }, { x: 1, y: -0.6 }, { id: 'v' }));
    expect(escena.find((e) => e.id === 'v')).toMatchObject({ cuerpo: 'b1' });
  });

  it('las marcas muestran qué extremos están unidos, fijos o sueltos', () => {
    const r: Resorte = { ...crearResorte({ x: 0, y: 0 }, { x: 1, y: 0 }), union: [{ fijo: true }, null] };
    expect(marcasDeUnion([r]).map((m) => m.tipo)).toEqual(['fijo', 'suelto']);
  });
});

describe('integridad al editar', () => {
  const b = crearBloque({ x: 0, y: 0.2 }, 0.4, 0.4, { id: 'b', apoyo: ['piso'] });
  const piso: Superficie = crearSuperficie({ x: -2, y: 0 }, { x: 2, y: 0 }, { id: 'piso' });
  const c: Cuerda = { ...crearCuerda({ x: 0, y: 0.4 }, { x: 0, y: 2 }, { id: 'c' }), union: [{ el: 'b', puerto: 'cara-sup' }, { fijo: true }] };

  it('borrar un cuerpo deja suelto el extremo, donde estaba, en la misma op', () => {
    const l = prepararLote({ borrar: ['b'] }, [piso, { ...b, centro: { x: 1, y: 0.2 } }, c]);
    const nc = l.actualizar!.find((e) => e.id === 'c') as Cuerda;
    expect(nc.union).toEqual([null, { fijo: true }]);
    expect(nc.a).toEqual({ x: 1, y: 0.4 });
    expect(validar([piso, nc]).some((p) => p.tipo === 'extremo-suelto')).toBe(true);
  });

  it('borrar una polea saca el paso de la ruta', () => {
    const pol = crearPolea({ x: 0, y: 3 }, 0.3, { id: 'p' });
    const conRuta: Cuerda = { ...c, ruta: [{ el: 'p', sentido: -1 }] };
    const l = prepararLote({ borrar: ['p'] }, [b, pol, conRuta]);
    expect((l.actualizar!.find((e) => e.id === 'c') as Cuerda).ruta).toEqual([]);
  });

  it('mover la superficie arrastra al cuerpo apoyado (y lo gira con ella)', () => {
    const rampa: Superficie = { ...piso, a: { x: -2, y: -2 }, b: { x: 2, y: 2 } };
    const l = prepararLote({ actualizar: [rampa] }, [piso, b, c]);
    const nb = l.actualizar!.find((e) => e.id === 'b') as Bloque;
    expect(nb.angulo).toBeCloseTo(Math.PI / 4, 3);
    // Sigue a 0,2 m de la superficie, del mismo lado.
    expect((nb.centro.y - nb.centro.x) / Math.SQRT2).toBeCloseTo(0.2, 3);
  });

  it('mover el extremo de una cuerda lo vuelve a unir donde quedó', () => {
    const otro = crearBloque({ x: 2, y: 0.2 }, 0.4, 0.4, { id: 'b2' });
    const r = resolverEscena([piso, b, otro, c]).find((e) => e.id === 'c') as Cuerda;
    const l = prepararLote({ actualizar: [{ ...r, a: { x: 2.02, y: 0.41 } }] }, [piso, b, otro, c]);
    expect((l.actualizar![0] as Cuerda).union![0]).toEqual({ el: 'b2', puerto: 'cara-sup' });
  });

  it('mover un cuerpo junto con su cuerda conserva la unión', () => {
    const r = resolverEscena([piso, b, c]).find((e) => e.id === 'c') as Cuerda;
    const l = prepararLote({ actualizar: [{ ...b, centro: { x: 0.5, y: 0.2 } }, { ...r, a: { x: 0.5, y: 0.4 }, b: { x: 0.5, y: 2 } }] }, [piso, b, c]);
    expect((l.actualizar!.find((e) => e.id === 'c') as Cuerda).union).toEqual([{ el: 'b', puerto: 'cara-sup' }, { fijo: true }]);
  });

  it('lo derivado no llega a la op', () => {
    const conCamino = { ...c, camino: [{ k: 'recta' as const, a: c.a, b: c.b }] };
    const l = prepararLote({ agregar: [conCamino] }, []);
    expect('camino' in l.agregar![0]!).toBe(false);
  });

  it('la op de lote con la integridad se reduce como cualquier otra', () => {
    const store = new Store<Escena>(escenaInicial, reductoresEscena);
    store.cargar([{ id: 'x', t: 0, autor: 'a', tipo: OP_LOTE, payload: { agregar: [piso, b, c] } }]);
    store.emitir(OP_LOTE, prepararLote({ borrar: ['b'] }, store.estado.elementos));
    expect((store.estado.elementos.find((e) => e.id === 'c') as Cuerda).union![0]).toBeNull();
    store.deshacer();
    expect((store.estado.elementos.find((e) => e.id === 'c') as Cuerda).union![0]).toEqual({ el: 'b', puerto: 'cara-sup' });
  });
});

describe('problemas de la escena', () => {
  it('sin cuerpos, cuerpos superpuestos, fuerza que no sale de un cuerpo, polea sin cuerda', () => {
    expect(validar([]).map((p) => p.tipo)).toEqual(['sin-cuerpos']);
    const tipos = validar([
      crearBloque({ x: 0, y: 0 }, 0.9, 0.6, { apoyo: [] }),
      crearBloque({ x: 0.3, y: -0.4 }, 0.9, 0.6, { apoyo: [] }),
      { ...crearVector('aplicada', { x: 5, y: 5 }, { x: 6, y: 5 }), cuerpo: null },
      crearPolea({ x: 9, y: 9 }),
    ]).map((p) => p.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['superpuestos', 'fuerza-sin-cuerpo', 'polea-sin-cuerda']));
  });
  it('una cuerda sin cuerpos no hace nada; una ruta imposible es un error', () => {
    const pol = crearPolea({ x: 0, y: 0 }, 0.5, { id: 'p' });
    const b = crearBloque({ x: 3, y: -1 }, 0.4, 0.4, { id: 'b', apoyo: [] });
    const imposible: Cuerda = { ...crearCuerda({ x: 0.1, y: 0 }, { x: 3, y: -0.8 }), union: [{ fijo: true }, { el: 'b', puerto: 'cara-sup' }], ruta: [{ el: 'p', sentido: 1 }] };
    const inutil: Cuerda = { ...crearCuerda({ x: 5, y: 0 }, { x: 6, y: 0 }), union: [{ fijo: true }, { fijo: true }] };
    const ps = validar([pol, b, imposible, inutil]);
    expect(ps.find((p) => p.tipo === 'ruta-imposible')?.gravedad).toBe('error');
    expect(ps.find((p) => p.tipo === 'sin-efecto')?.texto).toContain('no está unida a ningún cuerpo');
  });
  it('un apoyo que quedó lejos se avisa, y la simulación lo deja en el aire', () => {
    const piso = crearSuperficie({ x: -2, y: 0 }, { x: 2, y: 0 }, { id: 'piso' });
    const b = crearBloque({ x: 0, y: 2 }, 0.4, 0.4, { apoyo: ['piso'] });
    expect(validar([piso, b]).map((p) => p.tipo)).toContain('apoyo-lejano');
    expect(correr([piso, b], 0).descripcion(0)).toBe('en el aire');
  });
});

describe('exportación de cuerdas que pasan por poleas', () => {
  const escena = dibujar(
    crearPolea({ x: 0, y: 1.4 }, 0.3, { id: 'p' }),
    crearBloque({ x: -0.3, y: -0.6 }, 0.4, 0.4, { id: 'b1', masa: 3 }),
    crearBloque({ x: 0.3, y: -0.1 }, 0.4, 0.4, { id: 'b2', masa: 2 }),
    crearCuerda({ x: -0.3, y: -0.4 }, { x: -0.3, y: 1.4 }),
    crearCuerda({ x: 0.3, y: 1.4 }, { x: 0.3, y: 0.1 }),
  );
  it('TikZ dibuja el arco de contacto con `arc` y SVG con un trazado `A`', () => {
    const resuelta = resolverEscena(escena);
    expect(aTikz(resuelta, { modo: 'fragmento' }).codigo).toMatch(/-- \([\d.,-]+\) arc\[start angle=180, end angle=0, radius=[\d.]+\] -- /);
    expect(aSvg(resuelta)).toMatch(/<path d="M[^"]* A[^"]*"/);
  });
});
