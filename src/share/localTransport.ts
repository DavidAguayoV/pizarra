import type { EstadoConexion, LoteVivo, OpMsg, Snapshot, VistaMsg } from './protocolo';
import type { Emisor, Receptor, Transport } from './transport';

/**
 * Transporte para desarrollo y demostración SIN cuenta: usa BroadcastChannel, así que
 * solo conecta pestañas del mismo navegador y la misma computadora. Sirve para probar
 * todo el flujo (sala, QR, espectador) sin Firebase; no sirve para clase real.
 */

type Mensaje =
  | { t: 'hola' }
  | { t: 'snapshot'; s: Snapshot }
  | { t: 'op'; m: OpMsg }
  | { t: 'vivo'; l: LoteVivo | null }
  | { t: 'vista'; v: VistaMsg }
  | { t: 'cierre' };

const nombreCanal = (codigo: string): string => `pizarra-sala-${codigo}`;
/** Cuánto se espera al emisor antes de decir que la sala no existe. */
export const ESPERA_SALA_MS = 1500;

class EmisorLocal implements Emisor {
  private readonly canal: BroadcastChannel;
  private snapshot: Snapshot = { epoca: 0, seq: 0, ops: [] };
  private vivo: LoteVivo[] = [];
  private vista: VistaMsg | null = null;
  private cerrado = false;

  constructor(readonly codigo: string) {
    this.canal = new BroadcastChannel(nombreCanal(codigo));
    this.canal.onmessage = (e: MessageEvent<Mensaje>) => {
      if (e.data.t === 'hola') this.responderHola();
    };
  }

  private responderHola(): void {
    this.enviar({ t: 'snapshot', s: this.snapshot });
    for (const l of this.vivo) this.enviar({ t: 'vivo', l });
    if (this.vista) this.enviar({ t: 'vista', v: this.vista });
  }

  private enviar(m: Mensaje): void {
    this.canal.postMessage(m);
  }

  publicarSnapshot(s: Snapshot): void {
    this.snapshot = s;
    this.enviar({ t: 'snapshot', s });
  }

  publicarOp(m: OpMsg): void {
    // Se acumula para quien llegue después: el snapshot de "hola" siempre está al día.
    if (m.epoca === this.snapshot.epoca && m.seq === this.snapshot.seq + 1) {
      this.snapshot = { epoca: m.epoca, seq: m.seq, ops: [...this.snapshot.ops, m.op] };
    }
    this.enviar({ t: 'op', m });
  }

  publicarVivo(l: LoteVivo): void {
    this.vivo.push(l);
    this.enviar({ t: 'vivo', l });
  }

  limpiarVivo(): void {
    this.vivo = [];
    this.enviar({ t: 'vivo', l: null });
  }

  publicarVista(v: VistaMsg): void {
    this.vista = v;
    this.enviar({ t: 'vista', v });
  }

  alEstado(cb: (e: EstadoConexion) => void): () => void {
    cb('conectado');
    return () => {};
  }

  cerrar(): void {
    if (this.cerrado) return;
    this.cerrado = true;
    this.enviar({ t: 'cierre' });
    this.canal.close();
  }
}

class ReceptorLocal implements Receptor {
  private readonly canal: BroadcastChannel;
  private cbSnapshot: (s: Snapshot) => void = () => {};
  private cbOp: (m: OpMsg) => void = () => {};
  private cbVivo: (l: LoteVivo | null) => void = () => {};
  private cbVista: (v: VistaMsg) => void = () => {};
  private readonly estados = new Set<(e: EstadoConexion) => void>();
  private estado: EstadoConexion = 'conectando';
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  constructor(codigo: string) {
    this.canal = new BroadcastChannel(nombreCanal(codigo));
    this.canal.onmessage = (e: MessageEvent<Mensaje>) => this.alMensaje(e.data);
  }

  iniciar(): void {
    this.resincronizar();
  }

  private alMensaje(m: Mensaje): void {
    switch (m.t) {
      case 'snapshot':
        this.poner('conectado');
        this.cbSnapshot(m.s);
        break;
      case 'op':
        this.cbOp(m.m);
        break;
      case 'vivo':
        this.cbVivo(m.l);
        break;
      case 'vista':
        this.cbVista(m.v);
        break;
      case 'cierre':
        this.poner('sin-conexion');
        break;
      case 'hola':
        break;
    }
  }

  private poner(e: EstadoConexion): void {
    if (e === this.estado) return;
    this.estado = e;
    if (this.temporizador && e !== 'conectando') {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
    this.estados.forEach((cb) => cb(e));
  }

  resincronizar(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      if (this.estado === 'conectando') this.poner('sin-sala');
    }, ESPERA_SALA_MS);
    this.canal.postMessage({ t: 'hola' } satisfies Mensaje);
  }

  alSnapshot(cb: (s: Snapshot) => void): void {
    this.cbSnapshot = cb;
  }
  alOp(cb: (m: OpMsg) => void): void {
    this.cbOp = cb;
  }
  alVivo(cb: (l: LoteVivo | null) => void): void {
    this.cbVivo = cb;
  }
  alVista(cb: (v: VistaMsg) => void): void {
    this.cbVista = cb;
  }
  alEstado(cb: (e: EstadoConexion) => void): () => void {
    this.estados.add(cb);
    cb(this.estado);
    return () => this.estados.delete(cb);
  }

  cerrar(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.canal.close();
  }
}

export class LocalTransport implements Transport {
  readonly nombre = 'local' as const;

  crearSala(codigo: string): Promise<Emisor> {
    return Promise.resolve(new EmisorLocal(codigo));
  }

  unirse(codigo: string): Promise<Receptor> {
    return Promise.resolve(new ReceptorLocal(codigo));
  }
}
