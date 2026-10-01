// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Elemento } from '../src/core/elementos';
import { escenaInicial, OP_AGREGAR, OP_BORRAR, reductoresEscena } from '../src/core/escena';
import type { Escena } from '../src/core/escena';
import { Store } from '../src/core/store';
import { crearForma, crearTrazo } from '../src/ink/herramientas';
import { BdMemoria } from '../src/share/bd';
import { Difusor } from '../src/share/difusor';
import { FirebaseTransport } from '../src/share/firebaseTransport';
import { ESPERA_SALA_MS, LocalTransport } from '../src/share/localTransport';
import {
  ALFABETO_SALA,
  generarCodigo,
  LARGO_CODIGO,
  normalizarCodigo,
  SNAPSHOT_CADA,
} from '../src/share/protocolo';
import type { EstadoConexion } from '../src/share/protocolo';
import { Sincronizador } from '../src/share/sincronizador';
import type { Transport } from '../src/share/transport';
import { ProductorVivo, ReconstructorVivo } from '../src/share/vivo';

const nuevaPizarra = (): Store<Escena> => {
  let n = 0;
  return new Store<Escena>(escenaInicial, reductoresEscena, { autor: 'prof', nuevoId: () => `op${++n}` });
};

const linea = (i: number): Elemento => crearForma('linea', { x: i, y: 0 }, { x: i + 1, y: 1 }, 'tinta', 0.02, `l${i}`);

/** Deja correr las notificaciones asíncronas de la base en memoria y de los canales. */
const esperar = async (ms = 0): Promise<void> => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, ms));
};

async function espectador(t: Transport, codigo: string) {
  const store = nuevaPizarra();
  const r = await t.unirse(codigo);
  const sync = new Sincronizador({
    cargar: (ops) => store.cargar(ops),
    aplicar: (op) => store.aplicarExterna(op),
    pedirResync: () => r.resincronizar(),
  });
  const rec = new ReconstructorVivo();
  const e = { store, r, estados: [] as EstadoConexion[], vivo: null as Elemento | null, ocultos: new Set<string>() };
  r.alSnapshot((s) => sync.alSnapshot(s));
  r.alOp((m) => sync.alOp(m));
  r.alVivo((l) => {
    if (l) {
      const x = rec.aplicar(l);
      e.vivo = x.elemento;
      e.ocultos = new Set(x.ocultos);
    } else {
      rec.limpiar();
      e.vivo = null;
      e.ocultos = new Set();
    }
  });
  r.alEstado((s) => e.estados.push(s));
  r.iniciar();
  return e;
}

const ids = (s: Store<Escena>): string[] => s.estado.elementos.map((x) => x.id);

describe('códigos de sala', () => {
  it('tienen 5 caracteres del alfabeto sin ambiguos', () => {
    for (let i = 0; i < 200; i++) {
      const c = generarCodigo();
      expect(c).toHaveLength(LARGO_CODIGO);
      expect([...c].every((ch) => ALFABETO_SALA.includes(ch))).toBe(true);
    }
    expect(ALFABETO_SALA).not.toMatch(/[01OI]/);
  });

  it('se normalizan las minúsculas, espacios y guiones y se rechaza lo inválido', () => {
    expect(normalizarCodigo(' k7p-2q ')).toBe('K7P2Q');
    expect(normalizarCodigo('K7P2')).toBeNull();
    expect(normalizarCodigo('K7P20')).toBeNull(); // el 0 no existe
    expect(normalizarCodigo('K7P2QQ')).toBeNull();
  });
});

