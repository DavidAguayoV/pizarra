import type { Punto } from '../core/camara';
import type { Elemento, Polea, Union } from '../core/elementos';
import { cajaDe } from '../core/elementos';
import type { LotePayload } from '../core/escena';
import { alinearColgantes } from './conectar';
import { leerGrafo } from './lector';
import { resolverEscena } from './resolver';
import type { Problema } from './validar';

/**
 * Arreglos automáticos de los problemas de la escena (`grafo/validar.ts`). Cada uno devuelve un lote que la app
 * pasa por la integridad y aplica como **una** op: un deshacer lo revierte. null si ya no hay nada que arreglar.
 *
 *   fijar-extremo  los extremos sueltos de una cuerda o un resorte quedan fijos donde están
 *   quitar-apoyo   el cuerpo deja de apoyarse en la superficie que quedó lejos
 *   separar        el segundo cuerpo se corre de lado hasta no superponerse con el primero
 *   alinear        el cuerpo que cuelga de una polea se corre hasta que su tramo queda vertical
 *   alinear-polea  la polea se corre (perpendicular a la superficie) hasta que el tramo del cuerpo apoyado quede
 *                  paralelo a ella; después se alinean los que cuelgan del otro lado
 */
export function arreglar(p: Problema, elementos: readonly Elemento[]): LotePayload | null {
  const porId = new Map(resolverEscena(elementos).map((e) => [e.id, e]));
  switch (p.arreglo) {
    case 'fijar-extremo': {
      const e = porId.get(p.elementos[0]!);
      if (!e || (e.tipo !== 'cuerda' && e.tipo !== 'resorte') || !e.union) return null;
      const union = e.union.map((u) => u ?? ({ fijo: true } as Union)) as [Union, Union];
      // Un extremo unido a algo que ya no existe también queda fijo (donde se ve).
      const sano = union.map((u) => ('el' in u && !porId.has(u.el) ? ({ fijo: true } as Union) : u)) as [Union, Union];
      return { actualizar: [{ ...e, union: sano }] };
    }
    case 'quitar-apoyo': {
      const [cid, sid] = p.elementos;
      const c = porId.get(cid!);
      if (!c || (c.tipo !== 'bloque' && c.tipo !== 'esfera')) return null;
      return { actualizar: [{ ...c, apoyo: (c.apoyo ?? []).filter((x) => x !== sid) }] };
    }
    case 'separar': {
      const [a, b] = p.elementos.map((id) => porId.get(id!));
      if (!a || !b || (b.tipo !== 'bloque' && b.tipo !== 'esfera')) return null;
      const ka = cajaDe(a);
      const kb = cajaDe(b);
      const derecha = b.centro.x >= (ka.x0 + ka.x1) / 2;
      const dx = derecha ? ka.x1 - kb.x0 + 0.05 : ka.x0 - kb.x1 - 0.05;
      return { actualizar: [{ ...b, centro: { x: Math.round((b.centro.x + dx) * 1e4) / 1e4, y: b.centro.y } }] };
    }
    case 'alinear': {
      if (!p.ref) return null;
      const movidos = alinearColgantes(p.ref.cuerda, elementos, Math.PI / 2);
      return movidos.length > 0 ? { actualizar: movidos } : null;
    }
    case 'alinear-polea':
      return alinearPolea(p, elementos);
    default:
      return null;
  }
}

/** Corre la polea vecina al cuerpo apoyado para que el tramo quede paralelo a su superficie. */
function alinearPolea(p: Problema, elementos: readonly Elemento[]): LotePayload | null {
  if (!p.ref) return null;
  const g = leerGrafo(elementos);
  const c = g.cuerdas.find((x) => x.el.id === p.ref!.cuerda);
  const ruta = c?.el.ruta;
  if (!c || !ruta || ruta.length === 0) return null;
  const k = p.ref.k;
  const paso = ruta[k === 0 ? 0 : ruta.length - 1]!;
  if ('fijos' in paso) return null;
  const pol = g.porId.get(paso.el);
  const ext = c.ext[k];
  if (!pol || pol.tipo !== 'polea' || pol.montaje || ext.k !== 'cuerpo') return null;
  const s = (ext.cuerpo.apoyo ?? []).map((id) => g.porId.get(id)).find((x) => x?.tipo === 'superficie');
  if (!s || s.tipo !== 'superficie') return null;
  // Dirección del tramo, a lo largo de la superficie, hacia la polea.
  const l = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) || 1;
  let t: Punto = { x: (s.b.x - s.a.x) / l, y: (s.b.y - s.a.y) / l };
  const P = ext.p;
  if ((pol.centro.x - P.x) * t.x + (pol.centro.y - P.y) * t.y < 0) t = { x: -t.x, y: -t.y };
  const n = { x: -t.y, y: t.x };
  // Recorriendo la cuerda desde el cuerpo hacia la polea, el sentido es el del paso (o el contrario si el cuerpo es b).
  const sp = k === 0 ? paso.sentido : (-paso.sentido as 1 | -1);
  // El punto de contacto es C − s r n: para que esté sobre la recta del tramo, (C − P)·n = s r.
  const d = (pol.centro.x - P.x) * n.x + (pol.centro.y - P.y) * n.y;
  const corr = sp * pol.radio - d;
  const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;
  const movida: Polea = { ...pol, centro: { x: r4(pol.centro.x + corr * n.x), y: r4(pol.centro.y + corr * n.y) } };
  const escena = elementos.map((e) => (e.id === movida.id ? movida : e));
  const colgantes = alinearColgantes(c.el.id, escena);
  return { actualizar: [movida, ...colgantes] };
}
