import type { Punto } from '../core/camara';
import type { Tramo } from '../core/elementos';

/**
 * Geometría de una cuerda que pasa por poleas: tramos rectos tangentes a cada polea y arcos de contacto.
 *
 * Convención: al recorrer la cuerda (de `a` a `b`), una polea envuelta en sentido antihorario (`s = 1`) queda a la
 * **izquierda** de la dirección de avance; en sentido horario (`s = −1`), a la derecha. Si u es la dirección de un
 * tramo y n = (−u.y, u.x) su normal izquierda, el punto de contacto con un círculo (c, r, s) es `c − s r n`.
 * Para dos círculos consecutivos eso da la condición `(c₂ − c₁)·n = s₂ r₂ − s₁ r₁`, que fija el ángulo del tramo.
 * Un punto es un círculo de radio 0. Todo es puro y sin estado.
 */

export type PasoGeo =
  /** Polea (o borde, con r = 0) envuelta en sentido s. `cuerpo`: polea móvil, montada sobre ese cuerpo. */
  | { k: 'circulo'; c: Punto; r: number; s: 1 | -1; cuerpo?: { id: string; desp: Punto } }
  /** Paso de un proyecto v1: la cuerda llega a `p[0]` y sale de `p[1]` (lo que hay entre medio no cuenta). */
  | { k: 'fijos'; p: [Punto, Punto] };

export interface GeometriaRuta {
  tramos: Tramo[];
  /** Largo total: tramos rectos + arcos (sin lo que hay entre los dos puntos de un paso `fijos`). */
  largo: number;
  /** Punto donde el primer tramo deja de ser recto, visto desde `a` (el punto al que tira la cuerda en `a`). */
  haciaA: Punto;
  /** Ídem desde `b`. */
  haciaB: Punto;
  /** false si algún tramo no existe (un extremo dentro de una polea, poleas que se tocan): se usan rectas a los centros. */
  valida: boolean;
  /**
   * Por cada paso: dónde llega y sale la cuerda, y los puntos hacia los que tiran los dos tramos (el contacto anterior y
   * el siguiente). `grad` = ∂(largo)/∂(centro): lo que se alarga la cuerda si la polea se mueve (e_entra − e_sale).
   */
  nodos: Array<{ llega: Punto; sale: Punto; desde: Punto; hasta: Punto; grad: Punto }>;
}

interface Nodo {
  c: Punto;
  r: number;
  s: 1 | -1;
}

const DOS_PI = 2 * Math.PI;

/** Tramo tangente de n1 a n2: puntos de contacto, o null si no existe. */
export function tangente(n1: Nodo, n2: Nodo): { t1: Punto; t2: Punto } | null {
  const dx = n2.c.x - n1.c.x;
  const dy = n2.c.y - n1.c.y;
  const d = Math.hypot(dx, dy);
  const k = n2.s * n2.r - n1.s * n1.r;
  if (d < 1e-12 || Math.abs(k) > d) return null;
  const theta = Math.atan2(dy, dx) - Math.asin(k / d);
  const nx = -Math.sin(theta);
  const ny = Math.cos(theta);
  return {
    t1: { x: n1.c.x - n1.s * n1.r * nx, y: n1.c.y - n1.s * n1.r * ny },
    t2: { x: n2.c.x - n2.s * n2.r * nx, y: n2.c.y - n2.s * n2.r * ny },
  };
}

/** Barrido (con signo) que va del ángulo `desde` al ángulo `hasta` girando en el sentido s, en [0, 2π) en valor absoluto. */
export function barrido(desde: number, hasta: number, s: 1 | -1): number {
  const x = (((s * (hasta - desde)) % DOS_PI) + DOS_PI) % DOS_PI;
  return s * x;
}