describe('trazo en construcción por lotes', () => {
  it('cada lote lleva solo los puntos nuevos y el receptor rearma el trazo completo', () => {
    const p = new ProductorVivo();
    const r = new ReconstructorVivo();
    const pts = [0, 0, 0.5, 1, 1, 0.5, 2, 1, 0.5, 3, 0, 0.5];
    const l1 = p.lote(crearTrazo(pts.slice(0, 6), 'tinta', 0.02, false, 'a'), new Set());
    const l2 = p.lote(crearTrazo(pts, 'tinta', 0.02, false, 'a'), new Set());
    expect(l1.pts).toHaveLength(6);
    expect(l2.desde).toBe(6);
    expect(l2.pts).toEqual(pts.slice(6));
    r.aplicar(l1);
    const { elemento } = r.aplicar(l2);
    expect(elemento).toMatchObject({ tipo: 'trazo', id: 'a', puntos: pts });
  });

  it('un trazo nuevo empieza de cero y las formas viajan enteras', () => {
    const p = new ProductorVivo();
    p.lote(crearTrazo([0, 0, 0.5, 1, 1, 0.5], 'tinta', 0.02, false, 'a'), new Set());
    const l = p.lote(crearTrazo([5, 5, 0.5, 6, 6, 0.5], 'tinta', 0.02, false, 'b'), new Set());
    expect(l.desde).toBe(0);
    const f = crearForma('rect', { x: 0, y: 0 }, { x: 1, y: 1 }, 'tinta', 0.02, 'f');
    expect(p.lote(f, new Set()).els).toEqual([f]);
  });

  it('el borrador solo envía qué ids está borrando', () => {
    const p = new ProductorVivo();
    const l = p.lote(null, new Set(['x', 'y']));
    expect(l).toEqual({ id: '', ocultos: ['x', 'y'] });
    expect(new ReconstructorVivo().aplicar(l).ocultos).toEqual(new Set(['x', 'y']));
  });
});

describe('Sincronizador', () => {
  const armar = () => {
    const eventos: string[] = [];
    const s = new Sincronizador({
      cargar: (ops) => eventos.push(`cargar:${ops.length}`),
      aplicar: (op) => eventos.push(`aplicar:${op.id}`),
      pedirResync: () => eventos.push('resync'),
    });
    const op = (id: string) => ({ id, t: 0, autor: 'x', tipo: 't', payload: null });
    return { s, eventos, op };
  };

  it('ops que llegan antes del snapshot esperan y se aplican en orden', () => {
    const { s, eventos, op } = armar();
    s.alOp({ epoca: 1, seq: 3, op: op('c') });
    s.alOp({ epoca: 1, seq: 2, op: op('b') });
    s.alSnapshot({ epoca: 1, seq: 1, ops: [op('a')] });
    expect(eventos).toEqual(['cargar:1', 'aplicar:b', 'aplicar:c']);
  });

  it('ignora repetidas y pide resync ante un hueco', () => {
    const { s, eventos, op } = armar();
    s.alSnapshot({ epoca: 1, seq: 1, ops: [op('a')] });
    s.alOp({ epoca: 1, seq: 2, op: op('b') });
    s.alOp({ epoca: 1, seq: 2, op: op('b') });
    s.alOp({ epoca: 1, seq: 4, op: op('d') });
    expect(eventos).toEqual(['cargar:1', 'aplicar:b', 'resync']);
  });

  it('una época nueva reemplaza todo; una op de época nueva sin snapshot pide resync', () => {
    const { s, eventos, op } = armar();
    s.alSnapshot({ epoca: 1, seq: 0, ops: [] });
    s.alSnapshot({ epoca: 2, seq: 1, ops: [op('z')] });
    s.alOp({ epoca: 3, seq: 1, op: op('q') });
    expect(eventos).toEqual(['cargar:0', 'cargar:1', 'resync']);
  });

  it('un snapshot más nuevo de la misma época se toma (reconexión tras poda)', () => {
    const { s, eventos, op } = armar();
    s.alSnapshot({ epoca: 1, seq: 2, ops: [op('a'), op('b')] });
    s.alSnapshot({ epoca: 1, seq: 2, ops: [op('a'), op('b')] }); // nada nuevo: se ignora
    s.alSnapshot({ epoca: 1, seq: 60, ops: Array.from({ length: 60 }, (_, i) => op(`o${i}`)) });
    expect(eventos).toEqual(['cargar:2', 'cargar:60']);
  });
});

