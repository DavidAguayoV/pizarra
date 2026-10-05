import type { Elemento } from '../src/core/elementos';
import { crearBloque, crearCuerda, crearEsfera, crearPolea, crearResorte, crearSuperficie, normalSuperficie } from '../src/physics/objetos';
import { crearVector } from '../src/physics/vectores';

/**
 * Escenas de referencia de la versión 1 (uniones deducidas por cercanía). Sirven para comprobar que la
 * migración al modelo de grafo (v2) simula y plantea el DCL **igual** que antes. Ids fijos: los resultados
 * guardados en `tests/golden/v1-referencia.json` se comparan por id.
 *
 * Incluye a propósito los casos frágiles de la auditoría (docs/AUDITORIA_NIVEL2.md §4): la migración debe
 * conservarlos tal cual, aunque den una física distinta de la que se quiso dibujar.
 */

export interface EscenaV1 {
  nombre: string;
  elementos: Elemento[];
  /** Duración a simular (s). */
  t: number;
}

const b = (id: string, x: number, y: number, ancho: number, alto: number, extra: Partial<Parameters<typeof crearBloque>[3]> = {}) =>
  crearBloque({ x, y }, ancho, alto, { id, ...extra });

function plano(thetaDeg: number, muS: number, muK: number, v0 = 0): Elemento[] {
  const th = (thetaDeg * Math.PI) / 180;
  const a = { x: -4, y: -2 };
  const sup = crearSuperficie(a, { x: a.x + 12 * Math.cos(th), y: a.y + 12 * Math.sin(th) }, { id: 'sp', muS, muK });
  const n = normalSuperficie(sup);
  const alto = 0.4;
  const u = 3;
  return [
    sup,
    crearBloque({ x: a.x + u * Math.cos(th) + n.x * (alto / 2), y: a.y + u * Math.sin(th) + n.y * (alto / 2) }, 0.6, alto, {
      id: 'bp',
      masa: 2,
      angulo: th,
      v0: { x: v0 * Math.cos(th), y: v0 * Math.sin(th) },
    }),
  ];
}

function atwood(off = 0, fin: (lado: number) => { x: number; y: number } = (l) => ({ x: 0.3 * l, y: 1.4 })): Elemento[] {
  return [
    crearPolea({ x: 0, y: 1.4 }, 0.3, { id: 'pa' }),
    crearCuerda(fin(-1), { x: -0.3, y: -0.4 + off }, { id: 'ca1' }),
    crearCuerda(fin(1), { x: 0.3, y: 0.1 + off }, { id: 'ca2' }),
    b('ba1', -0.3, -0.6, 0.4, 0.4, { masa: 3, etiqueta: 'm_1' }),
    b('ba2', 0.3, -0.1, 0.4, 0.4, { masa: 2, etiqueta: 'm_2' }),
  ];
}

function planoPolea(): Elemento[] {
  const th = Math.PI / 6;
  const A = { x: -3, y: 0 };
  const B = { x: A.x + 3 * Math.cos(th), y: A.y + 3 * Math.sin(th) };
  const sup = crearSuperficie(A, B, { id: 'spp', muS: 0.15, muK: 0.1, relleno: 'cuna' });
  const n = normalSuperficie(sup);
  const c = { x: A.x + 1.5 * Math.cos(th) + n.x * 0.2, y: A.y + 1.5 * Math.sin(th) + n.y * 0.2 };
  const P = { x: B.x, y: B.y + 0.3 };
  const cara = { x: c.x + 0.3 * Math.cos(th), y: c.y + 0.3 * Math.sin(th) };
  return [
    sup,
    crearBloque(c, 0.6, 0.4, { id: 'bpp1', masa: 2, angulo: th }),
    crearPolea(P, 0.3, { id: 'ppp' }),
    crearCuerda(cara, { x: P.x - 0.3, y: P.y }, { id: 'cpp1' }),
    crearCuerda({ x: P.x + 0.3, y: P.y }, { x: P.x + 0.3, y: P.y - 1.5 }, { id: 'cpp2' }),
    crearBloque({ x: P.x + 0.3, y: P.y - 1.7 }, 0.4, 0.4, { id: 'bpp2', masa: 3 }),
  ];
}

