import type { Punto } from '../core/camara';
import type { Caja2D, Elemento } from '../core/elementos';
import { cajaDe, esquinasBloque, nuevoIdElemento, trasladar } from '../core/elementos';

/**
 * Disponer elementos (Fase 4): alinear, distribuir, rotar, duplicar y llevar a la rejilla. Funciones puras: devuelven
 * los elementos cambiados; quien llama los emite en una op (y la integridad del grafo hace seguir a lo unido).
 */

export type Alineacion = 'izq' | 'centro-h' | 'der' | 'arriba' | 'centro-v' | 'abajo';
export type Distribucion = 'horizontal' | 'vertical';

const r4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Caja geométrica (sin márgenes de trazo ni etiquetas): la que se ve como borde del objeto. */
export function cajaGeometrica(e: Elemento): Caja2D {
  const de = (pts: readonly Punto[]): Caja2D => ({
    x0: Math.min(...pts.map((p) => p.x)),
    y0: Math.min(...pts.map((p) => p.y)),
    x1: Math.max(...pts.map((p) => p.x)),
    y1: Math.max(...pts.map((p) => p.y)),
  });
  switch (e.tipo) {
    case 'bloque':
      return de(esquinasBloque(e));
    case 'esfera':
    case 'polea':
      return { x0: e.centro.x - e.radio, y0: e.centro.y - e.radio, x1: e.centro.x + e.radio, y1: e.centro.y + e.radio };
    case 'superficie':
    case 'cuerda':
    case 'resorte':
    case 'vector':
    case 'linea':
    case 'flecha':
    case 'rect':
    case 'elipse':
      return de([e.a, e.b]);
    default:
      return cajaDe(e);
  }
}

/** Alinea los elementos por el borde o el centro de sus cajas, tomando como referencia el conjunto. */
export function alinear(sel: readonly Elemento[], modo: Alineacion): Elemento[] {
  if (sel.length < 2) return [];
  const cajas = sel.map(cajaGeometrica);
  const x0 = Math.min(...cajas.map((c) => c.x0));
  const x1 = Math.max(...cajas.map((c) => c.x1));
  const y0 = Math.min(...cajas.map((c) => c.y0));
  const y1 = Math.max(...cajas.map((c) => c.y1));
  return sel.flatMap((e, k) => {
    const c = cajas[k]!;
    let dx = 0;
    let dy = 0;
    if (modo === 'izq') dx = x0 - c.x0;
    else if (modo === 'der') dx = x1 - c.x1;
    else if (modo === 'centro-h') dx = (x0 + x1) / 2 - (c.x0 + c.x1) / 2;
    else if (modo === 'abajo') dy = y0 - c.y0;
    else if (modo === 'arriba') dy = y1 - c.y1;
    else dy = (y0 + y1) / 2 - (c.y0 + c.y1) / 2;
    return Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9 ? [] : [trasladar(e, dx, dy)];
  });
}

/** Reparte los elementos con la misma separación entre sus centros (los de los extremos no se mueven). */
export function distribuir(sel: readonly Elemento[], modo: Distribucion): Elemento[] {
  if (sel.length < 3) return [];
  const centro = (e: Elemento): number => {
    const c = cajaGeometrica(e);
    return modo === 'horizontal' ? (c.x0 + c.x1) / 2 : (c.y0 + c.y1) / 2;
  };
  const orden = [...sel].sort((a, b) => centro(a) - centro(b));
  const ini = centro(orden[0]!);
  const paso = (centro(orden.at(-1)!) - ini) / (orden.length - 1);
  return orden.slice(1, -1).flatMap((e, k) => {
    const d = ini + (k + 1) * paso - centro(e);
    if (Math.abs(d) < 1e-9) return [];
    return [modo === 'horizontal' ? trasladar(e, d, 0) : trasladar(e, 0, d)];
  });
}

const girarPunto = (p: Punto, c: Punto, ang: number): Punto => {
  const co = Math.cos(ang);
  const si = Math.sin(ang);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: r4(c.x + dx * co - dy * si), y: r4(c.y + dx * si + dy * co) };
};

/**
 * Gira los elementos `ang` radianes (positivo: antihorario) en torno al centro del conjunto: un bloque gira sobre sí
 * mismo (y su centro alrededor del conjunto); los segmentos giran sus extremos. Esferas y poleas solo se trasladan.
 */
