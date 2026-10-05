import type { Punto } from '../core/camara';
import type { Bloque, Cuerda, Elemento, Esfera, Polea, Union } from '../core/elementos';
import { distanciaAlCuerpo, TOLERANCIA_CONTACTO } from '../physics/dcl';
import { apoyarEn, superficieCercana } from '../physics/objetos';
import { posPuerto, puertoMasCercano } from './puertos';
import { resolverEscena } from './resolver';
import { sentidoNatural } from './ruta';

/**
 * Conexión al crear o editar (Fase 1, PROVISORIA). Mientras no existan los imanes con retroalimentación
 * visual (Fase 2), al soltar un objeto se le asignan sus uniones con las **mismas distancias de la v1**, para que
 * dibujar funcione como antes. La diferencia es que el resultado queda **guardado y a la vista** (marcas en los
 * extremos), no se vuelve a adivinar en cada simulación:
 *
 *   - un extremo de cuerda o resorte a menos de 9 cm de un cuerpo se une a su puerto con nombre más cercano
 *     (y se ajusta a él);
 *   - un extremo de cuerda a menos de radio + 14 cm de una polea, si ya hay otra cuerda que termina fija en esa
 *     misma polea, funde las dos en una sola cuerda que **envuelve** la polea (sentido según el dibujo);
 *   - cualquier otro extremo queda fijo en el espacio, como en la v1;
 *   - un cuerpo a menos de 30 cm de una superficie se apoya en ella (`apoyo`);
 *   - una fuerza aplicada (o tensión) dibujada a menos de 15 cm de un cuerpo actúa sobre él.
 */

const RADIO_EXTRA_POLEA = 0.14;
const TOL_VECTOR = TOLERANCIA_CONTACTO + 0.06;

type CuerpoC = Bloque | Esfera;

export interface Cambio {
  agregar?: Elemento[];
  actualizar?: Elemento[];
  borrar?: string[];
}

const esCuerpo = (e: Elemento): e is CuerpoC => e.tipo === 'bloque' || e.tipo === 'esfera';

/** Une un extremo suelto en `p`: al puerto más cercano de un cuerpo a menos de 9 cm, o fijo en el espacio. */
export function unirExtremo(p: Punto, escena: readonly Elemento[], excluir: ReadonlySet<string> = new Set()): { union: Union; p: Punto } {
  let mejor: CuerpoC | null = null;
  let d = Infinity;
  for (const e of escena) {
    if (!esCuerpo(e) || excluir.has(e.id)) continue;
    const de = distanciaAlCuerpo(e, p);
    if (de < d) {
      d = de;
      mejor = e;
    }
  }
  if (mejor && d <= TOLERANCIA_CONTACTO) {
    const q = puertoMasCercano(mejor, p)!;
    return { union: { el: mejor.id, puerto: q.nombre }, p: { ...q.p } };
  }
  return { union: { fijo: true }, p };
}

/** El cuerpo con su `apoyo` según la superficie que tenga cerca (y apoyado sobre ella). */
export function apoyar<T extends CuerpoC>(c: T, escena: readonly Elemento[]): T {
  const s = superficieCercana(c, escena.filter((x) => x.id !== c.id));
  return s ? { ...apoyarEn(c, s), apoyo: [s.id] } : { ...c, apoyo: [] };
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

/** Una cuerda sin ruta que termina fija junto a la polea (esperando la otra mitad), y cuál de sus extremos es. */
function mitadEnPolea(pol: Polea, escena: readonly Elemento[], excluir: string): { c: Cuerda; k: 0 | 1 } | null {
  for (const e of escena) {
    if (e.tipo !== 'cuerda' || e.id === excluir || (e.ruta?.length ?? 0) > 0 || !e.union) continue;
    for (const k of [0, 1] as const) {
      const u = e.union[k];
      const q = k === 0 ? e.a : e.b;
      if (u && 'fijo' in u && Math.hypot(q.x - pol.centro.x, q.y - pol.centro.y) <= pol.radio + RADIO_EXTRA_POLEA) return { c: e, k };
    }
  }
  return null;
}

/** Uniones de un elemento recién dibujado. Puede fundirlo con otra cuerda (y entonces no se agrega). */
export function conectarNuevo(e: Elemento, escena: readonly Elemento[]): Cambio {
  const resuelta = resolverEscena(escena);
  if (esCuerpo(e)) return { agregar: [apoyar(e, escena)] };
  if (e.tipo === 'vector') {
    if (e.fantasma || (e.rol !== 'aplicada' && e.rol !== 'tension')) return { agregar: [e] };
    const c = escena.find((x): x is CuerpoC => esCuerpo(x) && distanciaAlCuerpo(x, e.a) <= TOL_VECTOR);
    return { agregar: [{ ...e, cuerpo: c?.id ?? null }] };
  }
  if (e.tipo === 'resorte') {
    const a = unirExtremo(e.a, resuelta);
    const b = unirExtremo(e.b, resuelta);
    return { agregar: [{ ...e, a: a.p, b: b.p, union: [a.union, b.union] }] };
  }
  if (e.tipo === 'cuerda') {
    const extremos = [e.a, e.b] as const;
    for (const k of [0, 1] as const) {
      const p = extremos[k];
      if ('el' in unirExtremo(p, resuelta).union) continue;
      const pol = poleaCerca(p, resuelta);
      if (!pol) continue;
      const mitad = mitadEnPolea(pol, resuelta, e.id);
      if (!mitad) continue;
      // Se funden: la cuerda va del extremo lejano de la mitad existente, envuelve la polea y sigue hasta el otro
      // extremo de la nueva.
      const lejosVieja = mitad.k === 0 ? 1 : 0;
      const desde = { p: lejosVieja === 0 ? mitad.c.a : mitad.c.b, union: mitad.c.union![lejosVieja]! };
      const otro = unirExtremo(extremos[1 - k]!, resuelta);
      const fundida: Cuerda = {
        ...mitad.c,
        a: desde.p,
        b: otro.p,
        union: [desde.union, otro.union],
        ruta: [{ el: pol.id, sentido: sentidoNatural(desde.p, pol.centro, otro.p) }],
      };
      return { actualizar: [fundida] };
    }
    const a = unirExtremo(e.a, resuelta);
    const b = unirExtremo(e.b, resuelta);
    return { agregar: [{ ...e, a: a.p, b: b.p, union: [a.union, b.union] }] };
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
    const r = unirExtremo(pts[k]!, resuelta, new Set([nuevo.id]));
    union[k] = r.union;
    pts[k] = r.p;
    cambio = true;
  }
  if (!cambio) return nuevo;
  return { ...nuevo, a: pts[0]!, b: pts[1]!, union };
}

/** Posición actual del puerto al que está unido un extremo (para las marcas en pantalla). */
export function marcasDeUnion(escena: readonly Elemento[]): Array<{ p: Punto; tipo: 'unido' | 'fijo' | 'suelto' }> {
  const porId = new Map(escena.map((e) => [e.id, e]));
  const out: Array<{ p: Punto; tipo: 'unido' | 'fijo' | 'suelto' }> = [];
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
