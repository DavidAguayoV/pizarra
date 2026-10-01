import type { BD } from './bd';
import { claveSeq } from './protocolo';
import type { EstadoConexion, LoteVivo, OpMsg, Snapshot, VistaMsg } from './protocolo';
import type { Emisor, Receptor, Transport } from './transport';

/**
 * Transporte de producción sobre Realtime Database (ver docs/PROTOCOLO_COMPARTIR.md y
 * docs/FIREBASE.md). Estructura de una sala:
 *
 *   rooms/{código}/meta      { owner, creado }          (solo el dueño escribe)
 *   rooms/{código}/snapshot  { epoca, seq, datos }      datos = JSON del registro de ops
 *   rooms/{código}/ops/{seq} texto JSON de un OpMsg     se vacía en cada snapshot
 *   rooms/{código}/vivo/{n}  texto JSON de un LoteVivo  se borra al terminar el trazo
 *   rooms/{código}/vista     { cx, cy, escala, ancho, alto }
 *
 * Todo lo que tiene estructura libre viaja como TEXTO JSON: Realtime Database descarta
 * arrays vacíos, convierte claves numéricas en arrays y prohíbe ciertos caracteres en claves;
 * como texto nada de eso puede pasar.
 */

const raiz = (codigo: string): string => `rooms/${codigo}`;

