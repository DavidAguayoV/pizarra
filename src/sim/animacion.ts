import type { Punto } from '../core/camara';
import type { Bloque, Elemento, Esfera, Trazo, Vector } from '../core/elementos';
import { apoyoEn } from '../physics/dcl';
import { resolverEscena } from '../grafo/resolver';
import { completarV1 } from '../grafo/v1';
import { crearVector } from '../physics/vectores';
import type { Simulacion } from './motor';
import { decimar } from './series';

/**
 * Lo que se dibuja mientras corre la simulación: copias de los cuerpos, resortes y cuerdas en su posición
 * actual (los originales se ocultan), más los vectores velocidad y aceleración y la trayectoria.
 * Son elementos corrientes: el lienzo los dibuja y la transmisión en vivo los envía como cualquier otro.
 */

export interface OpcionesAnimacion {
  vectores: boolean;
  trayectoria: boolean;
}

export interface Animacion {
  /** Todo lo que se ve en esta pizarra. */
  locales: Elemento[];
  /** Lo mismo sin la trayectoria (que pesa y no vale la pena enviar 20 veces por segundo). */
  red: Elemento[];
  /** Ids de los originales que se reemplazan por sus copias animadas. */
  ocultos: Set<string>;
}

/** Longitud máxima de las flechas de v y a, en metros de pizarra. */
const LARGO_MAX = 2.5;
/** Escala base: m/s por metro de flecha (igual para v y a, como en los videos). */
const POR_METRO = 2;

function flecha(id: string, rol: 'velocidad' | 'acel', origen: Punto, vec: Punto, lado: 'izq' | 'der' | 'punta'): Vector | null {
  const mod = Math.hypot(vec.x, vec.y);
  if (mod < 1e-3) return null;
  const porMetro = Math.max(POR_METRO, mod / LARGO_MAX);
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
  return crearVector(rol, origen, { x: r4(origen.x + vec.x / porMetro), y: r4(origen.y + vec.y / porMetro) }, {
    id,
    porMetro,
    unidad: rol === 'velocidad' ? 'm/s' : 'm/s²',
    etiqueta: rol === 'velocidad' ? '\\vec{v}' : '\\vec{a}',
    // El valor se ve en vivo, al costado de la flecha y hacia afuera (no se monta con la otra flecha).
    mostrarValor: true,
    etiquetaEn: lado,
    halo: true,
    grosor: 0.035,
  });
}

/** Separación (m) entre el borde del cuerpo y el origen de la flecha, y corrimiento a un costado del centro. */
const HOLGURA = 0.04;
const SEPARACION = 0.12;

/**
 * Origen de una flecha de v o a: en el borde del cuerpo, en la dirección del vector, corrido de costado (`lado` = ±1)
 * cuando hay que separarla de otra paralela.
 */
function origenFuera(cuerpo: Bloque | Esfera, centro: Punto, vec: Punto, lado: number): Punto {
  const l = Math.hypot(vec.x, vec.y);
  if (l < 1e-9) return centro;
  const u = { x: vec.x / l, y: vec.y / l };
  const d = apoyoEn(cuerpo, u) + HOLGURA;
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
  return { x: r4(centro.x + u.x * d - u.y * lado * SEPARACION), y: r4(centro.y + u.y * d + u.x * lado * SEPARACION) };
}

