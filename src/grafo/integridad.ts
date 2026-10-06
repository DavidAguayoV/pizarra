import type { Punto } from '../core/camara';
import { arcoDe, marcoTramo, puntoEnTramo } from '../physics/curvas';
import type { Elemento, Superficie, Union } from '../core/elementos';
import type { LotePayload } from '../core/escena';
import { aplicarLote } from '../core/escena';
import { normalSuperficie } from '../physics/objetos';
import { reconectar } from './conectar';
import { resolverEscena, sinDerivados } from './resolver';

/**
 * Integridad del grafo al editar. Toda edición pasa por `prepararLote` antes de ser una op, así que las
 * consecuencias viajan **en la misma op** (un deshacer las revierte juntas, y el estudiante las recibe juntas):
 *
 *   - borrar un cuerpo, una polea o una superficie suelta lo que estaba unido a él (el extremo queda suelto donde
 *     estaba, la cuerda deja de pasar por esa polea, el cuerpo deja de apoyarse, el vector deja de actuar);
 *   - mover una superficie arrastra a los cuerpos que se apoyan en ella;
 *   - mover un extremo de cuerda o resorte (o la pieza entera) lo vuelve a unir donde quedó;
 *   - nada derivado (el camino de una cuerda) se guarda.
 */

const igual = (a: Punto, b: Punto): boolean => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;

/** El cuerpo, movido para que conserve su posición relativa a la superficie que cambió de lugar o de ángulo. */
function seguirSuperficie<T extends Extract<Elemento, { tipo: 'bloque' | 'esfera' }>>(c: T, antes: Superficie, ahora: Superficie): T {
  if (arcoDe(antes) || arcoDe(ahora)) {
    // Con curvas: la misma fracción a lo largo y la misma distancia, con la normal y la tangente de cada punto.
    const m0 = marcoTramo(antes, c.centro);
    const f = Math.min(Math.max(m0.u / m0.largo, 0), 1);
    const q1 = puntoEnTramo(ahora, f);
    const q0 = puntoEnTramo(antes, f);
    const k0 = marcoTramo(antes, q0);
    const k1 = marcoTramo(ahora, q1);
    const r4c = (n: number) => Math.round(n * 1e4) / 1e4;
    const centro = { x: r4c(q1.x + k1.n.x * m0.d), y: r4c(q1.y + k1.n.y * m0.d) };
    if (c.tipo === 'esfera') return { ...c, centro };
    const giroC = Math.atan2(k1.t.y, k1.t.x) - Math.atan2(k0.t.y, k0.t.x);
    return { ...c, centro, angulo: r4c(c.angulo + giroC) };
  }
  const l0 = Math.hypot(antes.b.x - antes.a.x, antes.b.y - antes.a.y) || 1;
  const l1 = Math.hypot(ahora.b.x - ahora.a.x, ahora.b.y - ahora.a.y) || 1;
  const t0 = { x: (antes.b.x - antes.a.x) / l0, y: (antes.b.y - antes.a.y) / l0 };
  const t1 = { x: (ahora.b.x - ahora.a.x) / l1, y: (ahora.b.y - ahora.a.y) / l1 };
  const n0 = normalSuperficie(antes);
  const n1 = normalSuperficie(ahora);
  const rel = { x: c.centro.x - antes.a.x, y: c.centro.y - antes.a.y };
  // Misma fracción a lo largo y misma distancia a la superficie.
  const u = ((rel.x * t0.x + rel.y * t0.y) / l0) * l1;
  const d = rel.x * n0.x + rel.y * n0.y;
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
  const centro = { x: r4(ahora.a.x + t1.x * u + n1.x * d), y: r4(ahora.a.y + t1.y * u + n1.y * d) };
  if (c.tipo === 'esfera') return { ...c, centro };
  const giro = Math.atan2(t1.y, t1.x) - Math.atan2(t0.y, t0.x);
  return { ...c, centro, angulo: r4(c.angulo + giro) };
}

