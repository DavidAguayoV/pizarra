import type { Punto } from '../core/camara';
import type { Bloque, Cuerda, Elemento, Esfera, Paso, Polea, Union } from '../core/elementos';
import { distanciaAlCuerpo, TOLERANCIA_CONTACTO } from '../physics/dcl';
import { apoyarEn, MASA_POR_DEFECTO, superficieCercana } from '../physics/objetos';
import type { CuerpoG } from './lector';
import { leerGrafo } from './lector';
import { posPuerto, puertosDe } from './puertos';
import { resolverEscena } from './resolver';
import { sentidoNatural } from './ruta';

/**
 * Conexión (Nivel 2, Fase 2): imanes con retroalimentación visual.
 *
 *   - **Imán** (`iman`): al arrastrar el extremo de una cuerda o un resorte, se pega al puerto más cercano dentro de
 *     un radio fijo **en pantalla** (`IMAN_PX`, igual con cualquier zoom y con el dedo): un puerto con nombre de un
 *     cuerpo (o el más cercano, si el punto cae dentro del cuerpo), el eje de una polea o un punto de una superficie
 *     (techo, pared). Sin imán, el extremo queda **fijo** en el espacio (y se marca con un triángulo).
 *   - **Paso por poleas**: la cuerda se arma en **un solo gesto**; al pasar el puntero sobre una polea (o el extremo de
 *     una superficie, como el borde de una mesa) la envuelve por el lado por donde se pasó (`regionDePaso`).
 *   - **Dos piezas**: si una cuerda termina en una polea y después se dibuja otra desde esa polea, se funden en una que
 *     la envuelve (el modo de la Fase 1, que sigue sirviendo).
 *   - **Alinear**: un cuerpo que cuelga de una polea se corre para que su tramo quede **vertical** (si no, oscilaría
 *     como un péndulo, que no es lo que se quiere al dibujar una máquina de Atwood).
 *   - Una polea soltada sobre un cuerpo queda **montada** en él (polea móvil).
 *   - Un cuerpo soltado a menos de 30 cm de una superficie se apoya en ella; los cuerpos nuevos se numeran solos.
 */

/** Radio del imán, en píxeles de pantalla. */
export const IMAN_PX = 24;
/** Margen alrededor de una polea (o de un borde) para que el gesto la envuelva, en píxeles de pantalla. */
export const PASO_PX = 14;
/** Hasta qué inclinación (respecto de la vertical) se corrige sola un tramo que cuelga de una polea. */
export const ALINEAR_MAX = (25 * Math.PI) / 180;

const RADIO_EXTRA_POLEA = 0.14;
const TOL_VECTOR = TOLERANCIA_CONTACTO + 0.06;

type CuerpoC = Bloque | Esfera;

export interface Cambio {
  agregar?: Elemento[];
  actualizar?: Elemento[];
  borrar?: string[];
}

const esCuerpo = (e: Elemento): e is CuerpoC => e.tipo === 'bloque' || e.tipo === 'esfera';
const r4 = (n: number): number => Math.round(n * 1e4) / 1e4;

function distSegmento(p: Punto, a: Punto, b: Punto): { d: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return { d: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t };
}

export interface Iman {
  p: Punto;
  union: Union;
  el: string;
}

/**
 * El imán más cercano a `p` dentro de `radio` (m): puerto con nombre de un cuerpo (o el más cercano de un cuerpo que
 * contiene a `p`), eje de una polea, o punto de una superficie. Los cuerpos ganan los empates.
 */
