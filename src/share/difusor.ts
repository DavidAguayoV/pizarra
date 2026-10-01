import type { Elemento } from '../core/elementos';
import type { Op } from '../core/ops';
import { PERIODO_LOTE_MS, PERIODO_VISTA_MS, SNAPSHOT_CADA } from './protocolo';
import type { VistaMsg } from './protocolo';
import type { Emisor } from './transport';
import { ProductorVivo } from './vivo';

/** Lo que el difusor necesita de la pizarra del profesor. */
export interface FuenteOps {
  readonly ops: readonly Op[];
  suscribir(fn: () => void): () => void;
}

/**
 * Lado del profesor: mira el registro de ops y lo publica en la sala.
 * - Cada op nueva sale como mensaje incremental; cada `SNAPSHOT_CADA` también un snapshot.
 * - Si el registro se reemplaza (se abrió otro proyecto) empieza una época nueva.
 * - El trazo en construcción y el encuadre salen por lotes, no en cada movimiento.
 */
export class Difusor {
  private epoca = 0;
  private enviados = 0;
  private ultimoId: string | null = null;
  private readonly baja: () => void;
  private readonly productor = new ProductorVivo();

  private vivoPendiente: { el: Elemento | null; ocultos: ReadonlySet<string> } | null = null;
  private temporizadorVivo: ReturnType<typeof setTimeout> | null = null;
  private ultimoEnvioVivo = -Infinity;
  private hayVivoEnSala = false;

  private vistaPendiente: VistaMsg | null = null;
  private temporizadorVista: ReturnType<typeof setTimeout> | null = null;
  private ultimaVista: VistaMsg | null = null;

  constructor(
    private readonly emisor: Emisor,
    private readonly fuente: FuenteOps,
    private readonly ahora: () => number = () => Date.now(),
  ) {
    this.publicarTodo();
    this.baja = fuente.suscribir(() => this.alCambiar());
  }

  /** Publica el estado completo como época nueva (sala recién creada o registro reemplazado). */
  private publicarTodo(): void {
    this.epoca++;
    const ops = [...this.fuente.ops];
    this.enviados = ops.length;
    this.ultimoId = ops.at(-1)?.id ?? null;
    this.emisor.publicarSnapshot({ epoca: this.epoca, seq: ops.length, ops });
  }

  private alCambiar(): void {
    const ops = this.fuente.ops;
    const coherente =
      ops.length >= this.enviados && (this.enviados === 0 || ops[this.enviados - 1]?.id === this.ultimoId);
    if (!coherente) {
      this.productor.reiniciar();
      this.publicarTodo();
      return;
    }
    for (let i = this.enviados; i < ops.length; i++) {
      this.emisor.publicarOp({ epoca: this.epoca, seq: i + 1, op: ops[i]! });
    }
    this.enviados = ops.length;
    this.ultimoId = ops.at(-1)?.id ?? null;
    if (ops.length > 0 && ops.length % SNAPSHOT_CADA === 0) {
      this.emisor.publicarSnapshot({ epoca: this.epoca, seq: ops.length, ops: [...ops] });
    }
  }

  /** El elemento en construcción cambió (null = ya no hay). Se agrupa en lotes. */
  vivo(el: Elemento | null, ocultos: ReadonlySet<string>): void {
    if (!el && ocultos.size === 0) {
      this.cancelarTemporizador();
      this.vivoPendiente = null;
      this.productor.reiniciar();
      if (this.hayVivoEnSala) {
        this.hayVivoEnSala = false;
        this.emisor.limpiarVivo();
      }
      return;
    }
    this.vivoPendiente = { el, ocultos: new Set(ocultos) };
    const espera = this.ultimoEnvioVivo + PERIODO_LOTE_MS - this.ahora();
    if (espera <= 0) this.enviarVivo();
    else if (!this.temporizadorVivo) this.temporizadorVivo = setTimeout(() => this.enviarVivo(), espera);
  }

  private enviarVivo(): void {
    this.cancelarTemporizador();
    const p = this.vivoPendiente;
    if (!p) return;
    this.vivoPendiente = null;
    this.ultimoEnvioVivo = this.ahora();
    this.hayVivoEnSala = true;
    this.emisor.publicarVivo(this.productor.lote(p.el, p.ocultos));
  }

  private cancelarTemporizador(): void {
    if (this.temporizadorVivo) clearTimeout(this.temporizadorVivo);
    this.temporizadorVivo = null;
  }

  /** Encuadre actual del profesor; solo se publica si cambió y como mucho cada `PERIODO_VISTA_MS`. */
  vista(v: VistaMsg): void {
    const u = this.ultimaVista;
    if (u && u.cx === v.cx && u.cy === v.cy && u.escala === v.escala && u.ancho === v.ancho && u.alto === v.alto) return;
    this.vistaPendiente = v;
    if (!this.temporizadorVista) {
      this.temporizadorVista = setTimeout(() => {
        this.temporizadorVista = null;
        if (this.vistaPendiente) {
          this.ultimaVista = this.vistaPendiente;
          this.emisor.publicarVista(this.vistaPendiente);
          this.vistaPendiente = null;
        }
      }, PERIODO_VISTA_MS);
    }
  }

  detener(): void {
    this.baja();
    this.cancelarTemporizador();
    if (this.temporizadorVista) clearTimeout(this.temporizadorVista);
    this.temporizadorVista = null;
    this.emisor.cerrar();
  }
}
