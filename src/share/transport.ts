import type { EstadoConexion, LoteVivo, OpMsg, Snapshot, VistaMsg } from './protocolo';

/** Lado del profesor: publica. Una sala tiene un solo emisor. */
export interface Emisor {
  readonly codigo: string;
  /** Reemplaza el estado de la sala (y empieza una época nueva si cambia `epoca`). */
  publicarSnapshot(s: Snapshot): void;
  publicarOp(m: OpMsg): void;
  publicarVivo(l: LoteVivo): void;
  limpiarVivo(): void;
  publicarVista(v: VistaMsg): void;
  alEstado(cb: (e: EstadoConexion) => void): () => void;
  cerrar(): void;
}

/** Lado del estudiante: escucha. */
export interface Receptor {
  alSnapshot(cb: (s: Snapshot) => void): void;
  alOp(cb: (m: OpMsg) => void): void;
  /** `null` = ya no hay trazo en construcción. */
  alVivo(cb: (l: LoteVivo | null) => void): void;
  alVista(cb: (v: VistaMsg) => void): void;
  alEstado(cb: (e: EstadoConexion) => void): () => void;
  /** Empieza a recibir. Se llama DESPUÉS de registrar los callbacks, para no perder nada. */
  iniciar(): void;
  /** Vuelve a pedir el estado completo (tras un hueco o una reconexión). */
  resincronizar(): void;
  cerrar(): void;
}

/** Implementación intercambiable del canal: Firebase en producción, BroadcastChannel para probar. */
export interface Transport {
  readonly nombre: 'firebase' | 'local';
  /** Crea la sala; falla con Error si el código ya está en uso. */
  crearSala(codigo: string): Promise<Emisor>;
  unirse(codigo: string): Promise<Receptor>;
}