export function iman(p: Punto, escena: readonly Elemento[], radio: number, excluir: ReadonlySet<string> = new Set()): Iman | null {
  let mejor: Iman | null = null;
  let d = Infinity;
  const proponer = (q: Punto, el: string, puerto: string, dq: number, alcance = radio): void => {
    if (dq <= alcance && dq < d - 1e-12) {
      d = dq;
      mejor = { p: { x: r4(q.x), y: r4(q.y) }, union: { el, puerto }, el };
    }
  };
  for (const e of escena) {
    if (excluir.has(e.id)) continue;
    if (esCuerpo(e)) {
      const dentro = distanciaAlCuerpo(e, p) === 0;
      // Dentro del cuerpo, su puerto más cercano gana siempre (aunque esté a más del radio).
      for (const q of puertosDe(e)) proponer(q.p, e.id, q.nombre, Math.hypot(q.p.x - p.x, q.p.y - p.y) * (dentro ? 1e-3 : 1), dentro ? Infinity : radio);
    } else if (e.tipo === 'polea') {
      proponer(e.centro, e.id, 'eje', Math.hypot(e.centro.x - p.x, e.centro.y - p.y) + 1e-9);
    } else if (e.tipo === 'superficie') {
      const { d: ds, t } = distSegmento(p, e.a, e.b);
      const u = r4(t);
      // Una superficie atrae con la mitad del radio: hay que apuntarle (si no, un resorte dibujado a ras del piso
      // se pegaría al piso).
      proponer({ x: e.a.x + (e.b.x - e.a.x) * u, y: e.a.y + (e.b.y - e.a.y) * u }, e.id, `u:${u}`, ds + 2e-9, radio / 2);
    }
  }
  return mejor;
}

/** Une un extremo en `p` al imán más cercano dentro de `radio`, o lo deja fijo en el espacio. */
export function unirExtremo(p: Punto, escena: readonly Elemento[], excluir: ReadonlySet<string> = new Set(), radio = TOLERANCIA_CONTACTO): { union: Union; p: Punto } {
  const m = iman(p, escena, radio, excluir);
  return m ? { union: m.union, p: m.p } : { union: { fijo: true }, p };
}

/** Región en que el gesto de una cuerda envuelve algo: una polea (con margen) o el extremo de una superficie. */
export interface RegionPaso {
  el: string;
  c: Punto;
  r: number;
  extremo?: 'a' | 'b';
}

export function regionDePaso(p: Punto, escena: readonly Elemento[], margen: number): RegionPaso | null {
  for (const e of escena) {
    if (e.tipo === 'polea' && Math.hypot(p.x - e.centro.x, p.y - e.centro.y) <= e.radio + margen) return { el: e.id, c: e.centro, r: e.radio };
  }
  for (const e of escena) {
    if (e.tipo !== 'superficie') continue;
    for (const k of ['a', 'b'] as const) {
      const q = e[k];
      if (Math.hypot(p.x - q.x, p.y - q.y) <= margen) return { el: e.id, c: q, r: 0, extremo: k };
    }
  }
  return null;
}

/** El paso que corresponde a salir de una región: la cuerda la envuelve según el lado por donde pasó el gesto. */
export function pasoAlSalir(region: RegionPaso, entrada: Punto, salida: Punto): Paso {
  const sentido = sentidoNatural(entrada, region.c, salida);
  return region.extremo ? { el: region.el, sentido, extremo: region.extremo } : { el: region.el, sentido };
}

/** El cuerpo con su `apoyo` según la superficie que tenga cerca (y apoyado sobre ella). */
export function apoyar<T extends CuerpoC>(c: T, escena: readonly Elemento[]): T {
  const s = superficieCercana(c, escena.filter((x) => x.id !== c.id));
  return s ? { ...apoyarEn(c, s), apoyo: [s.id] } : { ...c, apoyo: [] };
}

/** Una polea soltada sobre un cuerpo queda montada encima de él (polea móvil); si no, queda fija. */
export function montar(p: Polea, escena: readonly Elemento[]): Polea {
  const sobre = escena.find((e): e is CuerpoC => esCuerpo(e) && e.id !== p.montaje?.el && distanciaAlCuerpo(e, p.centro) <= p.radio * 0.6);
  const actual = p.montaje ? escena.find((e) => e.id === p.montaje!.el) : undefined;
  const cuerpo = sobre ?? (actual && esCuerpo(actual) && distanciaAlCuerpo(actual, p.centro) <= p.radio * 1.2 ? actual : undefined);
  if (!cuerpo) {
    if (!p.montaje) return p;
    const { montaje: _, ...resto } = p;
    void _;
    return resto;
  }
  // El eje queda sobre la cara superior (o sobre la esfera), separado lo justo para que se vea la horquilla.
  const alto = cuerpo.tipo === 'bloque' ? cuerpo.alto / 2 : cuerpo.radio;
  const ly = r4(alto + p.radio + 0.08);
  const angulo = cuerpo.tipo === 'bloque' ? cuerpo.angulo : 0;
  const centro = { x: r4(cuerpo.centro.x - ly * Math.sin(angulo)), y: r4(cuerpo.centro.y + ly * Math.cos(angulo)) };
  return { ...p, centro, montaje: { el: cuerpo.id, puerto: `local:0,${ly}` } };
}

