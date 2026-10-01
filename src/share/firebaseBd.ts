import type { BD } from './bd';

/**
 * Configuración WEB de Firebase. No es secreta (va en el código de la página); lo que protege
 * los datos son las reglas de la base (ver docs/FIREBASE.md). Mientras sea `null` la pizarra
 * funciona en modo demostración local (solo entre pestañas del mismo navegador).
 */
export interface ConfigFirebase {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  appId: string;
}

export const CONFIG_FIREBASE: ConfigFirebase | null = null;

/**
 * Conecta con Realtime Database mediante el SDK oficial, con inicio de sesión anónimo.
 * El SDK se descarga recién aquí (import dinámico): quien solo dibuja no lo carga.
 */
export async function crearBdFirebase(config: ConfigFirebase): Promise<BD> {
  const [{ initializeApp }, { getAuth, signInAnonymously }, db] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/database'),
  ]);
  const app = initializeApp(config);
  const auth = getAuth(app);
  const cred = await signInAnonymously(auth);
  const base = db.getDatabase(app);
  const ref = (ruta: string) => db.ref(base, ruta);

  return {
    uid: () => cred.user.uid,
    existe: async (ruta) => (await db.get(ref(ruta))).exists(),
    leer: async (ruta) => (await db.get(ref(ruta))).val() as unknown,
    poner: (ruta, valor) => db.set(ref(ruta), valor),
    quitar: (ruta) => db.remove(ref(ruta)),
    alValor: (ruta, cb) => db.onValue(ref(ruta), (s) => cb(s.val() as unknown)),
    alHijoAgregado: (ruta, cb) => db.onChildAdded(ref(ruta), (s) => cb(s.key ?? '', s.val() as unknown)),
    alHijoQuitado: (ruta, cb) => db.onChildRemoved(ref(ruta), (s) => cb(s.key ?? '')),
    alConectado: (cb) => db.onValue(ref('.info/connected'), (s) => cb(s.val() === true)),
  };
}