export function prepararLote(cambio: LotePayload, previos: readonly Elemento[], opciones: { radioIman?: number } = {}): LotePayload {
  const borrar = new Set(cambio.borrar ?? []);
  const resueltosAntes = new Map(resolverEscena(previos).map((e) => [e.id, e]));
  const crudosAntes = new Map(previos.map((e) => [e.id, e]));
  // Escena como quedará con el cambio (para volver a unir extremos contra las posiciones nuevas).
  const despues = aplicarLote({ elementos: [...previos] }, { ...cambio, actualizar: cambio.actualizar?.map(sinDerivados), agregar: cambio.agregar?.map(sinDerivados) }).elementos;

  const actualizados = new Map<string, Elemento>();
  const editados = new Set((cambio.actualizar ?? []).map((e) => e.id));
  for (const e0 of cambio.actualizar ?? []) {
    let e = sinDerivados(e0);
    const antes = resueltosAntes.get(e.id);
    if ((e.tipo === 'cuerda' || e.tipo === 'resorte') && antes && antes.tipo === e.tipo) e = reconectar(e, antes as typeof e, despues, editados, opciones.radioIman);
    actualizados.set(e.id, e);
  }

  // Superficies que cambiaron: sus cuerpos apoyados las siguen (si no se están editando también).
  const superficiesMovidas = new Map<string, { antes: Superficie; ahora: Superficie }>();
  for (const e of actualizados.values()) {
    const antes = crudosAntes.get(e.id);
    if (e.tipo === 'superficie' && antes?.tipo === 'superficie' && (!igual(e.a, antes.a) || !igual(e.b, antes.b))) superficiesMovidas.set(e.id, { antes, ahora: e });
  }

  const vigente = (id: string): Elemento | undefined => actualizados.get(id) ?? crudosAntes.get(id);
  const resueltoPrevio = (id: string): Elemento | undefined => resueltosAntes.get(id);

  for (const base of previos) {
    if (borrar.has(base.id)) continue;
    let e = vigente(base.id)!;
    const original = e;
    if ((e.tipo === 'cuerda' || e.tipo === 'resorte') && e.union) {
      const pieza = e;
      const r = resueltoPrevio(pieza.id) as typeof pieza | undefined;
      const union = [...pieza.union!] as [Union | null, Union | null];
      const pts = [pieza.a, pieza.b];
      for (const k of [0, 1] as const) {
        const u = union[k];
        if (u && !('fijo' in u) && borrar.has(u.el)) {
          // El extremo queda suelto donde estaba (su posición resuelta antes de borrar).
          if (r) pts[k] = k === 0 ? r.a : r.b;
          union[k] = null;
        }
      }
      if (union.some((u, k) => u !== pieza.union![k])) e = { ...pieza, a: pts[0]!, b: pts[1]!, union };
    }
    if (e.tipo === 'cuerda' && e.ruta?.some((p) => borrar.has(p.el))) e = { ...e, ruta: e.ruta.filter((p) => !borrar.has(p.el)) };
    if ((e.tipo === 'bloque' || e.tipo === 'esfera') && e.apoyo) {
      if (e.apoyo.some((id) => borrar.has(id))) e = { ...e, apoyo: e.apoyo.filter((id) => !borrar.has(id)) };
      const principal = e.apoyo?.[0];
      const mov = principal ? superficiesMovidas.get(principal) : undefined;
      if (mov && !actualizados.has(e.id)) e = seguirSuperficie(e, mov.antes, mov.ahora);
    }
    if (e.tipo === 'vector' && e.cuerpo && borrar.has(e.cuerpo)) e = { ...e, cuerpo: null };
    // Polea móvil cuyo cuerpo se borra: queda fija donde estaba.
    if (e.tipo === 'polea' && e.montaje && borrar.has(e.montaje.el)) {
      const r = resueltoPrevio(e.id);
      const { montaje: _, ...resto } = e;
      void _;
      e = { ...resto, centro: r?.tipo === 'polea' ? { ...r.centro } : e.centro };
    }
    if (e !== original) actualizados.set(e.id, e);
  }

  const out: LotePayload = {};
  if (cambio.agregar?.length) out.agregar = cambio.agregar.map(sinDerivados);
  if (actualizados.size > 0) out.actualizar = [...actualizados.values()];
  if (borrar.size > 0) out.borrar = [...borrar];
  return out;
}

export function loteVacio(l: LotePayload): boolean {
  return !l.agregar?.length && !l.actualizar?.length && !l.borrar?.length;
}