function poleaCerca(p: Punto, escena: readonly Elemento[]): Polea | null {
  let mejor: Polea | null = null;
  let d = Infinity;
  for (const e of escena) {
    if (e.tipo !== 'polea') continue;
    const de = Math.hypot(p.x - e.centro.x, p.y - e.centro.y);
    if (de <= e.radio + RADIO_EXTRA_POLEA && de < d) {
      d = de;
      mejor = e;
    }
  }
  return mejor;
}

/** ¿El extremo `k` de la cuerda espera la otra mitad en una polea? (fijo junto a ella, o unido a su eje) */
function esperaEnPolea(c: Cuerda, k: 0 | 1, pol: Polea): boolean {
  const u = c.union?.[k];
  const q = k === 0 ? c.a : c.b;
  const fijoAhi = !!u && 'fijo' in u && Math.hypot(q.x - pol.centro.x, q.y - pol.centro.y) <= pol.radio + RADIO_EXTRA_POLEA;
  return fijoAhi || (!!u && 'el' in u && u.el === pol.id);
}

/** Una cuerda sin ruta que termina en la polea (esperando la otra mitad), y cuál de sus extremos es. */
function mitadEnPolea(pol: Polea, escena: readonly Elemento[], excluir: string): { c: Cuerda; k: 0 | 1 } | null {
  for (const e of escena) {
    if (e.tipo !== 'cuerda' || e.id === excluir || (e.ruta?.length ?? 0) > 0 || !e.union) continue;
    for (const k of [0, 1] as const) if (esperaEnPolea(e, k, pol)) return { c: e, k };
  }
  return null;
}

/**
 * Un cuerpo nuevo con la etiqueta y la masa por defecto se numera: m₁ = 2 kg, m₂ = 3 kg, m₃ = 4 kg… Así dos bloques
 * recién puestos ya forman un Atwood que se mueve (con masas iguales no pasaría nada).
 */
export function numerar<T extends CuerpoC>(c: T, escena: readonly Elemento[]): T {
  if (c.etiqueta !== 'm' || c.masa !== MASA_POR_DEFECTO) return c;
  let n = 0;
  for (const e of escena) {
    if (!esCuerpo(e)) continue;
    const m = /^m_\{?(\d+)\}?$/.exec(e.etiqueta.trim());
    n = Math.max(n, m ? Number(m[1]) : 0, e.etiqueta.trim() === 'm' ? 1 : 0);
  }
  n += 1;
  return { ...c, etiqueta: n < 10 ? `m_${n}` : `m_{${n}}`, masa: MASA_POR_DEFECTO + n - 1 };
}

/**
 * Tramo de una cuerda con poleas que llega a un cuerpo que cuelga (sin apoyo): ángulo respecto de la vertical y
 * corrimiento horizontal que lo deja vertical. null si no aplica (el cuerpo se apoya, o el tramo no viene de arriba).
 */
export function tramoColgante(g: ReturnType<typeof leerGrafo>, cuerdaId: string, k: 0 | 1): { cuerpo: CuerpoG; angulo: number; dx: number } | null {
  const c = g.cuerdas.find((x) => x.el.id === cuerdaId);
  if (!c || c.pasos.length === 0) return null;
  const ext = c.ext[k];
  if (ext.k !== 'cuerpo' || (ext.cuerpo.apoyo?.length ?? 0) > 0) return null;
  const t = c.hacia[k];
  if (t.y <= ext.p.y + 1e-6) return null;
  return { cuerpo: ext.cuerpo, angulo: Math.atan2(Math.abs(t.x - ext.p.x), t.y - ext.p.y), dx: t.x - ext.p.x };
}

/**
 * Corre horizontalmente los cuerpos que cuelgan de la cuerda (a través de una polea) para que su tramo quede vertical.
 * Solo corrige inclinaciones menores que `max` (una mayor es intencional). Devuelve los cuerpos movidos.
 */