/** Camino de la cuerda de `a` a `b` pasando por `pasos`. */
export function geometriaRuta(a: Punto, pasos: readonly PasoGeo[], b: Punto): GeometriaRuta {
  // Se encadenan "segmentos libres" entre nodos. Un paso `fijos` corta la cadena: la cuerda llega a p[0] y
  // vuelve a salir desde p[1].
  const tramos: Tramo[] = [];
  let largo = 0;
  let valida = true;
  const llegadas: Array<Punto | null> = pasos.map(() => null);
  const salidas: Array<Punto | null> = pasos.map(() => null);

  const nodoDe = (i: number, rol: 'llega' | 'sale'): Nodo => {
    if (i < 0) return { c: a, r: 0, s: 1 };
    if (i >= pasos.length) return { c: b, r: 0, s: 1 };
    const p = pasos[i]!;
    if (p.k === 'fijos') return { c: rol === 'llega' ? p.p[0] : p.p[1], r: 0, s: 1 };
    return { c: p.c, r: p.r, s: p.s };
  };

  let haciaA: Punto = b;
  let haciaB: Punto = a;
  for (let i = -1; i < pasos.length; i++) {
    const n1 = nodoDe(i, 'sale');
    const n2 = nodoDe(i + 1, 'llega');
    let t = tangente(n1, n2);
    if (!t) {
      valida = false;
      t = { t1: n1.c, t2: n2.c };
    }
    tramos.push({ k: 'recta', a: t.t1, b: t.t2 });
    largo += Math.hypot(t.t2.x - t.t1.x, t.t2.y - t.t1.y);
    if (i >= 0) salidas[i] = t.t1;
    if (i + 1 < pasos.length) llegadas[i + 1] = t.t2;
    if (i === -1) haciaA = t.t2;
    if (i === pasos.length - 1) haciaB = t.t1;
  }

  // Arcos de contacto (en orden, intercalados con las rectas).
  const conArcos: Tramo[] = [tramos[0]!];
  pasos.forEach((p, i) => {
    if (p.k === 'circulo' && p.r > 0) {
      const desde = Math.atan2(llegadas[i]!.y - p.c.y, llegadas[i]!.x - p.c.x);
      const hasta = Math.atan2(salidas[i]!.y - p.c.y, salidas[i]!.x - p.c.x);
      const bar = barrido(desde, hasta, p.s);
      conArcos.push({ k: 'arco', c: p.c, r: p.r, desde, barrido: bar });
      largo += Math.abs(bar) * p.r;
    }
    conArcos.push(tramos[i + 1]!);
  });
  // Nodos: para cada paso, los extremos de sus tramos vecinos (el tramo que llega y el que sale).
  const rectas = tramos as Array<Extract<Tramo, { k: 'recta' }>>;
  const unit = (de: Punto, a: Punto): Punto => {
    const l = Math.hypot(a.x - de.x, a.y - de.y) || 1e-12;
    return { x: (a.x - de.x) / l, y: (a.y - de.y) / l };
  };
  const nodos = pasos.map((_, i) => {
    const entra = rectas[i]!;
    const sale = rectas[i + 1]!;
    const eIn = unit(entra.a, entra.b);
    const eOut = unit(sale.a, sale.b);
    return { llega: entra.b, sale: sale.a, desde: entra.a, hasta: sale.b, grad: { x: eIn.x - eOut.x, y: eIn.y - eOut.y } };
  });
  return { tramos: conArcos, largo, haciaA, haciaB, valida, nodos };
}

/**
 * Sentido en que una cuerda que va de `desde` a `hasta` envuelve una polea con centro `c`: si el camino
 * desde → c → hasta dobla a la derecha, la polea queda a la derecha (sentido horario, −1).
 */
export function sentidoNatural(desde: Punto, c: Punto, hasta: Punto): 1 | -1 {
  const cruz = (c.x - desde.x) * (hasta.y - c.y) - (c.y - desde.y) * (hasta.x - c.x);
  return cruz < 0 ? -1 : 1;
}