function analizar<T>(v: unknown): T | null {
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

class EmisorFirebase implements Emisor {
  private cola: Promise<void> = Promise.resolve();
  private nVivo = 0;
  private readonly base: string;

  constructor(
    private readonly bd: BD,
    readonly codigo: string,
  ) {
    this.base = raiz(codigo);
  }

  /** Las escrituras salen en el orden en que se piden: un snapshot nunca adelanta a una op. */
  private encolar(tarea: () => Promise<void>): void {
    this.cola = this.cola.then(tarea).catch((e: unknown) => console.warn('Pizarra: no se pudo publicar', e));
  }

  publicarSnapshot(s: Snapshot): void {
    this.encolar(async () => {
      await this.bd.poner(`${this.base}/snapshot`, { epoca: s.epoca, seq: s.seq, datos: JSON.stringify(s.ops) });
      await this.bd.quitar(`${this.base}/ops`);
    });
  }

  publicarOp(m: OpMsg): void {
    this.encolar(() => this.bd.poner(`${this.base}/ops/${claveSeq(m.seq)}`, JSON.stringify(m)));
  }

  publicarVivo(l: LoteVivo): void {
    const n = ++this.nVivo;
    this.encolar(() => this.bd.poner(`${this.base}/vivo/${claveSeq(n)}`, JSON.stringify(l)));
  }

  limpiarVivo(): void {
    this.nVivo = 0;
    this.encolar(() => this.bd.quitar(`${this.base}/vivo`));
  }

  publicarVista(v: VistaMsg): void {
    this.encolar(() => this.bd.poner(`${this.base}/vista`, { ...v }));
  }

  alEstado(cb: (e: EstadoConexion) => void): () => void {
    return this.bd.alConectado((c) => cb(c ? 'conectado' : 'reconectando'));
  }

  cerrar(): void {
    this.encolar(() => this.bd.quitar(this.base));
  }
}

class ReceptorFirebase implements Receptor {
  private cbSnapshot: (s: Snapshot) => void = () => {};
  private cbOp: (m: OpMsg) => void = () => {};
  private cbVivo: (l: LoteVivo | null) => void = () => {};
  private cbVista: (v: VistaMsg) => void = () => {};
  private readonly estados = new Set<(e: EstadoConexion) => void>();
  private estado: EstadoConexion = 'conectando';
  private flujos: Array<() => void> = [];
  private fijos: Array<() => void> = [];
  private epocaLeida = -1;
  private huboCaida = false;
  private cerrado = false;
  private generacion = 0;
  private readonly base: string;

  constructor(
    private readonly bd: BD,
    codigo: string,
  ) {
    this.base = raiz(codigo);
  }

  iniciar(): void {
    this.fijos.push(
      this.bd.alConectado((c) => {
        if (!c) {
          this.huboCaida = true;
          this.poner('reconectando');
        } else if (this.huboCaida) {
          this.huboCaida = false;
          this.resincronizar(); // al volver la red, estado completo de nuevo (las ops repetidas se ignoran)
        }
      }),
      this.bd.alValor(`${this.base}/meta`, (v) => {
        if (v === null && this.estado !== 'conectando') this.poner('sin-sala'); // el profesor cerró la sala
      }),
    );
    void this.arrancar();
  }

  private poner(e: EstadoConexion): void {
    if (e === this.estado) return;
    this.estado = e;
    this.estados.forEach((cb) => cb(e));
  }

  private async arrancar(): Promise<void> {
    const gen = ++this.generacion;
    this.flujos.forEach((f) => f());
    this.flujos = [];
    this.epocaLeida = -1;

    if (!(await this.bd.existe(`${this.base}/meta`))) {
      if (gen === this.generacion && !this.cerrado) this.poner('sin-sala');
      return;
    }
    if (gen !== this.generacion || this.cerrado) return;

    const s = await this.bd.leer(`${this.base}/snapshot`);
    if (gen !== this.generacion || this.cerrado) return;
    this.alSnapshotCrudo(s);
    this.poner('conectado');

    this.flujos.push(
      // Solo se escucha la época (un número): el snapshot completo se baja cuando cambia,
      // no cada vez que el profesor lo actualiza (ahorra ancho de banda con muchos estudiantes).
      this.bd.alValor(`${this.base}/snapshot/epoca`, (e) => {
        if (typeof e !== 'number' || e === this.epocaLeida) return;
        const gen = this.generacion;
        void this.bd.leer(`${this.base}/snapshot`).then((v) => {
          if (gen === this.generacion && !this.cerrado) this.alSnapshotCrudo(v);
        });
      }),
      this.bd.alHijoAgregado(`${this.base}/ops`, (_k, v) => {
        const m = analizar<OpMsg>(v);
        if (m) this.cbOp(m);
      }),
      this.bd.alHijoAgregado(`${this.base}/vivo`, (_k, v) => {
        const l = analizar<LoteVivo>(v);
        if (l) this.cbVivo(l);
      }),
      this.bd.alHijoQuitado(`${this.base}/vivo`, () => this.cbVivo(null)),
      this.bd.alValor(`${this.base}/vista`, (v) => {
        if (v && typeof v === 'object') this.cbVista(v as VistaMsg);
      }),
    );
  }

  private alSnapshotCrudo(v: unknown): void {
    if (!v || typeof v !== 'object') return;
    const o = v as { epoca?: unknown; seq?: unknown; datos?: unknown };
    if (typeof o.epoca !== 'number' || typeof o.seq !== 'number') return;
    if (o.epoca === this.epocaLeida) return; // misma época: ya se sigue por ops, no se vuelve a leer todo
    const ops = analizar<Snapshot['ops']>(o.datos);
    if (!ops) return;
    this.epocaLeida = o.epoca;
    this.cbSnapshot({ epoca: o.epoca, seq: o.seq, ops });
  }

  resincronizar(): void {
    void this.arrancar();
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
    this.cerrado = true;
    this.flujos.forEach((f) => f());
    this.fijos.forEach((f) => f());
    this.flujos = [];
    this.fijos = [];
  }
}

export class FirebaseTransport implements Transport {
  readonly nombre = 'firebase' as const;

  /** `obtenerBd` se llama al primer uso (así el SDK solo se descarga si se comparte). */
  constructor(private readonly obtenerBd: () => Promise<BD>) {}

  async crearSala(codigo: string): Promise<Emisor> {
    const bd = await this.obtenerBd();
    if (await bd.existe(`${raiz(codigo)}/meta`)) throw new Error('Ese código de sala ya está en uso. Intenta de nuevo.');
    await bd.poner(`${raiz(codigo)}/meta`, { owner: bd.uid(), creado: Date.now() });
    return new EmisorFirebase(bd, codigo);
  }

  async unirse(codigo: string): Promise<Receptor> {
    const bd = await this.obtenerBd();
    return new ReceptorFirebase(bd, codigo);
  }
}