export function alinearColgantes(cuerdaId: string, escena: readonly Elemento[], max = ALINEAR_MAX): CuerpoC[] {
  let actual = [...escena];
  const movidos = new Map<string, CuerpoC>();
  for (const k of [0, 1] as const) {
    for (let vuelta = 0; vuelta < 4; vuelta++) {
      const t = tramoColgante(leerGrafo(actual), cuerdaId, k);
      if (!t || t.angulo < 1e-4 || t.angulo > max) break;
      const c = { ...t.cuerpo, centro: { x: r4(t.cuerpo.centro.x + t.dx), y: t.cuerpo.centro.y } };
      movidos.set(c.id, c);
      actual = actual.map((e) => (e.id === c.id ? c : e));
    }
  }
  return [...movidos.values()];
}

/** Uniones de un elemento recién dibujado. Puede fundirlo con otra cuerda (y entonces no se agrega). */
export function conectarNuevo(e: Elemento, escena: readonly Elemento[], radio = TOLERANCIA_CONTACTO): Cambio {
  const resuelta = resolverEscena(escena);
  if (esCuerpo(e)) return { agregar: [apoyar(numerar(e, escena), escena)] };
  if (e.tipo === 'polea') return { agregar: [montar(e, resuelta)] };
  if (e.tipo === 'vector') {
    if (e.fantasma || (e.rol !== 'aplicada' && e.rol !== 'tension')) return { agregar: [e] };
    const c = escena.find((x): x is CuerpoC => esCuerpo(x) && distanciaAlCuerpo(x, e.a) <= TOL_VECTOR);
    return { agregar: [{ ...e, cuerpo: c?.id ?? null }] };
  }
  if (e.tipo === 'resorte') {
    if (e.union) return { agregar: [e] };
    const a = unirExtremo(e.a, resuelta, new Set(), radio);
    const b = unirExtremo(e.b, resuelta, new Set(), radio);
    return { agregar: [{ ...e, a: a.p, b: b.p, union: [a.union, b.union] }] };
  }
  if (e.tipo === 'cuerda') {
    let nueva: Cuerda = e;
    if (!nueva.union) {
      const a = unirExtremo(e.a, resuelta, new Set(), radio);
      const b = unirExtremo(e.b, resuelta, new Set(), radio);
      nueva = { ...e, a: a.p, b: b.p, union: [a.union, b.union] };
    }
    // ¿Termina en una polea donde ya espera otra cuerda? Se funden en una que la envuelve.
    let resultado: Cambio = { agregar: [nueva] };
    let final: Cuerda = nueva;
    if ((nueva.ruta?.length ?? 0) === 0) {
      for (const k of [0, 1] as const) {
        const pol = poleaCerca(k === 0 ? nueva.a : nueva.b, resuelta);
        if (!pol || !esperaEnPolea(nueva, k, pol)) continue;
        const mitad = mitadEnPolea(pol, resuelta, nueva.id);
        if (!mitad) continue;
        const lejosVieja = mitad.k === 0 ? 1 : 0;
        const desde = { p: lejosVieja === 0 ? mitad.c.a : mitad.c.b, union: mitad.c.union![lejosVieja]! };
        const otro = { p: k === 0 ? nueva.b : nueva.a, union: nueva.union![k === 0 ? 1 : 0]! };
        final = {
          ...mitad.c,
          a: desde.p,
          b: otro.p,
          union: [desde.union, otro.union],
          ruta: [{ el: pol.id, sentido: sentidoNatural(desde.p, pol.centro, otro.p) }],
        };
        resultado = { actualizar: [final] };
        break;
      }
    }
    // Los cuerpos que cuelgan de la polea se corren para que su tramo quede vertical.
    const corridos = alinearColgantes(final.id, [...escena.filter((x) => x.id !== final.id), final]);
    if (corridos.length > 0) resultado = { ...resultado, actualizar: [...(resultado.actualizar ?? []), ...corridos] };
    return resultado;
  }
  return { agregar: [e] };
}

/**
 * Una cuerda o un resorte editado (se movió un extremo con su asa, o se arrastró entero): los extremos que
 * cambiaron de lugar se vuelven a unir donde quedaron. `antes` es la versión resuelta previa.
 */
