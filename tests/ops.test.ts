import { describe, expect, it } from 'vitest';
import { escenaInicial, OP_AGREGAR, reductoresEscena } from '../src/core/escena';
import type { Escena } from '../src/core/escena';
import type { Elemento } from '../src/core/elementos';
import { opsActivas, pilaRehacer } from '../src/core/ops';
import { Store } from '../src/core/store';

function nuevo(): Store<Escena> {
  let n = 0;
  return new Store<Escena>(escenaInicial, reductoresEscena, {
    nuevoId: () => `op${++n}`,
    ahora: () => 1000 + n,
  });
}

const marca = (x: number): Elemento => ({
  id: `e${x}`,
  tipo: 'linea',
  color: 'tinta',
  grosor: 0.02,
  a: { x, y: 0 },
  b: { x: x + 1, y: 0 },
});

describe('registro de ops', () => {
  it('reduce las ops en orden', () => {
    const s = nuevo();
    s.emitir(OP_AGREGAR, marca(1));
    s.emitir(OP_AGREGAR, marca(2));
    expect(s.estado.elementos).toEqual([marca(1), marca(2)]);
  });

  it('deshacer y rehacer son ops: el registro solo crece', () => {
    const s = nuevo();
    s.emitir(OP_AGREGAR, marca(1));
    s.emitir(OP_AGREGAR, marca(2));
    s.deshacer();
    expect(s.estado.elementos).toEqual([marca(1)]);
    expect(s.ops).toHaveLength(3);
    s.rehacer();
    expect(s.estado.elementos).toEqual([marca(1), marca(2)]);
    expect(s.ops).toHaveLength(4);
  });

  it('deshace varias veces y rehace en orden inverso', () => {
    const s = nuevo();
    [1, 2, 3].forEach((x) => s.emitir(OP_AGREGAR, marca(x)));
    s.deshacer();
    s.deshacer();
    expect(s.estado.elementos).toEqual([marca(1)]);
    s.rehacer();
    expect(s.estado.elementos).toEqual([marca(1), marca(2)]);
    s.rehacer();
    expect(s.estado.elementos).toEqual([marca(1), marca(2), marca(3)]);
    expect(s.puedeRehacer).toBe(false);
  });

  it('una op nueva vacía la pila de rehacer', () => {
    const s = nuevo();
    s.emitir(OP_AGREGAR, marca(1));
    s.deshacer();
    expect(s.puedeRehacer).toBe(true);
    s.emitir(OP_AGREGAR, marca(9));
    expect(s.puedeRehacer).toBe(false);
    expect(s.rehacer()).toBe(false);
    expect(s.estado.elementos).toEqual([marca(9)]);
  });

  it('deshacer/rehacer sin nada que hacer devuelven false y no tocan el registro', () => {
    const s = nuevo();
    expect(s.deshacer()).toBe(false);
    expect(s.rehacer()).toBe(false);
    expect(s.ops).toHaveLength(0);
  });

  it('reproducir el registro en otro store da el mismo estado (espectador)', () => {
    const a = nuevo();
    a.emitir(OP_AGREGAR, marca(1));
    a.emitir(OP_AGREGAR, marca(2));
    a.deshacer();
    a.emitir(OP_AGREGAR, marca(3));
    a.deshacer();
    a.rehacer();

    const b = nuevo();
    b.cargar(a.ops);
    expect(b.estado).toEqual(a.estado);
    expect(pilaRehacer(b.ops)).toEqual(pilaRehacer(a.ops));
    expect(opsActivas(b.ops).map((o) => o.id)).toEqual(opsActivas(a.ops).map((o) => o.id));
  });

  it('aplicarExterna ignora ids repetidos y tipos desconocidos no rompen', () => {
    const a = nuevo();
    const op = a.emitir(OP_AGREGAR, marca(1));
    const b = nuevo();
    b.aplicarExterna(op);
    b.aplicarExterna(op);
    b.aplicarExterna({ id: 'x', t: 0, autor: 'z', tipo: 'futuro/algo', payload: {} });
    expect(b.estado.elementos).toEqual([marca(1)]);
    expect(b.ops).toHaveLength(2);
  });

  it('notifica a los suscriptores en cada cambio', () => {
    const s = nuevo();
    let llamadas = 0;
    const baja = s.suscribir(() => llamadas++);
    s.emitir(OP_AGREGAR, marca(1));
    s.deshacer();
    baja();
    s.rehacer();
    expect(llamadas).toBe(2);
  });
});
