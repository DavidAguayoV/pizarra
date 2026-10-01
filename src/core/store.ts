import type { ObjetivoPayload, Op } from './ops';
import { OP_DESHACER, OP_REHACER, opsActivas, pilaRehacer } from './ops';

export type Reductor<S> = (estado: S, payload: never, op: Op) => S;
export type Reductores<S> = Record<string, Reductor<S>>;

export interface OpcionesStore {
  autor?: string;
  ahora?: () => number;
  nuevoId?: () => string;
}

let contador = 0;
function idPorDefecto(): string {
  const azar = globalThis.crypto?.randomUUID?.();
  return azar ?? `op-${Date.now().toString(36)}-${(contador++).toString(36)}`;
}

/**
 * Almacén de estado basado en el registro de ops.
 * Etapa 0: se recalcula el estado completo en cada cambio. Cuando haya miles de
 * trazos se añadirán instantáneas (snapshots) sin cambiar esta interfaz.
 */
export class Store<S> {
  private registro: Op[] = [];
  private cache: S;
  private escuchas = new Set<() => void>();
  private readonly autor: string;
  private readonly ahora: () => number;
  private readonly nuevoId: () => string;

  constructor(
    private readonly inicial: () => S,
    private readonly reductores: Reductores<S>,
    opciones: OpcionesStore = {},
  ) {
    this.autor = opciones.autor ?? 'local';
    this.ahora = opciones.ahora ?? Date.now;
    this.nuevoId = opciones.nuevoId ?? idPorDefecto;
    this.cache = this.recalcular();
  }

  get estado(): S {
    return this.cache;
  }

  /** Registro completo (para guardar o transmitir). */
  get ops(): readonly Op[] {
    return this.registro;
  }

  get puedeDeshacer(): boolean {
    return opsActivas(this.registro).length > 0;
  }

  get puedeRehacer(): boolean {
    return pilaRehacer(this.registro).length > 0;
  }

  suscribir(fn: () => void): () => void {
    this.escuchas.add(fn);
    return () => this.escuchas.delete(fn);
  }

  /** Agrega una op normal. */
  emitir<P>(tipo: string, payload: P): Op<P> {
    const op = this.crearOp(tipo, payload);
    this.anexar(op);
    return op;
  }

  deshacer(): boolean {
    const activas = opsActivas(this.registro);
    const ultima = activas[activas.length - 1];
    if (!ultima) return false;
    this.anexar(this.crearOp<ObjetivoPayload>(OP_DESHACER, { objetivo: ultima.id }));
    return true;
  }

  rehacer(): boolean {
    const objetivo = pilaRehacer(this.registro).at(-1);
    if (objetivo === undefined) return false;
    this.anexar(this.crearOp<ObjetivoPayload>(OP_REHACER, { objetivo }));
    return true;
  }

  /** Reemplaza el registro (archivo abierto, snapshot recibido). */
  cargar(ops: readonly Op[]): void {
    this.registro = [...ops];
    this.refrescar();
  }

  /** Agrega una op ya construida (p. ej. recibida de la red). Ignora ids repetidos. */
  aplicarExterna(op: Op): void {
    if (this.registro.some((o) => o.id === op.id)) return;
    this.anexar(op);
  }

  private crearOp<P>(tipo: string, payload: P): Op<P> {
    return { id: this.nuevoId(), t: this.ahora(), autor: this.autor, tipo, payload };
  }

  private anexar(op: Op): void {
    this.registro.push(op);
    this.refrescar();
  }

  private refrescar(): void {
    this.cache = this.recalcular();
    this.escuchas.forEach((fn) => fn());
  }

  private recalcular(): S {
    let estado = this.inicial();
    for (const op of opsActivas(this.registro)) {
      const reductor = this.reductores[op.tipo];
      // Tipos desconocidos se ignoran: compatibilidad hacia adelante.
      if (reductor) estado = (reductor as (s: S, p: unknown, o: Op) => S)(estado, op.payload, op);
    }
    return estado;
  }
}