export function reconectar<T extends Extract<Elemento, { tipo: 'cuerda' | 'resorte' }>>(
  nuevo: T,
  antes: T,
  escena: readonly Elemento[],
  /** Ids que se movieron junto con la pieza: un extremo unido a uno de ellos conserva su unión. */
  conservar: ReadonlySet<string> = new Set(),
  radio = TOLERANCIA_CONTACTO,
): T {
  const resuelta = resolverEscena(escena);
  const union: [Union | null, Union | null] = [...(nuevo.union ?? antes.union ?? [null, null])] as [Union | null, Union | null];
  const pts = [nuevo.a, nuevo.b];
  const previos = [antes.a, antes.b];
  let cambio = false;
  for (const k of [0, 1] as const) {
    if (Math.hypot(pts[k]!.x - previos[k]!.x, pts[k]!.y - previos[k]!.y) < 1e-6) continue;
    const u = union[k];
    if (u && 'el' in u && conservar.has(u.el)) continue;
    const r = unirExtremo(pts[k]!, resuelta, new Set([nuevo.id]), radio);
    union[k] = r.union;
    pts[k] = r.p;
    cambio = true;
  }
  if (!cambio) return nuevo;
  return { ...nuevo, a: pts[0]!, b: pts[1]!, union };
}

/** Marcas que se dibujan sobre el lienzo (tamaño fijo en pantalla; nunca se exportan). */
export type TipoMarca = 'unido' | 'fijo' | 'suelto' | 'puerto' | 'iman' | 'paso';
export interface Marca {
  p: Punto;
  tipo: TipoMarca;
  /** Para `paso`: radio (m) del anillo que resalta la polea que se va a envolver. */
  r?: number;
}

/** Posición actual del puerto al que está unido cada extremo (punto = unido, triángulo = fijo, círculo = suelto). */
export function marcasDeUnion(escena: readonly Elemento[]): Marca[] {
  const porId = new Map(escena.map((e) => [e.id, e]));
  const out: Marca[] = [];
  for (const e of escena) {
    if ((e.tipo !== 'cuerda' && e.tipo !== 'resorte') || !e.union) continue;
    e.union.forEach((u, k) => {
      const p = k === 0 ? e.a : e.b;
      if (!u) out.push({ p, tipo: 'suelto' });
      else if ('fijo' in u) out.push({ p, tipo: 'fijo' });
      else {
        const el = porId.get(u.el);
        out.push({ p: (el && posPuerto(el, u.puerto)) ?? p, tipo: el ? 'unido' : 'suelto' });
      }
    });
  }
  return out;
}

/**
 * Marcas mientras se conecta: los puertos de lo que está cerca del puntero (círculos pequeños), el imán que se
 * usaría (anillo grande) y la polea que el gesto va a envolver.
 */
export function marcasDeConexion(escena: readonly Elemento[], p: Punto, radio: number, margenPaso: number, excluir: ReadonlySet<string> = new Set()): Marca[] {
  const out: Marca[] = [];
  const cerca = radio * 6;
  for (const e of escena) {
    if (excluir.has(e.id) || !(esCuerpo(e) || e.tipo === 'polea')) continue;
    for (const q of puertosDe(e)) if (Math.hypot(q.p.x - p.x, q.p.y - p.y) <= cerca) out.push({ p: q.p, tipo: 'puerto' });
  }
  const reg = regionDePaso(p, escena, margenPaso);
  const m = iman(p, escena, radio, excluir);
  if (m) out.push({ p: m.p, tipo: 'iman' });
  if (reg && (!m || m.el !== reg.el || reg.r > 0)) out.push({ p: reg.c, tipo: 'paso', r: reg.r });
  return out;
}

// --- Conexión toque a toque (para el dedo) --------------------------------------------------------------------------

/** Radio del imán y margen del paso cuando se usa el dedo (un dedo cubre unos 40 px). */
export const IMAN_TACTIL_PX = 40;
export const PASO_TACTIL_PX = 26;

/** El puerto de un cuerpo que mira hacia `objetivo`: la cara de arriba si la cuerda sube, etc. */
export function puertoHacia(c: CuerpoC, objetivo: Punto): { puerto: string; p: Punto } {
  const dx = objetivo.x - c.centro.x;
  const dy = objetivo.y - c.centro.y;
  if (c.tipo === 'esfera') {
    const g = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
    const puerto = `borde:${g}`;
    return { puerto, p: posPuerto(c, puerto)! };
  }
  const co = Math.cos(c.angulo);
  const si = Math.sin(c.angulo);
  const caras: Array<[string, number, number]> = [
    ['cara-sup', -si, co],
    ['cara-inf', si, -co],
    ['cara-izq', -co, -si],
    ['cara-der', co, si],
  ];
  let mejor = caras[0]!;
  let max = -Infinity;
  for (const k of caras) {
    const d = k[1] * dx + k[2] * dy;
    if (d > max) {
      max = d;
      mejor = k;
    }
  }
  return { puerto: mejor[0], p: posPuerto(c, mejor[0])! };
}

