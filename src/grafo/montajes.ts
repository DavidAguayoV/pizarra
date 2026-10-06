import type { Punto } from '../core/camara';
import type { Bloque, Cuerda, Elemento, Esfera, Polea, Resorte, Superficie } from '../core/elementos';
import { trasladar } from '../core/elementos';
import { apoyarEn, crearBloque, crearCuerda, crearEsfera, crearPolea, crearResorte, crearSuperficie, ROCE_POR_DEFECTO } from '../physics/objetos';
import { crearVector } from '../physics/vectores';

/**
 * Biblioteca de montajes (Fase 4): escenas clásicas ya conectadas (uniones, rutas por poleas, apoyos), listas para simular.
 * Cada montaje se arma alrededor del origen con identificadores nuevos y después se traslada al punto pedido; se agrega
 * en una sola op (un deshacer lo quita entero). Las masas se numeran a continuación de las que ya hay en la escena.
 */

export interface OpcionesMontaje {
  /** Superficies con roce (el interruptor «Con roce» de Armar). */
  conRoce?: boolean;
}

export interface Montaje {
  id: string;
  nombre: string;
  descripcion: string;
  crear(escena: readonly Elemento[], op: OpcionesMontaje): Elemento[];
}

const R = 0.25; // radio de la polea y de la esfera
const H = 0.2; // medio alto del bloque

/** Primer número libre para m_k en la escena. */
function proximoIndice(escena: readonly Elemento[]): number {
  let n = 0;
  for (const e of escena) {
    if (e.tipo !== 'bloque' && e.tipo !== 'esfera') continue;
    const m = /^m_\{?(\d+)\}?$/.exec(e.etiqueta.trim());
    n = Math.max(n, m ? Number(m[1]) : 0, e.etiqueta.trim() === 'm' ? 1 : 0);
  }
  return n + 1;
}

const etiqueta = (k: number): string => (k < 10 ? `m_${k}` : `m_{${k}}`);
const roce = (op: OpcionesMontaje) => (op.conRoce ? { ...ROCE_POR_DEFECTO } : {});
const r4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Fracción `u:` de un punto a lo largo de una superficie (para unir un extremo a ella). */
function puertoU(s: Superficie, p: Punto): string {
  const l2 = (s.b.x - s.a.x) ** 2 + (s.b.y - s.a.y) ** 2;
  return `u:${r4(((p.x - s.a.x) * (s.b.x - s.a.x) + (p.y - s.a.y) * (s.b.y - s.a.y)) / l2)}`;
}

function bloque(centro: Punto, k: number, masa: number, extra: Partial<Bloque> = {}): Bloque {
  return { ...crearBloque(centro, 0.5, 0.4, { etiqueta: etiqueta(k), masa, ...extra }), apoyo: extra.apoyo ?? [] };
}

/** Plano inclinado (cuña) de largo `l` y ángulo `th` que parte en `a`, con un bloque apoyado a `u` m de su pie. */
function planoConBloque(a: Punto, l: number, th: number, u: number, k: number, op: OpcionesMontaje): { plano: Superficie; b: Bloque; t: Punto; n: Punto } {
  const t = { x: Math.cos(th), y: Math.sin(th) };
  const n = { x: -t.y, y: t.x };
  const plano = crearSuperficie(a, { x: a.x + l * t.x, y: a.y + l * t.y }, { relleno: 'cuna', ...roce(op) });
  const q = { x: a.x + u * t.x + H * n.x, y: a.y + u * t.y + H * n.y };
  const b = { ...apoyarEn(bloque(q, k, 2), plano), apoyo: [plano.id] };
  return { plano, b, t, n };
}

/**
 * Cuerpo `b` apoyado que tira, a lo largo de la superficie de dirección `t` (normal `n`), de una cuerda que pasa por una
 * polea al final de la superficie `fin` y baja hasta un bloque colgante. La polea queda donde el tramo es paralelo a la
 * superficie (a la altura del centro del cuerpo) y el colgante, justo debajo de su lado de bajada.
 */
