/**
 * Lo mínimo que `FirebaseTransport` necesita de una base de datos en tiempo real.
 * Hay dos implementaciones: `bdFirebase` (la real, con el SDK) y `BdMemoria` (para pruebas).
 * Las rutas son como en Realtime Database: `rooms/ABCDE/ops`.
 */
export interface BD {
  /** Identificador anónimo de esta sesión (dueño de la sala). */
  uid(): string;
  existe(ruta: string): Promise<boolean>;
  leer(ruta: string): Promise<unknown>;
  poner(ruta: string, valor: unknown): Promise<void>;
  quitar(ruta: string): Promise<void>;
  /** Valor del nodo ahora y en cada cambio (`null` si no existe). */
  alValor(ruta: string, cb: (v: unknown) => void): () => void;
  /** Hijos existentes y nuevos, en orden de clave. */
  alHijoAgregado(ruta: string, cb: (clave: string, v: unknown) => void): () => void;
  alHijoQuitado(ruta: string, cb: (clave: string) => void): () => void;
  /** `true` cuando hay conexión con el servidor. */
  alConectado(cb: (conectado: boolean) => void): () => void;
}

/** Base en memoria: sirve de "servidor" en las pruebas. Varios clientes pueden compartirla. */
export class BdMemoria {
  private datos = new Map<string, unknown>();
  private oyentes = new Set<() => void>();
  conectado = true;
  private estados = new Set<(c: boolean) => void>();

  cliente(uid: string): BD {
    return new ClienteMemoria(this, uid);
  }

  /** @internal */
  get(ruta: string): unknown {
    return this.datos.get(ruta) ?? null;
  }

  /** @internal */
  hijos(ruta: string): Array<[string, unknown]> {
    const pref = ruta + '/';
    const claves = new Set<string>();
    for (const k of this.datos.keys()) if (k.startsWith(pref)) claves.add(k.slice(pref.length).split('/')[0]!);
    return [...claves].sort().map((c) => [c, this.valorDe(pref + c)]);
  }

  /** @internal */
  valorDe(ruta: string): unknown {
    if (this.datos.has(ruta)) return this.datos.get(ruta);
    // Un objeto guardado en un ancestro también contiene esta ruta (como en Realtime Database).
    const trozos = ruta.split('/');
    for (let i = trozos.length - 1; i > 0; i--) {
      const ancestro = this.datos.get(trozos.slice(0, i).join('/'));
      if (ancestro && typeof ancestro === 'object') {
        let v: unknown = ancestro;
        for (const t of trozos.slice(i)) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[t] : undefined;
        return v ?? null;
      }
    }
    const hijos = this.hijos(ruta);
    return hijos.length ? Object.fromEntries(hijos) : null;
  }

  /** @internal */
  escribir(ruta: string, valor: unknown): void {
    if (valor === null) this.borrarBajo(ruta);
    else this.datos.set(ruta, valor);
    this.avisar();
  }

  private borrarBajo(ruta: string): void {
    for (const k of [...this.datos.keys()]) if (k === ruta || k.startsWith(ruta + '/')) this.datos.delete(k);
  }

  /** @internal */
  suscribir(fn: () => void): () => void {
    this.oyentes.add(fn);
    return () => this.oyentes.delete(fn);
  }

  private avisar(): void {
    // Las notificaciones son asíncronas, como en una red real.
    queueMicrotask(() => this.oyentes.forEach((f) => f()));
  }

  /** Simula caída y vuelta de la conexión. */
  ponerConectado(c: boolean): void {
    this.conectado = c;
    this.estados.forEach((f) => f(c));
  }

  /** @internal */
  alConectado(cb: (c: boolean) => void): () => void {
    this.estados.add(cb);
    queueMicrotask(() => cb(this.conectado));
    return () => this.estados.delete(cb);
  }
}

class ClienteMemoria implements BD {
  constructor(
    private readonly bd: BdMemoria,
    private readonly id: string,
  ) {}

  uid(): string {
    return this.id;
  }
  existe(ruta: string): Promise<boolean> {
    return Promise.resolve(this.bd.valorDe(ruta) !== null);
  }
  leer(ruta: string): Promise<unknown> {
    return Promise.resolve(this.bd.valorDe(ruta));
  }
  poner(ruta: string, valor: unknown): Promise<void> {
    this.bd.escribir(ruta, valor);
    return Promise.resolve();
  }
  quitar(ruta: string): Promise<void> {
    this.bd.escribir(ruta, null);
    return Promise.resolve();
  }
  alValor(ruta: string, cb: (v: unknown) => void): () => void {
    let ultimo: string | undefined;
    const revisar = (): void => {
      const v = this.bd.valorDe(ruta);
      const s = JSON.stringify(v);
      if (s !== ultimo) {
        ultimo = s;
        cb(v);
      }
    };
    queueMicrotask(revisar);
    return this.bd.suscribir(revisar);
  }
  alHijoAgregado(ruta: string, cb: (clave: string, v: unknown) => void): () => void {
    const vistos = new Set<string>();
    const revisar = (): void => {
      for (const [k, v] of this.bd.hijos(ruta)) {
        if (!vistos.has(k)) {
          vistos.add(k);
          cb(k, v);
        }
      }
      for (const k of [...vistos]) if (this.bd.get(`${ruta}/${k}`) === null) vistos.delete(k);
    };
    queueMicrotask(revisar);
    return this.bd.suscribir(revisar);
  }
  alHijoQuitado(ruta: string, cb: (clave: string) => void): () => void {
    let previos = new Set(this.bd.hijos(ruta).map(([k]) => k));
    return this.bd.suscribir(() => {
      const ahora = new Set(this.bd.hijos(ruta).map(([k]) => k));
      for (const k of previos) if (!ahora.has(k)) cb(k);
      previos = ahora;
    });
  }
  alConectado(cb: (c: boolean) => void): () => void {
    return this.bd.alConectado(cb);
  }
}
