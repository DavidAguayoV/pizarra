import type { Op } from '../core/ops';
import type { OpMsg, Snapshot } from './protocolo';

export interface DestinoSync {
  /** Reemplaza el registro entero. */
  cargar(ops: readonly Op[]): void;
  /** Agrega una op nueva al final. */
  aplicar(op: Op): void;
  /** Se detectó un hueco o una época nueva que no se pudo seguir: pedir el estado de nuevo. */
  pedirResync(): void;
}

/**
 * Receptor: une el snapshot y las ops incrementales en un registro coherente.
 * Tolera lo que hace una red real: ops repetidas, ops que llegan antes que el snapshot,
 * huecos y cambios de época (el profesor abrió otro proyecto).
 */
export class Sincronizador {
  private epoca = -1;
  private seq = -1;
  private listo = false;
  private pendientes: OpMsg[] = [];

  constructor(private readonly destino: DestinoSync) {}

  get ultimaSeq(): number {
    return this.seq;
  }

  alSnapshot(s: Snapshot): void {
    // Misma época y nada nuevo: ya se sigue por ops. Si el snapshot trae más (tras una
    // reconexión, cuando las ops intermedias ya se podaron), se toma completo.
    if (this.listo && s.epoca === this.epoca && s.seq <= this.seq) return;
    this.epoca = s.epoca;
    this.seq = s.seq;
    this.listo = true;
    this.destino.cargar(s.ops);
    const cola = this.pendientes.filter((m) => m.epoca === s.epoca).sort((a, b) => a.seq - b.seq);
    this.pendientes = [];
    for (const m of cola) this.alOp(m);
  }

  alOp(m: OpMsg): void {
    if (!this.listo) {
      this.pendientes.push(m);
      return;
    }
    if (m.epoca < this.epoca) return;
    if (m.epoca > this.epoca) {
      // Época nueva sin su snapshot: hay que volver a pedirlo.
      this.listo = false;
      this.pendientes = [m];
      this.destino.pedirResync();
      return;
    }
    if (m.seq <= this.seq) return; // repetida
    if (m.seq > this.seq + 1) {
      this.listo = false;
      this.pendientes = [m];
      this.destino.pedirResync();
      return;
    }
    this.destino.aplicar(m.op);
    this.seq = m.seq;
  }

  /** Olvida todo (por ejemplo al reconectar): el próximo snapshot se toma completo. */
  reiniciar(): void {
    this.listo = false;
    this.pendientes = [];
  }
}