/** Conexión empezada con un toque: el primer extremo y las poleas (o bordes) tocadas después, en orden. */
export interface ConexionPendiente {
  tipo: 'cuerda' | 'resorte';
  inicio: { p: Punto; union: Union; el: string | null };
  pasos: RegionPaso[];
}

export type ResultadoToque =
  | { k: 'pendiente'; c: ConexionPendiente }
  | { k: 'lista'; elemento: Cuerda | Extract<Elemento, { tipo: 'resorte' }> };

/**
 * Un toque de la conexión toque a toque. El primero fija un extremo (al imán que haya, o fijo en el espacio); con la
 * cuerda, cada toque sobre una polea (o el extremo de una superficie) la agrega a la ruta; el toque siguiente en otra
 * cosa la termina. El sentido de cada vuelta sale de la geometría (de dónde viene y adónde va), y en los cuerpos la
 * cuerda se une a la cara que mira hacia su tramo.
 */
export function toque(
  pendiente: ConexionPendiente | null,
  tipo: 'cuerda' | 'resorte',
  p: Punto,
  escena: readonly Elemento[],
  radio: number,
  margen: number,
  crear: (a: Punto, b: Punto, extra: { union: [Union, Union]; ruta?: Paso[] }) => Cuerda | Extract<Elemento, { tipo: 'resorte' }>,
): ResultadoToque {
  const m = iman(p, escena, radio);
  if (!pendiente) return { k: 'pendiente', c: { tipo, inicio: m ? { p: m.p, union: m.union, el: m.el } : { p, union: { fijo: true }, el: null }, pasos: [] } };
  if (tipo === 'cuerda') {
    const reg = regionDePaso(p, escena, margen);
    const ultimo = pendiente.pasos.at(-1);
    const esPolea = reg && reg.r > 0 && (!m || m.el === reg.el);
    const esBorde = reg && reg.r === 0 && Math.hypot(p.x - reg.c.x, p.y - reg.c.y) <= margen;
    if (reg && (esPolea || esBorde) && reg.el !== pendiente.inicio.el && !(ultimo && ultimo.el === reg.el && ultimo.extremo === reg.extremo)) {
      return { k: 'pendiente', c: { ...pendiente, pasos: [...pendiente.pasos, reg] } };
    }
  }
  const fin = m ? { p: m.p, union: m.union as Union, el: m.el as string | null } : { p, union: { fijo: true } as Union, el: null };
  // Tocar otra vez el mismo cuerpo sin haber pasado por nada no termina nada.
  if (fin.el !== null && fin.el === pendiente.inicio.el && pendiente.pasos.length === 0) return { k: 'pendiente', c: pendiente };
  const porId = new Map(escena.map((e) => [e.id, e]));
  // Cada extremo unido a un cuerpo se une a la cara que mira hacia su tramo.
  const cadena: Punto[] = [pendiente.inicio.p, ...pendiente.pasos.map((r) => r.c), fin.p];
  const ajustar = (x: { p: Punto; union: Union; el: string | null }, hacia: Punto) => {
    const c = x.el ? porId.get(x.el) : undefined;
    if (!c || !esCuerpo(c)) return x;
    const q = puertoHacia(c, hacia);
    return { p: q.p, union: { el: c.id, puerto: q.puerto } as Union, el: c.id };
  };
  const a = ajustar(pendiente.inicio, cadena[1]!);
  const b = ajustar(fin, cadena[cadena.length - 2]!);
  cadena[0] = a.p;
  cadena[cadena.length - 1] = b.p;
  const ruta = pendiente.pasos.map((r, i) => pasoAlSalir(r, cadena[i]!, cadena[i + 2]!));
  return { k: 'lista', elemento: crear(a.p, b.p, { union: [a.union, b.union], ...(ruta.length > 0 ? { ruta } : {}) }) };
}