export function elementosAnimados(sim: Simulacion, escena: readonly Elemento[], op: OpcionesAnimacion): Animacion {
  const m = sim.modelo;
  const e = sim.estado;
  const ocultos = new Set<string>();
  const cuerpos: Elemento[] = [];
  const otros: Elemento[] = [];
  const vectores: Elemento[] = [];
  const trayectorias: Elemento[] = [];

  m.cuerpos.forEach((c, i) => {
    // Un cuerpo que gira: el bloque con su ángulo; la esfera con el radio marcado.
    const giro = c.I > 0 ? e.th[i]! : null;
    const el = c.elemento;
    if (el.tipo === 'bloque') cuerpos.push({ ...el, centro: { ...e.p[i]! }, ...(giro !== null ? { angulo: giro } : {}) });
    else cuerpos.push({ ...el, centro: { ...e.p[i]! }, ...(giro !== null ? { giro } : {}) });
    ocultos.add(c.id);
    if (op.vectores) {
      // Las flechas nacen en el borde del cuerpo (no tapan su etiqueta) y, si v y a apuntan casi para el mismo
      // lado, se separan un poco de costado para que no se monten.
      // Siempre corridas a un costado del centro: por el centro suele llegar la cuerda. v a la izquierda de su
      // dirección y a a la derecha; si son casi paralelas, quedan una a cada lado y sus etiquetas, hacia afuera.
      const vv = e.v[i]!;
      const aa = e.a[i]!;
      const lv = Math.hypot(vv.x, vv.y);
      const la = Math.hypot(aa.x, aa.y);
      const antiparalelas = lv > 1e-3 && la > 1e-3 && (vv.x * aa.x + vv.y * aa.y) / (lv * la) < -Math.cos((25 * Math.PI) / 180);
      const v = flecha(`sim-v-${c.id}`, 'velocidad', origenFuera(c.elemento, e.p[i]!, vv, 1), vv, 'izq');
      // Si a apunta al revés que v, «su derecha» queda del mismo lado que la izquierda de v: se invierte.
      const a = flecha(`sim-a-${c.id}`, 'acel', origenFuera(c.elemento, e.p[i]!, aa, antiparalelas ? 1 : -1), aa, antiparalelas ? 'izq' : 'der');
      if (v) vectores.push(v);
      if (a) vectores.push(a);
    }
    if (op.trayectoria) {
      const puntos: number[] = [];
      for (const mu of decimar(sim.historial, 300)) puntos.push(Math.round(mu.cuerpos[i]!.x * 1e4) / 1e4, Math.round(mu.cuerpos[i]!.y * 1e4) / 1e4, 0.5);
      puntos.push(Math.round(e.p[i]!.x * 1e4) / 1e4, Math.round(e.p[i]!.y * 1e4) / 1e4, 0.5);
      if (puntos.length >= 6) {
        const t: Trazo = { id: `sim-tray-${c.id}`, tipo: 'trazo', color: 'acento', grosor: 0.025, puntos, resaltador: false };
        trayectorias.push(t);
      }
    }
  });

  // Cuerdas y resortes: se resuelven de nuevo con los cuerpos en su posición actual (la geometría de lo unido se
  // deriva del grafo), así que siguen a los cuerpos, pasan por sus poleas y conservan su estilo.
  // Las poleas con masa giran con la cuerda.
  const giros = new Map(m.rotores.map((r, k) => [r.id, e.rot[k]!]));
  const animados = new Map(cuerpos.map((c) => [c.id, c]));
  const escenaAnimada = completarV1(escena).map((x) => animados.get(x.id) ?? x);
  const enModelo = new Set([...m.resortes.map((r) => r.id), ...m.cuerdas.flatMap((c) => c.ids)]);
  // Una escena v1 sin migrar puede tener cuerdas que la migración fundió en otra: se ocultan también.
  const quedan = new Set(escenaAnimada.map((x) => x.id));
  for (const x of escena) if (!quedan.has(x.id)) ocultos.add(x.id);
  for (const x of resolverEscena(escenaAnimada)) {
    const movil = x.tipo === 'polea' && x.montaje !== undefined && animados.has(x.montaje.el);
    if (((x.tipo === 'cuerda' || x.tipo === 'resorte') && enModelo.has(x.id)) || movil) {
      otros.push(x);
      ocultos.add(x.id);
    } else if (x.tipo === 'polea' && giros.has(x.id)) {
      otros.push({ ...x, giro: giros.get(x.id)! });
      ocultos.add(x.id);
    }
  }

  // Orden de dibujo: cuerdas y resortes, cuerpos y, encima, vectores. La trayectoria va debajo de todo.
  const red = [...otros, ...cuerpos, ...vectores];
  return { locales: [...trayectorias, ...red], red, ocultos };
}