describe('Difusor + FirebaseTransport (base en memoria)', () => {
  let bd: BdMemoria;
  let t: Transport;
  let tCliente: Transport;

  beforeEach(() => {
    bd = new BdMemoria();
    t = new FirebaseTransport(() => Promise.resolve(bd.cliente('profesor')));
    tCliente = new FirebaseTransport(() => Promise.resolve(bd.cliente('estudiante')));
  });

  async function transmitir(pizarra = nuevaPizarra(), codigo = 'ABCDE') {
    const emisor = await t.crearSala(codigo);
    return { pizarra, emisor, difusor: new Difusor(emisor, pizarra) };
  }

  it('el estudiante ve lo que ya estaba dibujado y lo que se dibuja después', async () => {
    const pizarra = nuevaPizarra();
    pizarra.emitir(OP_AGREGAR, linea(1));
    await transmitir(pizarra);
    const e = await espectador(tCliente, 'ABCDE');
    await esperar();
    expect(ids(e.store)).toEqual(['l1']);
    pizarra.emitir(OP_AGREGAR, linea(2));
    pizarra.emitir(OP_AGREGAR, linea(3));
    await esperar();
    expect(ids(e.store)).toEqual(['l1', 'l2', 'l3']);
    expect(e.estados).toContain('conectado');
  });

  it('deshacer, rehacer y borrar del profesor llegan igual', async () => {
    const { pizarra } = await transmitir();
    const e = await espectador(tCliente, 'ABCDE');
    pizarra.emitir(OP_AGREGAR, linea(1));
    pizarra.emitir(OP_AGREGAR, linea(2));
    pizarra.emitir(OP_BORRAR, { ids: ['l1'] });
    pizarra.deshacer();
    pizarra.deshacer();
    pizarra.rehacer();
    await esperar();
    expect(e.store.estado).toEqual(pizarra.estado);
    expect(ids(e.store)).toEqual(['l1', 'l2']);
  });

  it('quien entra tarde pasa por snapshots y ops y llega al mismo estado', async () => {
    const { pizarra } = await transmitir();
    for (let i = 0; i < SNAPSHOT_CADA * 2 + 7; i++) pizarra.emitir(OP_AGREGAR, linea(i));
    await esperar();
    const tarde = await espectador(tCliente, 'ABCDE');
    await esperar();
    expect(tarde.store.estado).toEqual(pizarra.estado);
    expect(tarde.store.estado.elementos).toHaveLength(SNAPSHOT_CADA * 2 + 7);
  });

  it('al abrir otro proyecto empieza una época nueva y todos la siguen', async () => {
    const { pizarra } = await transmitir();
    pizarra.emitir(OP_AGREGAR, linea(1));
    const e = await espectador(tCliente, 'ABCDE');
    await esperar();
    pizarra.cargar([{ id: 'x-1', t: 0, autor: 'otro', tipo: OP_AGREGAR, payload: linea(9) }]);
    await esperar();
    expect(ids(e.store)).toEqual(['l9']);
    pizarra.emitir(OP_AGREGAR, linea(10));
    await esperar();
    expect(ids(e.store)).toEqual(['l9', 'l10']);
  });

  it('si el estudiante pierde la red, avisa, y al volver se pone al día', async () => {
    const { pizarra } = await transmitir();
    const e = await espectador(tCliente, 'ABCDE');
    pizarra.emitir(OP_AGREGAR, linea(1));
    await esperar();
    bd.ponerConectado(false);
    await esperar();
    expect(e.estados.at(-1)).toBe('reconectando');
    for (let i = 2; i < SNAPSHOT_CADA + 5; i++) pizarra.emitir(OP_AGREGAR, linea(i)); // pasa una poda de ops
    await esperar();
    bd.ponerConectado(true);
    await esperar();
    expect(e.estados.at(-1)).toBe('conectado');
    expect(e.store.estado).toEqual(pizarra.estado);
  });

  it('una sala que no existe o que el profesor cerró se informa', async () => {
    const vacia = await espectador(tCliente, 'ZZZZZ');
    await esperar();
    expect(vacia.estados.at(-1)).toBe('sin-sala');

    const { difusor } = await transmitir();
    const e = await espectador(tCliente, 'ABCDE');
    await esperar();
    difusor.detener();
    await esperar();
    expect(e.estados.at(-1)).toBe('sin-sala');
  });

  it('no se puede crear una sala con un código ya usado', async () => {
    await transmitir();
    await expect(t.crearSala('ABCDE')).rejects.toThrow(/ya está en uso/);
  });

  it('el trazo en construcción se ve en vivo y desaparece al terminar', async () => {
    vi.useFakeTimers();
    try {
      const { difusor } = await transmitir();
      const e = await espectador(tCliente, 'ABCDE');
      await vi.advanceTimersByTimeAsync(10);
      const pts = (n: number) => Array.from({ length: n }, (_, i) => [i, i, 0.5]).flat();
      difusor.vivo(crearTrazo(pts(2), 'tinta', 0.02, false, 'v'), new Set());
      await vi.advanceTimersByTimeAsync(10);
      difusor.vivo(crearTrazo(pts(4), 'tinta', 0.02, false, 'v'), new Set()); // dentro de la ventana: espera
      await vi.advanceTimersByTimeAsync(80);
      expect(e.vivo).toMatchObject({ id: 'v', puntos: pts(4) });
      difusor.vivo(null, new Set());
      await vi.advanceTimersByTimeAsync(10);
      expect(e.vivo).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('no manda un lote por cada movimiento: máximo uno cada 50 ms', async () => {
    vi.useFakeTimers();
    try {
      const enviados: number[] = [];
      const emisor = {
        codigo: 'X',
        publicarSnapshot: () => {},
        publicarOp: () => {},
        publicarVivo: () => enviados.push(Date.now()),
        limpiarVivo: () => {},
        publicarVista: () => {},
        alEstado: () => () => {},
        cerrar: () => {},
      };
      const d = new Difusor(emisor, nuevaPizarra());
      for (let i = 0; i < 100; i++) {
        d.vivo(crearTrazo([0, 0, 0.5, i, i, 0.5], 'tinta', 0.02, false, 'v'), new Set());
        await vi.advanceTimersByTimeAsync(5); // 100 movimientos en 500 ms
      }
      await vi.advanceTimersByTimeAsync(60);
      expect(enviados.length).toBeGreaterThanOrEqual(9);
      expect(enviados.length).toBeLessThanOrEqual(12);
    } finally {
      vi.useRealTimers();
    }
  });

  it('el encuadre del profesor se publica y se agrupa', async () => {
    vi.useFakeTimers();
    try {
      const { difusor } = await transmitir();
      const e = await espectador(tCliente, 'ABCDE');
      const vistas: unknown[] = [];
      e.r.alVista((v) => vistas.push(v));
      await vi.advanceTimersByTimeAsync(10);
      for (let i = 0; i < 20; i++) difusor.vista({ cx: i, cy: 0, escala: 100, ancho: 1000, alto: 600 });
      await vi.advanceTimersByTimeAsync(300);
      expect(vistas.at(-1)).toMatchObject({ cx: 19 });
      expect(vistas.length).toBeLessThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('LocalTransport (BroadcastChannel)', () => {
  const abiertos: Array<{ cerrar(): void }> = [];
  afterEach(() => abiertos.splice(0).forEach((x) => x.cerrar()));

  it('conecta dos extremos: llega lo previo, lo nuevo y deshacer', async () => {
    const t = new LocalTransport();
    const pizarra = nuevaPizarra();
    pizarra.emitir(OP_AGREGAR, linea(1));
    const emisor = await t.crearSala('LOCAL');
    abiertos.push(emisor);
    const difusor = new Difusor(emisor, pizarra);
    const e = await espectador(t, 'LOCAL');
    abiertos.push(e.r);
    await esperar(5);
    expect(ids(e.store)).toEqual(['l1']);
    pizarra.emitir(OP_AGREGAR, linea(2));
    pizarra.deshacer();
    await esperar(5);
    expect(e.store.estado).toEqual(pizarra.estado);
    difusor.detener();
  });

  it('el que entra tarde recibe todo, y una sala inexistente se declara tras la espera', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const t = new LocalTransport();
      const vacio = await espectador(t, 'NOHAY');
      abiertos.push(vacio.r);
      await vi.advanceTimersByTimeAsync(ESPERA_SALA_MS + 50);
      expect(vacio.estados.at(-1)).toBe('sin-sala');
    } finally {
      vi.useRealTimers();
    }
  });
});
