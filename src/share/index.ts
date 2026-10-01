import { CONFIG_FIREBASE, crearBdFirebase } from './firebaseBd';
import { FirebaseTransport } from './firebaseTransport';
import { LocalTransport } from './localTransport';
import type { Transport } from './transport';

/**
 * Transporte por defecto: Firebase si hay configuración; si no, el local de demostración.
 * (`?transporte=local` fuerza el local, útil para probar sin tocar la nube.)
 */
export function elegirTransport(consulta: string = typeof location === 'undefined' ? '' : location.search): Transport {
  const forzarLocal = new URLSearchParams(consulta).get('transporte') === 'local';
  if (CONFIG_FIREBASE && !forzarLocal) {
    const config = CONFIG_FIREBASE;
    let bd: ReturnType<typeof crearBdFirebase> | null = null;
    return new FirebaseTransport(() => (bd ??= crearBdFirebase(config)));
  }
  return new LocalTransport();
}

/** Enlace que abre la pizarra como espectador de una sala. */
export function enlaceSala(codigo: string, base: string = location.href): string {
  const u = new URL(base);
  u.search = '';
  u.hash = '';
  u.searchParams.set('sala', codigo);
  return u.toString();
}