export const ESCENAS_V1: EscenaV1[] = [
  { nombre: 'caída libre', t: 0.5, elementos: [b('b1', 0, 3, 0.4, 0.4)] },
  { nombre: 'proyectil al suelo', t: 1.2, elementos: [crearSuperficie({ x: -2, y: 0 }, { x: 8, y: 0 }, { id: 's1' }), crearEsfera({ x: 0, y: 0.25 }, 0.25, { id: 'q1', masa: 1, v0: { x: 3, y: 4 } })] },
  { nombre: 'plano con roce, desliza', t: 0.6, elementos: plano(35, 0.3, 0.2) },
  { nombre: 'plano con roce, reposo', t: 0.3, elementos: plano(10, 0.4, 0.3) },
  { nombre: 'plano: sube, se detiene y vuelve', t: 1.5, elementos: plano(30, 0.2, 0.1, 3) },
  {
    nombre: 'piso con fuerza aplicada',
    t: 0.5,
    elementos: [
      crearSuperficie({ x: -3, y: 0 }, { x: 6, y: 0 }, { id: 's1', muS: 0.5, muK: 0.3 }),
      b('b1', 0, 0.2, 0.4, 0.4, { masa: 5 }),
      crearVector('aplicada', { x: 0, y: 0.2 }, { x: 3, y: 0.2 }, { id: 'v1', porMetro: 10 }),
    ],
  },
  {
    nombre: 'vector a 12 cm del cuerpo',
    t: 0.3,
    elementos: [crearSuperficie({ x: -3, y: 0 }, { x: 6, y: 0 }, { id: 's1' }), b('b1', 0, 0.2, 0.4, 0.4, { masa: 2 }), crearVector('aplicada', { x: 0.32, y: 0.2 }, { x: 1.32, y: 0.2 }, { id: 'v1', porMetro: 10 })],
  },
  {
    nombre: 'masa-resorte horizontal',
    t: 1,
    elementos: [
      crearSuperficie({ x: -3, y: 0 }, { x: 6, y: 0 }, { id: 's1' }),
      b('b1', 1.2, 0.2, 0.4, 0.4, { masa: 2 }),
      crearResorte({ x: -1, y: 0.2 }, { x: 1, y: 0.2 }, { id: 'r1', k: 50, largoNatural: 1.6 }),
    ],
  },
  {
    nombre: 'resorte vertical',
    t: 1,
    elementos: [crearResorte({ x: 0, y: 3 }, { x: 0, y: 1.2 }, { id: 'r1', k: 40, largoNatural: 1.5 }), crearEsfera({ x: 0, y: 1 }, 0.2, { id: 'q1', masa: 1 })],
  },
  { nombre: 'Atwood bien puesto', t: 0.5, elementos: atwood() },
  { nombre: 'Atwood, extremo a 8 cm', t: 0.5, elementos: atwood(0.08) },
  { nombre: 'Atwood, extremo a 10 cm (se ignora)', t: 0.5, elementos: atwood(0.1) },
  { nombre: 'Atwood, cuerdas al centro de la polea', t: 0.5, elementos: atwood(0, () => ({ x: 0, y: 1.4 })) },
  { nombre: 'Atwood, cuerdas arriba de la polea', t: 0.5, elementos: atwood(0, (l) => ({ x: 0.05 * l, y: 1.7 })) },
  { nombre: 'Atwood, una cuerda lejos de la polea', t: 0.5, elementos: atwood(0, (l) => (l < 0 ? { x: -0.46, y: 1.4 } : { x: 0.3, y: 1.4 })) },
  { nombre: 'Atwood + cuerda del techo', t: 0.5, elementos: [...atwood(), crearCuerda({ x: 0, y: 1.7 }, { x: 0, y: 2.5 }, { id: 'ct' })] },
  {
    nombre: 'mesa con roce + polea + colgante',
    t: 0.6,
    elementos: [
      crearSuperficie({ x: -3, y: 0 }, { x: 0.4, y: 0 }, { id: 's1', muS: 0.3, muK: 0.2 }),
      b('b1', -1, 0.2, 0.4, 0.4, { masa: 2, etiqueta: 'm_1' }),
      crearPolea({ x: 0.7, y: 0.2 }, 0.3, { id: 'p1' }),
      crearCuerda({ x: -0.8, y: 0.2 }, { x: 0.4, y: 0.2 }, { id: 'c1' }),
      crearCuerda({ x: 1, y: 0.2 }, { x: 1, y: -0.9 }, { id: 'c2' }),
      b('b2', 1, -1.1, 0.4, 0.4, { masa: 3, etiqueta: 'm_2' }),
    ],
  },
  { nombre: 'plano + polea + colgante', t: 0.6, elementos: planoPolea() },
  { nombre: 'péndulo', t: 1.5, elementos: [crearCuerda({ x: 0, y: 3 }, { x: 1, y: 1.4 }, { id: 'c1' }), crearEsfera({ x: 1.11, y: 1.22 }, 0.2, { id: 'q1', masa: 1 })] },
  {
    nombre: 'péndulo lanzado (se afloja y se tensa)',
    t: 1.5,
    elementos: [crearEsfera({ x: 0, y: 0.8 }, 0.2, { id: 'q1', masa: 1, v0: { x: Math.sqrt(3 * 9.8 * 2.2), y: 0 } }), crearCuerda({ x: 0, y: 3 }, { x: 0, y: 1 }, { id: 'c1' })],
  },
  {
    nombre: 'dos poleas',
    t: 0.5,
    elementos: [
      crearPolea({ x: -1, y: 2 }, 0.2, { id: 'p1' }),
      crearPolea({ x: 1, y: 2 }, 0.2, { id: 'p2' }),
      crearCuerda({ x: -1.2, y: 2 }, { x: -1.2, y: 0.2 }, { id: 'c1' }),
      crearCuerda({ x: -0.8, y: 2.2 }, { x: 0.8, y: 2.2 }, { id: 'c2' }),
      crearCuerda({ x: 1.2, y: 2 }, { x: 1.2, y: 0.2 }, { id: 'c3' }),
      b('b1', -1.2, 0, 0.4, 0.4, { masa: 3 }),
      b('b2', 1.2, 0, 0.4, 0.4, { masa: 2 }),
    ],
  },
  {
    nombre: 'polea móvil',
    t: 0.5,
    elementos: [
      crearCuerda({ x: -0.3, y: 3 }, { x: -0.3, y: 1 }, { id: 'c1' }),
      crearPolea({ x: 0, y: 1 }, 0.3, { id: 'p1' }),
      crearCuerda({ x: 0.3, y: 1 }, { x: 0.3, y: 3 }, { id: 'c2' }),
      crearCuerda({ x: 0, y: 0.7 }, { x: 0, y: 0.2 }, { id: 'c3' }),
      b('b1', 0, 0, 0.4, 0.4, { masa: 2 }),
    ],
  },
  {
    nombre: 'bloques apilados',
    t: 0.5,
    elementos: [crearSuperficie({ x: -2, y: 0 }, { x: 2, y: 0 }, { id: 's1' }), b('b1', 0, 0.2, 1, 0.4, { masa: 2 }), b('b2', 0, 0.6, 0.5, 0.4, { masa: 1 })],
  },
  {
    nombre: 'esquina piso-pared',
    t: 0.3,
    elementos: [
      crearSuperficie({ x: -2, y: 0 }, { x: 2, y: 0 }, { id: 's1' }),
      crearSuperficie({ x: -1, y: 2 }, { x: -1, y: 0 }, { id: 's2' }),
      b('b1', -0.8, 0.2, 0.4, 0.4, { masa: 1 }),
      crearVector('aplicada', { x: -0.8, y: 0.2 }, { x: -1.8, y: 0.2 }, { id: 'v1', porMetro: 10 }),
    ],
  },
  {
    nombre: 'resorte entre dos bloques',
    t: 0.8,
    elementos: [
      crearSuperficie({ x: -3, y: 0 }, { x: 3, y: 0 }, { id: 's1' }),
      b('b1', -1, 0.2, 0.4, 0.4, { masa: 1 }),
      b('b2', 1, 0.2, 0.4, 0.4, { masa: 2 }),
      crearResorte({ x: -0.8, y: 0.2 }, { x: 0.8, y: 0.2 }, { id: 'r1', k: 30, largoNatural: 1.2 }),
    ],
  },
];
