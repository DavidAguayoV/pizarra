import type { Punto } from '../core/camara';
import type { Elemento, Trazo, Vector } from '../core/elementos';
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

function flecha(id: string, rol: 'velocidad' | 'acel', origen: Punto, vec: Punto): Vector | null {
  const mod = Math.hypot(vec.x, vec.y);
  if (mod < 1e-3) return null;
  const porMetro = Math.max(POR_METRO, mod / LARGO_MAX);
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
  return crearVector(rol, origen, { x: r4(origen.x + vec.x / porMetro), y: r4(origen.y + vec.y / porMetro) }, {
    id,
    porMetro,
    unidad: rol === 'velocidad' ? 'm/s' : 'm/s²',
    etiqueta: rol === 'velocidad' ? '\\vec{v}' : '\\vec{a}',
    etiquetaEn: 'punta',
  });
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
    cuerpos.push({ ...c.elemento, centro: { ...e.p[i]! } });
    ocultos.add(c.id);
    if (op.vectores) {
      const v = flecha(`sim-v-${c.id}`, 'velocidad', e.p[i]!, e.v[i]!);
      const a = flecha(`sim-a-${c.id}`, 'acel', e.p[i]!, e.a[i]!);
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
    }
  }

  // Orden de dibujo: cuerdas y resortes, cuerpos y, encima, vectores. La trayectoria va debajo de todo.
  const red = [...otros, ...cuerpos, ...vectores];
  return { locales: [...trayectorias, ...red], red, ocultos };
}