function poleaYColgante(b: Bloque, fin: Punto, t: Punto, n: Punto, k: number): Elemento[] {
  // Envoltura horaria (s = −1): el centro queda a r a la derecha del tramo, que va a la altura H sobre la superficie.
  const c = { x: fin.x + 0.35 * t.x + (H - R) * n.x, y: fin.y + 0.35 * t.y + (H - R) * n.y };
  const pol = crearPolea(c, R);
  pol.centro = { x: r4(c.x), y: r4(c.y) };
  const colg = bloque({ x: pol.centro.x + R, y: pol.centro.y - 1.3 }, k, 3);
  const cuerda: Cuerda = {
    ...crearCuerda({ x: b.centro.x + 0.25 * t.x, y: b.centro.y + 0.25 * t.y }, { x: colg.centro.x, y: colg.centro.y + H }),
    union: [
      { el: b.id, puerto: 'cara-der' },
      { el: colg.id, puerto: 'cara-sup' },
    ],
    ruta: [{ el: pol.id, sentido: -1 }],
  };
  return [pol, colg, cuerda];
}

export const MONTAJES: readonly Montaje[] = [
  {
    id: 'atwood',
    nombre: 'Máquina de Atwood',
    descripcion: 'Dos bloques (2 kg y 3 kg) colgando de una polea fija.',
    crear(escena) {
      const k = proximoIndice(escena);
      const pol: Polea = crearPolea({ x: 0, y: 1.5 }, R);
      const b1 = bloque({ x: -R, y: -0.3 }, k, 2);
      const b2 = bloque({ x: R, y: -0.8 }, k + 1, 3);
      const c: Cuerda = {
        ...crearCuerda({ x: -R, y: -0.3 + H }, { x: R, y: -0.8 + H }),
        union: [
          { el: b1.id, puerto: 'cara-sup' },
          { el: b2.id, puerto: 'cara-sup' },
        ],
        ruta: [{ el: pol.id, sentido: -1 }],
      };
      return [pol, b1, b2, c];
    },
  },
  {
    id: 'plano',
    nombre: 'Plano inclinado',
    descripcion: 'Un bloque de 2 kg sobre un plano de 30°.',
    crear(escena, op) {
      const { plano, b } = planoConBloque({ x: -2, y: -1 }, 4, Math.PI / 6, 2.4, proximoIndice(escena), op);
      return [plano, b];
    },
  },
  {
    id: 'plano-polea',
    nombre: 'Plano, polea y colgante',
    descripcion: 'Un bloque en un plano de 30° unido, por una polea en la arista, a otro que cuelga.',
    crear(escena, op) {
      const k = proximoIndice(escena);
      const { plano, b, t, n } = planoConBloque({ x: -2.6, y: -1.2 }, 3, Math.PI / 6, 1.2, k, op);
      return [plano, b, ...poleaYColgante(b, plano.b, t, n, k + 1)];
    },
  },
  {
    id: 'mesa-polea',
    nombre: 'Mesa, polea y colgante',
    descripcion: 'Un bloque sobre una mesa unido, por una polea en el borde, a otro que cuelga.',
    crear(escena, op) {
      const k = proximoIndice(escena);
      const mesa = crearSuperficie({ x: -2.6, y: 0 }, { x: 0, y: 0 }, roce(op));
      const b = bloque({ x: -1.4, y: H }, k, 2, { apoyo: [mesa.id] });
      return [mesa, b, ...poleaYColgante(b, mesa.b, { x: 1, y: 0 }, { x: 0, y: 1 }, k + 1)];
    },
  },
  {
    id: 'resorte-horizontal',
    nombre: 'Masa y resorte (horizontal)',
    descripcion: 'Un bloque unido a una pared por un resorte (k = 50 N/m), estirado 30 cm.',
    crear(escena, op) {
      const piso = crearSuperficie({ x: -2.4, y: -0.5 }, { x: 2.4, y: -0.5 }, roce(op));
      const pared = crearSuperficie({ x: -2, y: 1 }, { x: -2, y: -0.5 });
      const b = bloque({ x: 0, y: -0.5 + H }, proximoIndice(escena), 2, { apoyo: [piso.id] });
      const fijo = { x: -2, y: b.centro.y };
      const res: Resorte = {
        ...crearResorte(fijo, { x: b.centro.x - 0.25, y: b.centro.y }, { k: 50 }),
        largoNatural: 1.45,
        union: [
          { el: pared.id, puerto: puertoU(pared, fijo) },
          { el: b.id, puerto: 'cara-izq' },
        ],
      };
      return [piso, pared, b, res];
    },
  },
  {
    id: 'resorte-vertical',
    nombre: 'Masa y resorte (vertical)',
    descripcion: 'Un bloque que cuelga de un resorte (k = 50 N/m) fijo al techo.',
    crear(escena) {
      const techo = crearSuperficie({ x: 0.8, y: 2 }, { x: -0.8, y: 2 });
      const b = bloque({ x: 0, y: 0.4 }, proximoIndice(escena), 2);
      const res: Resorte = {
        ...crearResorte({ x: 0, y: 2 }, { x: 0, y: 0.4 + H }, { k: 50 }),
        largoNatural: 0.8,
        union: [
          { el: techo.id, puerto: puertoU(techo, { x: 0, y: 2 }) },
          { el: b.id, puerto: 'cara-sup' },
        ],
      };
      return [techo, b, res];
    },
  },
  {
    id: 'pendulo',
    nombre: 'Péndulo',
    descripcion: 'Una esfera de 1 kg colgada de un hilo de 1,2 m, soltada a 30°.',
    crear(escena) {
      const techo = crearSuperficie({ x: 0.6, y: 1.5 }, { x: -0.6, y: 1.5 });
      const th = Math.PI / 6;
      const d = 1.2 + R;
      const esf: Esfera = {
        ...crearEsfera({ x: d * Math.sin(th), y: 1.5 - d * Math.cos(th) }, R, { etiqueta: etiqueta(proximoIndice(escena)), masa: 1 }),
        apoyo: [],
      };
      // El hilo llega al borde de la esfera por el lado del punto de suspensión.
      const g = Math.round(90 + 30);
      const borde = { x: esf.centro.x + R * Math.cos((g * Math.PI) / 180), y: esf.centro.y + R * Math.sin((g * Math.PI) / 180) };
      const hilo: Cuerda = {
        ...crearCuerda({ x: 0, y: 1.5 }, borde),
        union: [
          { el: techo.id, puerto: puertoU(techo, { x: 0, y: 1.5 }) },
          { el: esf.id, puerto: `borde:${g}` },
        ],
      };
      return [techo, esf, hilo];
    },
  },
  {
    id: 'apilados',
    nombre: 'Bloques apilados',
    descripcion: 'Un bloque sobre otro, con roce entre ellos; una fuerza de 15 N tira del de abajo.',
    crear(escena, op) {
      const k = proximoIndice(escena);
      const piso = crearSuperficie({ x: -2.5, y: -0.5 }, { x: 2.5, y: -0.5 }, roce(op));
      const b1 = { ...bloque({ x: -1, y: -0.5 + H }, k, 3, { apoyo: [piso.id] }), ancho: 1 };
      const b2 = bloque({ x: -1, y: -0.5 + 3 * H }, k + 1, 1, { apoyo: [b1.id], muS: 0.4, muK: 0.3 });
      const F = crearVector('aplicada', { x: -0.5, y: b1.centro.y }, { x: 1, y: b1.centro.y }, { porMetro: 10, cuerpo: b1.id, etiqueta: '\\vec{F}' });
      return [piso, b1, b2, F];
    },
  },
  {
    id: 'loop',
    nombre: 'Loop',
    descripcion: 'Una esfera baja por una rampa curva y entra a un loop de 0,8 m de radio.',
    crear(escena, op) {
      // Rampa: cuarto de circunferencia de radio 2,5 tangente al piso; piso; loop de casi una vuelta que parte en el piso.
      const rampa: Superficie = { ...crearSuperficie({ x: -5.5, y: 2.5 }, { x: -3, y: 0 }, roce(op)), barrido: Math.PI / 2 };
      const piso = crearSuperficie({ x: -3, y: 0 }, { x: 0, y: 0 }, roce(op));
      const RL = 0.8;
      const beta = 2 * Math.PI - 0.3;
      const fin = { x: r4(RL * Math.cos(-Math.PI / 2 + beta)), y: r4(RL + RL * Math.sin(-Math.PI / 2 + beta)) };
      // Pista de un solo lado: quien llega por fuera (por el piso, de vuelta) la atraviesa, como en un loop real.
      const loop: Superficie = { ...crearSuperficie({ x: 0, y: 0 }, { x: 0, y: 0 }, { relleno: 'ninguno', ...roce(op) }), b: fin, barrido: r4(beta), unLado: true };
      // La esfera, apoyada en la rampa a 15° de su borde de arriba (su centro a 1,9 m de altura)
      const ang = Math.PI + Math.PI / 12;
      const c = { x: -3 + (2.5 - R) * Math.cos(ang), y: 2.5 + (2.5 - R) * Math.sin(ang) };
      const esf: Esfera = { ...crearEsfera(c, R, { etiqueta: etiqueta(proximoIndice(escena)), masa: 1 }), apoyo: [rampa.id] };
      esf.centro = { x: r4(c.x), y: r4(c.y) };
      return [rampa, piso, loop, esf];
    },
  },
  {
    id: 'valle',
    nombre: 'Valle (media cañería)',
    descripcion: 'Una esfera que oscila dentro de una semicircunferencia de 2 m de radio.',
    crear(escena, op) {
      const valle: Superficie = { ...crearSuperficie({ x: -2, y: 2 }, { x: 2, y: 2 }, roce(op)), barrido: Math.PI };
      const ang = -Math.PI / 2 - 0.7; // 40° del fondo, a la izquierda
      const c = { x: (2 - R) * Math.cos(ang), y: 2 + (2 - R) * Math.sin(ang) };
      const esf: Esfera = { ...crearEsfera(c, R, { etiqueta: etiqueta(proximoIndice(escena)), masa: 1 }), apoyo: [valle.id] };
      esf.centro = { x: r4(c.x), y: r4(c.y) };
      return [valle, esf];
    },
  },
  {
    id: 'loma',
    nombre: 'Loma',
    descripcion: 'Una esfera parte casi quieta en la cima de una loma de 2 m de radio: se despega al bajar.',
    crear(escena, op) {
      const piso = crearSuperficie({ x: -5, y: 0 }, { x: 5, y: 0 }, roce(op));
      const loma: Superficie = { ...crearSuperficie({ x: -2, y: 0 }, { x: 2, y: 0 }, { relleno: 'ninguno', ...roce(op) }), barrido: -Math.PI };
      const esf: Esfera = { ...crearEsfera({ x: 0, y: 2 + R }, R, { etiqueta: etiqueta(proximoIndice(escena)), masa: 1, v0: { x: 0.2, y: 0 } }), apoyo: [loma.id] };
      return [piso, loma, esf];
    },
  },
  {
    id: 'proyectil',
    nombre: 'Proyectil',
    descripcion: 'Una esfera lanzada desde el suelo a 5 m/s y 45°.',
    crear(escena) {
      const piso = crearSuperficie({ x: -3, y: -1 }, { x: 3.5, y: -1 });
      const esf: Esfera = {
        ...crearEsfera({ x: -2.5, y: -1 + R }, R, { etiqueta: etiqueta(proximoIndice(escena)), masa: 1, v0: { x: 3.5355, y: 3.5355 } }),
        apoyo: [piso.id],
      };
      return [piso, esf];
    },
  },
];

/** Los elementos del montaje `id`, trasladados para que su centro quede en `centro`. */
export function crearMontaje(id: string, centro: Punto, escena: readonly Elemento[], op: OpcionesMontaje = {}): Elemento[] {
  const m = MONTAJES.find((x) => x.id === id);
  if (!m) return [];
  return m.crear(escena, op).map((e) => trasladar(e, centro.x, centro.y));
}