export function rotar(sel: readonly Elemento[], ang: number): Elemento[] {
  if (sel.length === 0) return [];
  const cajas = sel.map(cajaGeometrica);
  const c = {
    x: (Math.min(...cajas.map((k) => k.x0)) + Math.max(...cajas.map((k) => k.x1))) / 2,
    y: (Math.min(...cajas.map((k) => k.y0)) + Math.max(...cajas.map((k) => k.y1))) / 2,
  };
  return sel.flatMap((e): Elemento[] => {
    switch (e.tipo) {
      case 'bloque':
        return [{ ...e, centro: girarPunto(e.centro, c, ang), angulo: r4(e.angulo + ang) }];
      case 'esfera':
      case 'polea':
        return [{ ...e, centro: girarPunto(e.centro, c, ang) }];
      case 'superficie':
      case 'cuerda':
      case 'resorte':
      case 'vector':
      case 'linea':
      case 'flecha':
        return [{ ...e, a: girarPunto(e.a, c, ang), b: girarPunto(e.b, c, ang) }];
      default:
        return [];
    }
  });
}

/**
 * Copias de los elementos, corridas `d`, con identificadores nuevos. Las referencias entre elementos copiados (uniones,
 * pasos por poleas, apoyos, montajes, el cuerpo de un vector) apuntan a las copias; las que van a elementos que no se
 * copiaron se conservan (un bloque copiado sigue apoyado en el mismo piso).
 */
export function duplicar(sel: readonly Elemento[], d: Punto): Elemento[] {
  const nuevos = new Map(sel.map((e) => [e.id, nuevoIdElemento()]));
  const id = (x: string): string => nuevos.get(x) ?? x;
  return sel.map((e0) => {
    const e = { ...trasladar(e0, d.x, d.y), id: id(e0.id) } as Elemento;
    switch (e.tipo) {
      case 'bloque':
      case 'esfera':
        return e.apoyo ? { ...e, apoyo: e.apoyo.map(id) } : e;
      case 'polea':
        return e.montaje ? { ...e, montaje: { ...e.montaje, el: id(e.montaje.el) } } : e;
      case 'vector':
        return e.cuerpo ? { ...e, cuerpo: id(e.cuerpo) } : e;
      case 'cuerda': {
        const union = e.union?.map((u) => (u && 'el' in u ? { ...u, el: id(u.el) } : u)) as typeof e.union;
        const ruta = e.ruta?.map((p) => ({ ...p, el: id(p.el) }));
        const { camino: _, ...resto } = e;
        void _;
        return { ...resto, ...(union ? { union } : {}), ...(ruta ? { ruta } : {}) };
      }
      case 'resorte': {
        const union = e.union?.map((u) => (u && 'el' in u ? { ...u, el: id(u.el) } : u)) as typeof e.union;
        return union ? { ...e, union } : e;
      }
      default:
        return e;
    }
  });
}

/** Dónde poner una copia: a la derecha de lo seleccionado, separada 30 cm (para que no se superpongan). */
export function desplazamientoCopia(sel: readonly Elemento[]): Punto {
  if (sel.length === 0) return { x: 0.3, y: 0 };
  const cajas = sel.map(cajaGeometrica);
  const ancho = Math.max(...cajas.map((c) => c.x1)) - Math.min(...cajas.map((c) => c.x0));
  return { x: r4(ancho + 0.3), y: 0 };
}

/** Lleva un elemento a la rejilla de paso `paso` (m): el centro de un cuerpo, o los extremos de un segmento. */
export function alRejilla<T extends Elemento>(e: T, paso: number): T {
  const q = (n: number): number => r4(Math.round(n / paso) * paso);
  const p = (x: Punto): Punto => ({ x: q(x.x), y: q(x.y) });
  switch (e.tipo) {
    case 'bloque':
    case 'esfera':
    case 'polea':
      return { ...e, centro: p(e.centro) };
    case 'superficie':
    case 'vector':
    case 'linea':
    case 'flecha':
    case 'rect':
    case 'elipse':
      return { ...e, a: p(e.a), b: p(e.b) };
    case 'cuerda':
    case 'resorte': {
      // Los extremos unidos los decide su unión; los sueltos van a la rejilla.
      const u = e.union;
      return { ...e, a: u?.[0] ? e.a : p(e.a), b: u?.[1] ? e.b : p(e.b) };
    }
    default:
      return e;
  }
}
