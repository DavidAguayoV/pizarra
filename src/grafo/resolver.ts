import type { Punto } from '../core/camara';
import type { Cuerda, Elemento, Paso, Polea, Resorte, Union } from '../core/elementos';
import { posPuerto } from './puertos';
import type { PasoGeo } from './ruta';
import { geometriaRuta } from './ruta';

/**
 * Escena resuelta: la geometría de lo que está unido se **deriva** del grafo. Los extremos unidos de cuerdas y
 * resortes toman la posición de su puerto, y las cuerdas con ruta calculan su camino tangente a las poleas.
 * Lo que no está unido queda donde se guardó. Pura y memorizada por lista: se calcula una vez por cambio de la
 * escena, no por cuadro. La usan el lienzo, las exportaciones, el DCL, la simulación y la animación.
 */

/** Posición de un extremo según su unión (o la guardada si está suelto, fijo o su elemento no existe). */
export function posUnion(u: Union | null | undefined, guardada: Punto, porId: ReadonlyMap<string, Elemento>): Punto {
  if (!u || 'fijo' in u) return guardada;
  const el = porId.get(u.el);
  return (el && posPuerto(el, u.puerto)) ?? guardada;
}

/** Pasos de una ruta como geometría (se saltan los de elementos que no existen). */
export function pasosGeo(ruta: readonly Paso[], porId: ReadonlyMap<string, Elemento>): PasoGeo[] {
  const out: PasoGeo[] = [];
  for (const p of ruta) {
    if ('fijos' in p) {
      out.push({ k: 'fijos', p: p.fijos });
      continue;
    }
    const el = porId.get(p.el);
    if (el?.tipo === 'polea') {
      const cuerpo = el.montaje ? porId.get(el.montaje.el) : undefined;
      const movil = cuerpo && (cuerpo.tipo === 'bloque' || cuerpo.tipo === 'esfera') ? { id: cuerpo.id, desp: { x: el.centro.x - cuerpo.centro.x, y: el.centro.y - cuerpo.centro.y } } : undefined;
      out.push({ k: 'circulo', c: el.centro, r: el.radio, s: p.sentido, ...(movil ? { cuerpo: movil } : {}) });
    } else if (el?.tipo === 'superficie' && p.extremo) {
      // Borde de una mesa: la cuerda dobla en el extremo de la superficie (un punto, sin roce).
      out.push({ k: 'circulo', c: p.extremo === 'a' ? el.a : el.b, r: 0, s: p.sentido });
    }
  }
  return out;
}

function resolverCuerda(c: Cuerda, porId: ReadonlyMap<string, Elemento>): Cuerda {
  const a = posUnion(c.union?.[0], c.a, porId);
  const b = posUnion(c.union?.[1], c.b, porId);
  if (!c.ruta || c.ruta.length === 0) {
    if (a === c.a && b === c.b && !c.camino) return c;
    const { camino: _, ...resto } = c;
    void _;
    return { ...resto, a, b };
  }
  const g = geometriaRuta(a, pasosGeo(c.ruta, porId), b);
  return { ...c, a, b, camino: g.tramos };
}

function resolverResorte(r: Resorte, porId: ReadonlyMap<string, Elemento>): Resorte {
  const a = posUnion(r.union?.[0], r.a, porId);
  const b = posUnion(r.union?.[1], r.b, porId);
  return a === r.a && b === r.b ? r : { ...r, a, b };
}

/** Polea móvil: su centro sale del puerto del cuerpo en que está montada, y se marca el punto de su soporte. */
export function resolverPolea(p: Polea, porId: ReadonlyMap<string, Elemento>): Polea {
  if (!p.montaje) return p;
  const c = porId.get(p.montaje.el);
  const centro = c ? posPuerto(c, p.montaje.puerto) : null;
  if (!c || !centro) return p;
  const soporte = posPuerto(c, c.tipo === 'bloque' ? 'cara-sup' : c.tipo === 'esfera' ? 'borde:90' : 'centro') ?? centro;
  return { ...p, centro, soporte };
}

const memo = new WeakMap<readonly Elemento[], Elemento[]>();

export function resolverEscena(elementos: readonly Elemento[]): Elemento[] {
  const previo = memo.get(elementos);
  if (previo) return previo;
  const porId = new Map(elementos.map((e) => [e.id, e]));
  // Primero las poleas móviles (las cuerdas que pasan por ellas usan su centro ya resuelto).
  for (const e of elementos) if (e.tipo === 'polea' && e.montaje) porId.set(e.id, resolverPolea(e, porId));
  const out = elementos.map((e) => {
    if (e.tipo === 'cuerda') return resolverCuerda(e, porId);
    if (e.tipo === 'resorte') return resolverResorte(e, porId);
    if (e.tipo === 'polea' && e.montaje) return porId.get(e.id)!;
    return e;
  });
  memo.set(elementos, out);
  return out;
}

/** Quita lo derivado antes de guardar un elemento en una op. */
export function sinDerivados<T extends Elemento>(e: T): T {
  if (e.tipo === 'polea' && e.soporte) {
    const { soporte: _, ...resto } = e;
    void _;
    return resto as T;
  }
  if (e.tipo !== 'cuerda' || !e.camino) return e;
  const { camino: _, ...resto } = e;
  void _;
  return resto as T;
}

/**
 * Lo que hay que redibujar junto con unos elementos que se están arrastrando: las cuerdas y resortes unidos a
 * ellos (o que pasan por una polea que se mueve), ya resueltos con la posición nueva. Para la vista previa.
 */
export function dependientes(elementos: readonly Elemento[], vivos: readonly Elemento[]): Elemento[] {
  // Atajo: mientras se dibuja tinta no hay nada que seguir (esto corre en cada movimiento del puntero).
  if (!vivos.some((v) => v.tipo === 'bloque' || v.tipo === 'esfera' || v.tipo === 'polea' || v.tipo === 'superficie')) return [];
  const movidos = new Set(vivos.map((v) => v.id));
  const usa = (e: Cuerda | Resorte): boolean =>
    (e.union ?? []).some((u) => u !== null && !('fijo' in u) && movidos.has(u.el)) ||
    (e.tipo === 'cuerda' && (e.ruta ?? []).some((p) => movidos.has(p.el)));
  const afectados = elementos.filter((e): e is Cuerda | Resorte => (e.tipo === 'cuerda' || e.tipo === 'resorte') && !movidos.has(e.id) && usa(e));
  if (afectados.length === 0) return [];
  const porId = new Map(elementos.map((e) => [e.id, e]));
  for (const v of vivos) porId.set(v.id, v);
  return afectados.map((e) => (e.tipo === 'cuerda' ? resolverCuerda(e, porId) : resolverResorte(e, porId)));
}
