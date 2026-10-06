import type { Punto } from '../core/camara';
import type { Marco } from '../physics/curvas';
import { marcoArco } from '../physics/curvas';
import { apoyoEn } from '../physics/dcl';
import type { PasoGeo } from '../grafo/ruta';
import { geometriaRuta, largosPorPieza } from '../grafo/ruta';
import type { Caracteristica, Par } from './contactos';
import { geoContacto, radioEnvolvente, separacion } from './contactos';
import type { CuerdaDef, Extremo, Modelo } from './modelo';

/**
 * Motor de simulación: RK4 de paso fijo con restricciones, en coordenadas generalizadas.
 *
 * Cada cuerpo tiene tres coordenadas (x, y, θ); el ángulo solo se mueve si el cuerpo **gira** (momento de inercia
 * I > 0: rueda, se balancea, lo hacen girar las cuerdas y los resortes unidos fuera de su centro). Cada **polea con
 * masa** agrega su ángulo. En cada instante se resuelven las fuerzas de restricción por el **sistema reducido**
 *
 *     (J M⁻¹ Jᵀ) λ = γ − J M⁻¹ Q          q̈ = M⁻¹ (Q + Jᵀ λ)
 *
 * de tamaño igual al número de restricciones activas (no al de coordenadas): contacto con una superficie (λ = N ≥ 0),
 * adherencia (roce estático o rodadura sin deslizar: λ = f, con |f| ≤ μs N), cuerdas con o sin poleas (λ = −T, T ≥ 0;
 * una por pieza si pasan por poleas con masa), contacto entre dos cuerpos (λ = N ≥ 0, con su adherencia) y el bloqueo
 * del giro de un bloque apoyado (no se vuelca). El roce cinético (μk N, opuesto al deslizamiento del punto de contacto)
 * se itera con N hasta converger.
 *
 * Los choques entre cuerpos (y contra una superficie, si e > 0) se resuelven con un **impulso** en su instante exacto:
 * la velocidad relativa normal pasa a −e·vₙ y todas las demás restricciones activas se respetan en el mismo impulso.
 * Si no rebota (e = 0, o el rebote sería menor a 5 cm/s), los cuerpos quedan en contacto.
 *
 * Los cambios de régimen (despegue, impacto, estático → cinético, detención, cuerda que se afloja o se tensa, salida
 * por el extremo de una superficie, resorte en su largo natural, cuerpo que llega a la polea) se detectan al final de
 * cada paso y quedan registrados como eventos; el impacto y el tensado de una cuerda, en su instante exacto.
 */

export type TipoEvento =
  | 'impacto'
  | 'despegue'
  | 'sale-extremo'
  | 'detencion'
  | 'estatico-cinetico'
  | 'invierte'
  | 'cuerda-floja'
  | 'cuerda-tensa'
  | 'resorte-natural'
  /** Un cuerpo llega a la polea por la que pasa su cuerda: la simulación se detiene. */
  | 'llega-polea'
  /** Dos cuerpos chocan. */
  | 'choque'
  /** Un cuerpo rebota (e > 0). */
  | 'rebote'
  /** Dos cuerpos en contacto se separan. */
  | 'separa'
  /** Un cuerpo apoyado pasa de una superficie a otra (el pie de un plano, dos tramos de piso seguidos). */
  | 'cambia-superficie';

export interface EventoSim {
  t: number;
  tipo: TipoEvento;
  /** Índice del cuerpo (en `modelo.cuerpos`), o null si es de una cuerda o un resorte. */
  cuerpo: number | null;
  texto: string;
}

export type Modo =
  | { k: 'libre' }
  /** Apoyado en la superficie `s`, deslizando (o a punto de hacerlo en el sentido `dir`). */
  | { k: 'desliza'; s: number; lado: 1 | -1; dir: number }
  /** Apoyado y sin deslizar: en reposo (roce estático) o, si es una esfera que gira, rodando sin deslizar. */
  | { k: 'adherido'; s: number; lado: 1 | -1 };

/** Contacto persistente entre dos cuerpos (ver `contactos.ts`): deslizando o adherido. */
export interface Contacto extends Par {
  k: 'desliza' | 'adherido';
  /** Sentido en que está por deslizar (si parte en reposo relativo). */
  dir: number;
}

export interface Estado {
  t: number;
  p: Punto[];
  v: Punto[];
  /** Aceleración en este instante (la de la última evaluación). */
  a: Punto[];
  /** Ángulo, velocidad angular y aceleración angular de cada cuerpo (no cambian si el cuerpo no gira). */
  th: number[];
  w: number[];
  alfa: number[];
  /** Ángulo y velocidad angular de cada polea con masa. */
  rot: number[];
  wrot: number[];
  modo: Modo[];
  cuerdaActiva: boolean[];
  /** Normal sobre cada cuerpo (0 si está libre). */
  N: number[];
  /** Fuerza de roce a lo largo de la tangente de su superficie (con signo). */
  fric: number[];
  /** Tensión de cada cuerda (0 si está floja); con poleas con masa, la de su primera pieza. */
  T: number[];
  /** Tensión de cada pieza de cada cuerda (una sola si no pasa por poleas con masa). */
  Tp: number[][];
  /**
   * Segunda superficie que toca un cuerpo apoyado (una esquina: el piso y una pared). Sin roce: solo su normal `Nx`.
   */
  extra: Array<{ s: number; lado: 1 | -1 } | null>;
  Nx: number[];
  /** Contactos entre cuerpos, con su normal y su roce (con signo, a lo largo de su tangente). */
  contactos: Contacto[];
  Nc: number[];
  fc: number[];
  /** Trabajo acumulado de las fuerzas no conservativas. */
  W: { roce: number; aplicadas: number; impactos: number };
  /** Elongación anterior de cada resorte (para detectar el largo natural). */
  elong: number[];
}

const EPS_V = 1e-9;
const EPS_F = 1e-9;
const MAX_EVENTOS = 400;
/** Largo mínimo del tramo entre un cuerpo y su polea antes de detener la simulación (m). */
const TRAMO_MINIMO = 0.02;
/** Distancia máxima entre un cuerpo y la superficie de su `apoyo` para respetarlo (la del imán al soltarlo). */
export const APOYO_MAXIMO = 0.3;
/** Velocidad normal mínima de un rebote: por debajo, los cuerpos quedan en contacto (evita infinitos botes). */
const V_REBOTE = 0.05;
/** Separación máxima (m) entre dos cuerpos dibujados en contacto sin `apoyo` explícito. */
const TOCA = 2e-3;

const cero = (): Punto => ({ x: 0, y: 0 });
const dot = (a: Punto, b: Punto): number => a.x * b.x + a.y * b.y;
const cruz = (a: Punto, b: Punto): number => a.x * b.y - a.y * b.x;
const signo = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);
const rotar = (d: Punto, ang: number): Punto => {
  if (ang === 0) return d;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: d.x * c - d.y * s, y: d.x * s + d.y * c };
};

// --- Coordenadas ------------------------------------------------------------------------------------------------

/** Posiciones (centros, ángulos de los cuerpos y de las poleas con masa). */
export interface Pose {
  p: Punto[];
  th: number[];
  rot: number[];
}
/** Velocidades generalizadas. */
interface Vel {
  v: Punto[];
  w: number[];
  wrot: number[];
}

/** Brazo (del centro del cuerpo al punto de unión) de un extremo, girado con el cuerpo si el cuerpo gira. */
export function brazo(m: Modelo, e: Extract<Extremo, { tipo: 'cuerpo' }>, th: readonly number[]): Punto {
  const c = m.cuerpos[e.i]!;
  return c.I > 0 ? rotar(e.desp, th[e.i]! - c.th0) : e.desp;
}

/** Posición de un extremo con los cuerpos en la pose dada. */
export function posExt(m: Modelo, e: Extremo, pose: Pose): Punto {
  if (e.tipo === 'fijo') return e.p;
  const c = pose.p[e.i]!;
  const r = brazo(m, e, pose.th);
  return { x: c.x + r.x, y: c.y + r.y };
}

function velExt(m: Modelo, e: Extremo, pose: Pose, vel: Vel): Punto {
  if (e.tipo === 'fijo') return cero();
  const v = vel.v[e.i]!;
  if (m.cuerpos[e.i]!.I === 0) return v;
  const r = brazo(m, e, pose.th);
  const w = vel.w[e.i]!;
  return { x: v.x - w * r.y, y: v.y + w * r.x };
}

/** Índices de las coordenadas generalizadas: (x, y, θ) por cuerpo y, después, una por polea con masa. */
const dX = (i: number): number => 3 * i;
const dY = (i: number): number => 3 * i + 1;
const dT = (i: number): number => 3 * i + 2;

interface Entrada {
  k: number;
  g: number;
}
interface Fila {
  e: Entrada[];
  gamma: number;
}

/** Entradas de un punto de un cuerpo (o de un extremo fijo, que no tiene) en la dirección u. */
function entradasExtremo(m: Modelo, e: Extremo, u: Punto, pose: Pose, out: Entrada[]): void {
  if (e.tipo !== 'cuerpo') return;
  out.push({ k: dX(e.i), g: u.x }, { k: dY(e.i), g: u.y });
  if (m.cuerpos[e.i]!.I > 0) out.push({ k: dT(e.i), g: cruz(brazo(m, e, pose.th), u) });
}

/** Término centrípeto de la aceleración de un punto que gira con su cuerpo, proyectado: ω² (u · r). */
function centripeto(m: Modelo, e: Extremo, u: Punto, pose: Pose, vel: Vel): number {
  if (e.tipo !== 'cuerpo' || m.cuerpos[e.i]!.I === 0) return 0;
  const w = vel.w[e.i]!;
  return w * w * dot(u, brazo(m, e, pose.th));
}

// --- Cuerdas -----------------------------------------------------------------------------------------------------

/** Pasos de la ruta con el centro de cada polea móvil donde está su cuerpo (girado con él si el cuerpo gira). */
function pasosEn(m: Modelo, c: CuerdaDef, pose: Pose): PasoGeo[] {
  return c.ruta!.map((x) => {
    if (x.k !== 'circulo' || x.i === undefined || !x.cuerpo) return x;
    const cu = m.cuerpos[x.i]!;
    const d = cu.I > 0 ? rotar(x.cuerpo.desp, pose.th[x.i]! - cu.th0) : x.cuerpo.desp;
    return { ...x, c: { x: pose.p[x.i]!.x + d.x, y: pose.p[x.i]!.y + d.y } };
  });
}

/** Valor de la restricción de una cuerda entera (largo geométrico − largo inicial: 0 = tensa; < 0 = floja). */
function valorCuerda(m: Modelo, c: CuerdaDef, pose: Pose): number {
  const q0 = posExt(m, c.ext[0], pose);
  const q1 = posExt(m, c.ext[1], pose);
  if (c.ruta) return geometriaRuta(q0, c.moviles ? pasosEn(m, c, pose) : c.ruta, q1).largo - c.largo;
  return Math.hypot(q0.x - q1.x, q0.y - q1.y) - c.largo;
}

/** La pose avanzada `s` segundos a velocidad constante (para derivar numéricamente a lo largo del movimiento). */
function avanzarPose(pose: Pose, vel: Vel, s: number): Pose {
  return {
    p: pose.p.map((q, i) => ({ x: q.x + s * vel.v[i]!.x, y: q.y + s * vel.v[i]!.y })),
    th: pose.th.map((t, i) => t + s * vel.w[i]!),
    rot: pose.rot.map((r, k) => r + s * vel.wrot[k]!),
  };
}

/** γ = −q̇ᵀ H q̇ de una restricción φ, por diferencia segunda de φ a lo largo de la velocidad. */
function gammaNumerico(f: (pose: Pose) => number, pose: Pose, vel: Vel): number {
  const vmax = Math.max(1e-9, ...vel.v.map((q) => Math.hypot(q.x, q.y)), ...vel.w.map(Math.abs), ...vel.wrot.map(Math.abs));
  const eps = 1e-4 / Math.max(1, vmax);
  return -(f(avanzarPose(pose, vel, eps)) - 2 * f(pose) + f(avanzarPose(pose, vel, -eps))) / (eps * eps);
}

/**
 * Filas de una cuerda: una si es ideal (sin poleas con masa), una por pieza si pasa por poleas con masa. Cada fila trae
 * su valor φ (para corregir la deriva) y, si se pide, su γ.
 */
function filasCuerda(m: Modelo, c: CuerdaDef, pose: Pose, vel: Vel | null): Array<{ fila: Fila; phi: number }> {
  const q0 = posExt(m, c.ext[0], pose);
  const q1 = posExt(m, c.ext[1], pose);
  const conGamma = vel !== null;
  if (!c.ruta) {
    const d = { x: q0.x - q1.x, y: q0.y - q1.y };
    const l = Math.hypot(d.x, d.y) || 1e-12;
    const u = { x: d.x / l, y: d.y / l };
    const um = { x: -u.x, y: -u.y };
    const e: Entrada[] = [];
    entradasExtremo(m, c.ext[0], u, pose, e);
    entradasExtremo(m, c.ext[1], um, pose, e);
    let gamma = 0;
    if (conGamma) {
      const v0 = velExt(m, c.ext[0], pose, vel);
      const v1 = velExt(m, c.ext[1], pose, vel);
      const dv = { x: v0.x - v1.x, y: v0.y - v1.y };
      gamma = -(dot(dv, dv) - dot(u, dv) ** 2) / l + centripeto(m, c.ext[0], u, pose, vel) + centripeto(m, c.ext[1], um, pose, vel);
    }
    return [{ fila: { e, gamma }, phi: l - c.largo }];
  }
  const pasos = c.moviles ? pasosEn(m, c, pose) : c.ruta;
  const geo = geometriaRuta(q0, pasos, q1);
  const unit = (d: Punto): Punto => {
    const l = Math.hypot(d.x, d.y) || 1e-12;
    return { x: d.x / l, y: d.y / l };
  };
  const u0 = unit({ x: q0.x - geo.haciaA.x, y: q0.y - geo.haciaA.y });
  const u1 = unit({ x: q1.x - geo.haciaB.x, y: q1.y - geo.haciaB.y });
  /** Entradas de las poleas móviles cuyos pasos están entre los índices [desde, hasta). */
  const moviles = (desde: number, hasta: number, e: Entrada[]): void => {
    c.ruta!.forEach((x, j) => {
      if (j < desde || j >= hasta || x.k !== 'circulo' || x.i === undefined || !x.cuerpo) return;
      const gr = geo.nodos[j]!.grad;
      e.push({ k: dX(x.i), g: gr.x }, { k: dY(x.i), g: gr.y });
      const cu = m.cuerpos[x.i]!;
      if (cu.I > 0) e.push({ k: dT(x.i), g: cruz(rotar(x.cuerpo.desp, pose.th[x.i]! - cu.th0), gr) });
    });
  };

  if (!c.masivas) {
    const e: Entrada[] = [];
    entradasExtremo(m, c.ext[0], u0, pose, e);
    entradasExtremo(m, c.ext[1], u1, pose, e);
    moviles(0, c.ruta.length, e);
    let gamma = 0;
    if (conGamma) {
      if (c.moviles) gamma = gammaNumerico((ps) => valorCuerda(m, c, ps), pose, vel);
      else {
        // Cada extremo tira hacia su primer punto de contacto con una polea: el resto del largo no depende de él.
        const v0 = velExt(m, c.ext[0], pose, vel);
        const v1 = velExt(m, c.ext[1], pose, vel);
        const l0 = Math.hypot(q0.x - geo.haciaA.x, q0.y - geo.haciaA.y) || 1e-12;
        const l1 = Math.hypot(q1.x - geo.haciaB.x, q1.y - geo.haciaB.y) || 1e-12;
        gamma = -((dot(v0, v0) - dot(u0, v0) ** 2) / l0 + (dot(v1, v1) - dot(u1, v1) ** 2) / l1);
        gamma += centripeto(m, c.ext[0], u0, pose, vel) + centripeto(m, c.ext[1], u1, pose, vel);
      }
    }
    return [{ fila: { e, gamma }, phi: geo.largo - c.largo }];
  }

  // Con poleas con masa: una restricción por pieza, L_k − r_A s_A φ_A + r_B s_B φ_B = L_k(0), con A y B las poleas con
  // masa al comienzo y al final de la pieza (la cuerda no desliza sobre ellas: lo que sale de una pieza entra en la otra).
  const masivas = c.masivas;
  const nr = m.cuerpos.length * 3;
  const valorPieza = (k: number, ps: Pose): number => {
    const a = posExt(m, c.ext[0], ps);
    const b = posExt(m, c.ext[1], ps);
    const g = geometriaRuta(a, c.moviles ? pasosEn(m, c, ps) : c.ruta!, b);
    const L = largosPorPieza(g, masivas)[k]!;
    const A = masivas[k - 1];
    const B = masivas[k];
    return L - (A ? A.r * A.s * ps.rot[A.rotor]! : 0) + (B ? B.r * B.s * ps.rot[B.rotor]! : 0) - c.largos![k]!;
  };
  const out: Array<{ fila: Fila; phi: number }> = [];
  for (let k = 0; k <= masivas.length; k++) {
    const e: Entrada[] = [];
    if (k === 0) entradasExtremo(m, c.ext[0], u0, pose, e);
    if (k === masivas.length) entradasExtremo(m, c.ext[1], u1, pose, e);
    moviles(k === 0 ? 0 : masivas[k - 1]!.j + 1, k === masivas.length ? c.ruta.length : masivas[k]!.j, e);
    const A = masivas[k - 1];
    const B = masivas[k];
    if (A) e.push({ k: nr + A.rotor, g: -A.r * A.s });
    if (B) e.push({ k: nr + B.rotor, g: B.r * B.s });
    out.push({ fila: { e, gamma: conGamma ? gammaNumerico((ps) => valorPieza(k, ps), pose, vel) : 0 }, phi: valorPieza(k, pose) });
  }
  return out;
}

// --- Álgebra lineal densa mínima ------------------------------------------------------------------------

/** Resuelve A x = b por eliminación gaussiana con pivoteo parcial; un pivote nulo (restricción redundante) da 0. */
function resolver(A: number[][], b: number[]): number[] {
  const n = b.length;
  let escala = 0;
  for (let r = 0; r < n; r++) escala = Math.max(escala, Math.abs(A[r]![r]!));
  const tol = 1e-13 * Math.max(escala, 1e-30);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    if (p !== c) {
      [A[c], A[p]] = [A[p]!, A[c]!];
      [b[c], b[p]] = [b[p]!, b[c]!];
    }
    const piv = A[c]![c]!;
    if (Math.abs(piv) < tol) continue;
    for (let r = c + 1; r < n; r++) {
      const f = A[r]![c]! / piv;
      if (f === 0) continue;
      for (let k = c; k < n; k++) A[r]![k]! -= f * A[c]![k]!;
      b[r]! -= f * b[c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]!;
    for (let k = r + 1; k < n; k++) s -= A[r]![k]! * x[k]!;
    const piv = A[r]![r]!;
    x[r] = Math.abs(piv) < tol ? 0 : s / piv;
  }
  return x;
}

/** Suma las entradas repetidas de una fila (un cuerpo puede aparecer dos veces: extremo y polea móvil). */
function compactar(e: readonly Entrada[]): Entrada[] {
  const m = new Map<number, number>();
  for (const x of e) m.set(x.k, (m.get(x.k) ?? 0) + x.g);
  return [...m].map(([k, g]) => ({ k, g }));
}

/** Componente k de las velocidades generalizadas. */
function qp(vel: Vel, k: number): number {
  const n = vel.v.length;
  if (k >= 3 * n) return vel.wrot[k - 3 * n]!;
  const i = Math.floor(k / 3);
  const r = k % 3;
  return r === 0 ? vel.v[i]!.x : r === 1 ? vel.v[i]!.y : vel.w[i]!;
}

/** Entradas de una restricción entre dos puntos de los cuerpos i y j en la dirección d (sobre i: +d; sobre j: −d). */
function entradasPar(m: Modelo, i: number, j: number, d: Punto, ri: Punto, rj: Punto): Entrada[] {
  const e: Entrada[] = [
    { k: dX(i), g: d.x },
    { k: dY(i), g: d.y },
    { k: dX(j), g: -d.x },
    { k: dY(j), g: -d.y },
  ];
  if (m.cuerpos[i]!.I > 0) e.push({ k: dT(i), g: cruz(ri, d) });
  if (m.cuerpos[j]!.I > 0) e.push({ k: dT(j), g: -cruz(rj, d) });
  return e;
}

/** ¿El contacto involucra algún cuerpo que gira? (si no, y es una cara, su normal no cambia y γ = 0) */
const giraAlguno = (m: Modelo, c: Par): boolean => m.cuerpos[c.i]!.I > 0 || m.cuerpos[c.j]!.I > 0;

/** Filas de un contacto entre cuerpos: normal (con su γ si se pide) y, si está adherido, tangencial. */
function filasContacto(m: Modelo, c: Contacto, pose: Pose, vel: Vel | null): { normal: Fila; tang: Fila | null; bloqueo: Fila | null } {
  const g = geoContacto(m, c, pose);
  const filaEn = (ps: Pose, dir: 'n' | 't'): Entrada[] => {
    const gg = ps === pose ? g : geoContacto(m, c, ps);
    return entradasPar(m, c.i, c.j, gg[dir], gg.ri, gg.rj);
  };
  const eN = filaEn(pose, 'n');
  let gN = 0;
  let gT = 0;
  if (vel) {
    const gira = giraAlguno(m, c);
    if (c.cara < 0 && !gira) {
      const dv = { x: vel.v[c.i]!.x - vel.v[c.j]!.x, y: vel.v[c.i]!.y - vel.v[c.j]!.y };
      const L = Math.hypot(pose.p[c.i]!.x - pose.p[c.j]!.x, pose.p[c.i]!.y - pose.p[c.j]!.y) || 1e-12;
      gN = -(dot(dv, dv) - dot(g.n, dv) ** 2) / L;
    } else if (gira) gN = gammaNumerico((ps) => geoContacto(m, c, ps).gap, pose, vel);
    if (c.k === 'adherido' && (gira || c.cara < 0)) {
      // γ = −(dJ/dt) q̇ de la fila de velocidad, por diferencia centrada a lo largo del movimiento.
      const vmax = Math.max(1e-9, ...vel.v.map((q) => Math.hypot(q.x, q.y)), ...vel.w.map(Math.abs));
      const eps = 1e-5 / Math.max(1, vmax);
      const jq = (ps: Pose): number => filaEn(ps, 't').reduce((s, x) => s + x.g * qp(vel, x.k), 0);
      gT = -(jq(avanzarPose(pose, vel, eps)) - jq(avanzarPose(pose, vel, -eps))) / (2 * eps);
    }
  }
  const tang = c.k === 'adherido' ? { e: filaEn(pose, 't'), gamma: gT } : null;
  // Dos bloques apoyados cara a cara no se vuelcan uno sobre el otro: su giro relativo queda bloqueado.
  const bi = m.cuerpos[c.i]!;
  const bj = m.cuerpos[c.j]!;
  let bloqueo: Fila | null = null;
  if (c.cara >= 0 && bi.elemento.tipo === 'bloque' && (bi.I > 0 || bj.I > 0)) {
    const e: Entrada[] = [];
    if (bi.I > 0) e.push({ k: dT(c.i), g: 1 });
    if (bj.I > 0) e.push({ k: dT(c.j), g: -1 });
    bloqueo = { e, gamma: 0 };
  }
  return { normal: { e: eN, gamma: gN }, tang, bloqueo };
}

/** Velocidad relativa (de i respecto de j) del punto de contacto a lo largo de la tangente del contacto. */
function vTangPar(m: Modelo, c: Par, pose: Pose, vel: Vel): number {
  const g = geoContacto(m, c, pose);
  return entradasPar(m, c.i, c.j, g.t, g.ri, g.rj).reduce((s, x) => s + x.g * qp(vel, x.k), 0);
}

/** Coeficientes de roce entre dos cuerpos: el mayor de los dos. */
function rocePar(m: Modelo, c: Par): { muS: number; muK: number } {
  const a = m.cuerpos[c.i]!;
  const b = m.cuerpos[c.j]!;
  return { muS: Math.max(a.muS, b.muS), muK: Math.max(a.muK, b.muK) };
}

// --- Dinámica -----------------------------------------------------------------------------------------------------

interface Din {
  a: Punto[];
  alfa: number[];
  arot: number[];
  N: number[];
  fric: number[];
  T: number[];
  Tp: number[][];
  Nc: number[];
  fc: number[];
  Nx: number[];
  potRoce: number;
  potAp: number;
}

type Meta = Pick<Estado, 'modo' | 'cuerdaActiva' | 'N' | 'contactos' | 'Nc' | 'extra'>;

/** Filas de las restricciones activas, con el índice de cada una por cuerpo, cuerda y contacto. */
interface Restricciones {
  filas: Fila[];
  contacto: number[];
  tang: number[];
  cuerda: number[][];
  cn: number[];
  ct: number[];
  /** Fila de la segunda superficie de cada cuerpo (−1 si no tiene). */
  extra: number[];
}

/** Datos que no cambian: inversas de masas e inercias y apoyo de cada cuerpo (que no gira) sobre cada superficie. */
interface Geo {
  apoyo: number[][];
  inv: number[];
  invM: number[];
}

function geometria(m: Modelo): Geo {
  const invM: number[] = [];
  for (const c of m.cuerpos) {
    const im = c.masa > 0 ? 1 / c.masa : 1e9;
    invM.push(im, im, c.I > 0 ? 1 / c.I : 0);
  }
  for (const r of m.rotores) invM.push(r.I > 0 ? 1 / r.I : 0);
  return {
    apoyo: m.cuerpos.map((c) => m.superficies.map((s) => apoyoEn(c.elemento, s.n))),
    inv: m.cuerpos.map((c) => (c.masa > 0 ? 1 / c.masa : 0)),
    invM,
  };
}

/** Distancia del centro del cuerpo a su apoyo en la dirección n (si el bloque gira, con su ángulo actual). */
/**
 * Marco local de la superficie k visto desde el punto p: posición a lo largo (u), distancia con signo (d), normal y
 * tangente. En una recta, n y t son las de siempre (y las cuentas, las mismas que antes de haber curvas).
 */
function marcoSup(m: Modelo, k: number, p: Punto): Marco {
  const s = m.superficies[k]!;
  if (s.arco) return marcoArco(s.arco, p);
  const rel = { x: p.x - s.a.x, y: p.y - s.a.y };
  return { u: dot(rel, s.t), d: dot(rel, s.n), n: s.n, t: s.t, largo: s.largo };
}

/** Distancia del centro del cuerpo a su apoyo en la dirección n (si el bloque gira, con su ángulo actual). */
function apoyoActual(m: Modelo, geo: Geo, i: number, k: number, th: readonly number[], p: Punto): number {
  const c = m.cuerpos[i]!;
  const s = m.superficies[k]!;
  if (c.elemento.tipo !== 'bloque') return s.arco ? c.radio : geo.apoyo[i]![k]!;
  // En una curva, un bloque que no gira va siempre alineado con ella (como partícula, su orientación solo se ve).
  if (s.arco) {
    const mk = marcoArco(s.arco, p);
    return apoyoEn({ ...c.elemento, angulo: c.I > 0 ? th[i]! : anguloAlineado(m, k, th[i]!, p) }, mk.n);
  }
  // Un bloque que no gira conserva el ángulo dibujado (th = th0: el mismo apoyo de siempre) hasta que llega a otra
  // superficie y se alinea con ella.
  if (c.I === 0 && th[i] === c.th0) return geo.apoyo[i]![k]!;
  return apoyoEn({ ...c.elemento, angulo: th[i]! }, s.n);
}

/** Ángulo de un bloque llevado a la cara más cercana paralela a la superficie k (en p, si es curva). */
function anguloAlineado(m: Modelo, k: number, th: number, p: Punto): number {
  const t = marcoSup(m, k, p).t;
  const base = Math.atan2(t.y, t.x);
  const cuarto = Math.PI / 2;
  return base + Math.round((th - base) / cuarto) * cuarto;
}

/**
 * Distancia de apoyo con la que un cuerpo **llega** a la superficie k: un bloque que no gira se apoya alineado con ella
 * (como partícula, su orientación solo se ve), uno que gira con su ángulo real y una esfera, con su radio.
 */
function apoyoAlLlegar(m: Modelo, geo: Geo, i: number, k: number, th: readonly number[], p: Punto): number {
  const c = m.cuerpos[i]!;
  if (c.elemento.tipo !== 'bloque') return c.radio > 0 && m.superficies[k]!.arco ? c.radio : geo.apoyo[i]![k]!;
  if (c.I > 0) return apoyoActual(m, geo, i, k, th, p);
  return apoyoEn({ ...c.elemento, angulo: anguloAlineado(m, k, th[i]!, p) }, marcoSup(m, k, p).n);
}

/** Brazo del centro de una esfera que gira al punto de contacto con su superficie (null si no es el caso). */
function brazoContacto(m: Modelo, i: number, nOut: Punto): Punto | null {
  const c = m.cuerpos[i]!;
  if (c.I === 0 || c.elemento.tipo !== 'esfera') return null;
  return { x: -nOut.x * c.radio, y: -nOut.y * c.radio };
}

/** Velocidad del punto de contacto a lo largo de la superficie (la del centro si el cuerpo no rueda). */
function vTangente(m: Modelo, i: number, md: Extract<Modo, { s: number }>, p: Punto, v: Punto, w: number): number {
  const mk = marcoSup(m, md.s, p);
  const rc = brazoContacto(m, i, { x: mk.n.x * md.lado, y: mk.n.y * md.lado });
  return dot(v, mk.t) + (rc ? w * cruz(rc, mk.t) : 0);
}

/** Entradas de la fila de adherencia (o rodadura) de un cuerpo sobre su superficie, en la pose dada. */
function entradasAdherencia(m: Modelo, i: number, md: Extract<Modo, { s: number }>, p: Punto): Entrada[] {
  const mk = marcoSup(m, md.s, p);
  const rc = brazoContacto(m, i, { x: mk.n.x * md.lado, y: mk.n.y * md.lado });
  return [{ k: dX(i), g: mk.t.x }, { k: dY(i), g: mk.t.y }, ...(rc ? [{ k: dT(i), g: cruz(rc, mk.t) }] : [])];
}

/** Entradas que mantienen a un bloque que gira alineado con una curva: θ̇ = (e × v)/L (gira con la tangente). */
function entradasGiroEnCurva(m: Modelo, i: number, k: number, p: Punto): Entrada[] {
  const arco = m.superficies[k]!.arco!;
  const rx = p.x - arco.c.x;
  const ry = p.y - arco.c.y;
  const L2 = rx * rx + ry * ry || 1e-12;
  return [{ k: dT(i), g: 1 }, { k: dX(i), g: ry / L2 }, { k: dY(i), g: -rx / L2 }];
}

/** γ = −(dJ/dt) q̇ de una fila de velocidad que depende de la pose, por diferencia centrada a lo largo del movimiento. */
function gammaVelocidad(f: (ps: Pose) => Entrada[], pose: Pose, vel: Vel): number {
  const vmax = Math.max(1e-9, ...vel.v.map((q) => Math.hypot(q.x, q.y)), ...vel.w.map(Math.abs));
  const eps = 1e-5 / Math.max(1, vmax);
  const jq = (ps: Pose): number => f(ps).reduce((s, x) => s + x.g * qp(vel, x.k), 0);
  return -(jq(avanzarPose(pose, vel, eps)) - jq(avanzarPose(pose, vel, -eps))) / (2 * eps);
}

function restricciones(m: Modelo, pose: Pose, vel: Vel | null, meta: Meta, sinAdherencia = false): Restricciones {
  const n = m.cuerpos.length;
  const filas: Fila[] = [];
  const filaContacto = new Array<number>(n).fill(-1);
  const filaTang = new Array<number>(n).fill(-1);
  const filaCuerda: number[][] = m.cuerdas.map(() => []);
  for (let i = 0; i < n; i++) {
    const md = meta.modo[i]!;
    if (md.k === 'libre') continue;
    const s = m.superficies[md.s]!;
    const p = pose.p[i]!;
    const mk = marcoSup(m, md.s, p);
    const nOut = { x: mk.n.x * md.lado, y: mk.n.y * md.lado };
    // En una curva, la normal cambia con la posición: γ = lado σ v_t²/L (la aceleración centrípeta del centro).
    let gN = 0;
    if (s.arco && vel) {
      const rx = p.x - s.arco.c.x;
      const ry = p.y - s.arco.c.y;
      const L = Math.hypot(rx, ry) || 1e-12;
      const v = vel.v[i]!;
      const ve = (v.x * rx + v.y * ry) / L;
      gN = (md.lado * s.arco.sigma * (v.x * v.x + v.y * v.y - ve * ve)) / L;
    }
    filaContacto[i] = filas.length;
    filas.push({ e: [{ k: dX(i), g: nOut.x }, { k: dY(i), g: nOut.y }], gamma: gN });
    // Un bloque que gira, mientras está apoyado, no se vuelca: su giro queda bloqueado (en una curva, gira con ella).
    if (m.cuerpos[i]!.I > 0 && m.cuerpos[i]!.elemento.tipo === 'bloque') {
      if (s.arco) filas.push({ e: entradasGiroEnCurva(m, i, md.s, p), gamma: vel ? gammaVelocidad((ps) => entradasGiroEnCurva(m, i, md.s, ps.p[i]!), pose, vel) : 0 });
      else filas.push({ e: [{ k: dT(i), g: 1 }], gamma: 0 });
    }
    if (md.k === 'adherido' && !sinAdherencia) {
      // Sin deslizar: el punto de contacto no se mueve a lo largo de la superficie (en una esfera que gira: rodadura).
      filaTang[i] = filas.length;
      const gT = s.arco && vel ? gammaVelocidad((ps) => entradasAdherencia(m, i, md, ps.p[i]!), pose, vel) : 0;
      filas.push({ e: entradasAdherencia(m, i, md, p), gamma: gT });
    }
  }
  // Segunda superficie (esquina): solo la normal.
  const filaExtra = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const x = meta.extra[i];
    if (!x || meta.modo[i]!.k === 'libre') continue;
    const n2 = marcoSup(m, x.s, pose.p[i]!).n;
    filaExtra[i] = filas.length;
    filas.push({ e: [{ k: dX(i), g: n2.x * x.lado }, { k: dY(i), g: n2.y * x.lado }], gamma: 0 });
  }
  const cn: number[] = [];
  const ct: number[] = [];
  for (const c of meta.contactos) {
    const f = filasContacto(m, c, pose, vel);
    cn.push(filas.length);
    filas.push({ e: compactar(f.normal.e), gamma: f.normal.gamma });
    if (f.bloqueo) filas.push(f.bloqueo);
    const tang = sinAdherencia ? null : f.tang;
    ct.push(tang ? filas.length : -1);
    if (tang) filas.push({ e: compactar(tang.e), gamma: tang.gamma });
  }
  m.cuerdas.forEach((c, k) => {
    if (!meta.cuerdaActiva[k]) return;
    for (const { fila } of filasCuerda(m, c, pose, vel)) {
      filaCuerda[k]!.push(filas.length);
      filas.push({ e: compactar(fila.e), gamma: fila.gamma });
    }
  });
  return { filas, contacto: filaContacto, tang: filaTang, cuerda: filaCuerda, cn, ct, extra: filaExtra };
}

/** A = J M⁻¹ Jᵀ de un conjunto de filas. */
function matrizA(filas: readonly Fila[], invM: readonly number[]): number[][] {
  const nf = filas.length;
  const A: number[][] = Array.from({ length: nf }, () => new Array<number>(nf).fill(0));
  for (let r = 0; r < nf; r++) {
    for (let s = r; s < nf; s++) {
      let suma = 0;
      for (const a of filas[r]!.e) for (const b of filas[s]!.e) if (a.k === b.k) suma += a.g * b.g * invM[a.k]!;
      A[r]![s] = suma;
      A[s]![r] = suma;
    }
  }
  return A;
}

function dinamica(m: Modelo, geo: Geo, pose: Pose, vel: Vel, meta: Meta): Din {
  const n = m.cuerpos.length;
  const D = 3 * n + m.rotores.length;
  const Q = new Array<number>(D).fill(0);
  const Fap: Punto[] = m.cuerpos.map(() => cero());
  m.cuerpos.forEach((c, i) => (Q[dY(i)] = -c.masa * m.g));
  for (const f of m.fuerzas) {
    Q[dX(f.cuerpo)]! += f.F.x;
    Q[dY(f.cuerpo)]! += f.F.y;
    Fap[f.cuerpo]!.x += f.F.x;
    Fap[f.cuerpo]!.y += f.F.y;
  }
  /** Una fuerza aplicada en un extremo (si el cuerpo gira, también su torque). */
  const aplicar = (e: Extremo, F: Punto): void => {
    if (e.tipo !== 'cuerpo') return;
    Q[dX(e.i)]! += F.x;
    Q[dY(e.i)]! += F.y;
    if (m.cuerpos[e.i]!.I > 0) Q[dT(e.i)]! += cruz(brazo(m, e, pose.th), F);
  };
  for (const r of m.resortes) {
    const q0 = posExt(m, r.ext[0], pose);
    const q1 = posExt(m, r.ext[1], pose);
    const dx = q1.x - q0.x;
    const dy = q1.y - q0.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-12) continue;
    const f = (r.k * (L - r.largoNatural)) / L;
    aplicar(r.ext[0], { x: f * dx, y: f * dy });
    aplicar(r.ext[1], { x: -f * dx, y: -f * dy });
  }

  // Restricciones activas
  const R = restricciones(m, pose, vel, meta);
  const { filas, contacto: filaContacto, tang: filaTang, cuerda: filaCuerda } = R;
  const nc = meta.contactos.length;
  const hayDeslizando = meta.modo.some((md) => md.k === 'desliza') || meta.contactos.some((c) => c.k === 'desliza');
  let Nsup = meta.N.map((x, i) => (x > 0 ? x : m.cuerpos[i]!.masa * m.g * 0.5));
  let Ncon = meta.contactos.map((c, q) => ((meta.Nc[q] ?? 0) > 0 ? meta.Nc[q]! : m.cuerpos[c.i]!.masa * m.g * 0.5));
  let q2: number[] = [];
  let lambda: number[] = [];
  let fricFuerza = new Array<number>(n).fill(0);
  let fricCont = new Array<number>(nc).fill(0);
  // A = J M⁻¹ Jᵀ no depende del roce cinético: se arma una sola vez por evaluación.
  const A0 = matrizA(filas, geo.invM);
  // Geometría de los contactos que deslizan (para su roce cinético)
  const geoDesl = meta.contactos.map((c) => (c.k === 'desliza' ? geoContacto(m, c, pose) : null));
  for (let it = 0; it < (hayDeslizando ? 6 : 1); it++) {
    const Qi = Q.slice();
    fricFuerza = new Array<number>(n).fill(0);
    fricCont = new Array<number>(nc).fill(0);
    meta.contactos.forEach((c, q) => {
      const g = geoDesl[q];
      if (!g) return;
      const vt = entradasPar(m, c.i, c.j, g.t, g.ri, g.rj).reduce((s, x) => s + x.g * qp(vel, x.k), 0);
      const sg = Math.abs(vt) > EPS_V ? signo(vt) : c.dir;
      const fr = -sg * rocePar(m, c).muK * Math.max(Ncon[q]!, 0);
      fricCont[q] = fr;
      // Sobre i, fr a lo largo de t en el punto de contacto; sobre j, la reacción.
      for (const x of entradasPar(m, c.i, c.j, g.t, g.ri, g.rj)) Qi[x.k]! += fr * x.g;
    });
    for (let i = 0; i < n; i++) {
      const md = meta.modo[i]!;
      if (md.k !== 'desliza') continue;
      const s = m.superficies[md.s]!;
      const mk = marcoSup(m, md.s, pose.p[i]!);
      const vt = vTangente(m, i, md, pose.p[i]!, vel.v[i]!, vel.w[i]!);
      const sg = Math.abs(vt) > EPS_V ? signo(vt) : md.dir;
      const fr = -sg * s.muK * Math.max(Nsup[i]!, 0);
      fricFuerza[i] = fr;
      Qi[dX(i)]! += fr * mk.t.x;
      Qi[dY(i)]! += fr * mk.t.y;
      // El roce actúa en el punto de contacto: en una esfera que gira, también hace torque.
      const rc = brazoContacto(m, i, { x: mk.n.x * md.lado, y: mk.n.y * md.lado });
      if (rc) Qi[dT(i)]! += fr * cruz(rc, mk.t);
    }
    // (J M⁻¹ Jᵀ) λ = γ − J M⁻¹ Q
    const A = A0.map((fila) => fila.slice());
    const b = filas.map((f) => f.gamma - f.e.reduce((s, x) => s + x.g * geo.invM[x.k]! * Qi[x.k]!, 0));
    lambda = resolver(A, b);
    q2 = Qi.slice();
    filas.forEach((f, r) => {
      for (const x of f.e) q2[x.k]! += x.g * lambda[r]!;
    });
    for (let k = 0; k < D; k++) q2[k] = q2[k]! * geo.invM[k]!;
    if (!hayDeslizando) break;
    const nueva = m.cuerpos.map((_, i) => (filaContacto[i]! >= 0 ? lambda[filaContacto[i]!]! : 0));
    const nuevaC = R.cn.map((r) => lambda[r]!);
    const dif = Math.max(
      0,
      ...nueva.map((x2, i) => (meta.modo[i]!.k === 'desliza' ? Math.abs(x2 - Math.max(Nsup[i]!, 0)) : 0)),
      ...nuevaC.map((x2, q) => (meta.contactos[q]!.k === 'desliza' ? Math.abs(x2 - Math.max(Ncon[q]!, 0)) : 0)),
    );
    Nsup = nueva.map((x2, i) => (meta.modo[i]!.k === 'desliza' ? x2 : Nsup[i]!));
    Ncon = nuevaC.map((x2, q) => (meta.contactos[q]!.k === 'desliza' ? x2 : Ncon[q]!));
    if (dif < 1e-11) break;
  }

  const a = m.cuerpos.map((_, i) => ({ x: q2[dX(i)] ?? 0, y: q2[dY(i)] ?? 0 }));
  const alfa = m.cuerpos.map((_, i) => q2[dT(i)] ?? 0);
  const arot = m.rotores.map((_, k) => q2[3 * n + k] ?? 0);
  const N = m.cuerpos.map((_, i) => (filaContacto[i]! >= 0 ? lambda[filaContacto[i]!]! : 0));
  const Nx = m.cuerpos.map((_, i) => (R.extra[i]! >= 0 ? lambda[R.extra[i]!]! : 0));
  const fric = m.cuerpos.map((_, i) => (meta.modo[i]!.k === 'adherido' ? lambda[filaTang[i]!]! : fricFuerza[i]!));
  const Tp = filaCuerda.map((rs) => rs.map((r) => -lambda[r]!));
  const T = m.cuerdas.map((_, k) => Tp[k]![0] ?? 0);
  const Nc = R.cn.map((r) => lambda[r]!);
  const fc = meta.contactos.map((c, q) => (c.k === 'adherido' ? lambda[R.ct[q]!]! : fricCont[q]!));
  let potRoce = 0;
  meta.contactos.forEach((c, q) => {
    if (c.k === 'desliza') potRoce += fricCont[q]! * vTangPar(m, c, pose, vel);
  });
  let potAp = 0;
  for (let i = 0; i < n; i++) {
    const md = meta.modo[i]!;
    if (md.k === 'desliza') potRoce += fricFuerza[i]! * vTangente(m, i, md, pose.p[i]!, vel.v[i]!, vel.w[i]!);
    potAp += dot(Fap[i]!, vel.v[i]!);
  }
  return { a, alfa, arot, N, fric, T, Tp, Nc, fc, Nx, potRoce, potAp };
}

// --- Energías -------------------------------------------------------------------------------------------------------

export interface Energias {
  K: number;
  Ug: number;
  Ue: number;
  /** Energía mecánica K + Ug + Ue (Ug con y = 0 como nivel de referencia). */
  E: number;
}

export function energias(m: Modelo, pose: Pose, vel: Vel): Energias {
  let K = 0;
  let Ug = 0;
  m.cuerpos.forEach((c, i) => {
    K += 0.5 * c.masa * dot(vel.v[i]!, vel.v[i]!) + 0.5 * c.I * vel.w[i]! ** 2;
    Ug += c.masa * m.g * pose.p[i]!.y;
  });
  m.rotores.forEach((r, k) => (K += 0.5 * r.I * vel.wrot[k]! ** 2));
  let Ue = 0;
  for (const r of m.resortes) {
    const q0 = posExt(m, r.ext[0], pose);
    const q1 = posExt(m, r.ext[1], pose);
    const x = Math.hypot(q1.x - q0.x, q1.y - q0.y) - r.largoNatural;
    Ue += 0.5 * r.k * x * x;
  }
  return { K, Ug, Ue, E: K + Ug + Ue };
}

export function elongaciones(m: Modelo, pose: Pose): number[] {
  return m.resortes.map((r) => {
    const q0 = posExt(m, r.ext[0], pose);
    const q1 = posExt(m, r.ext[1], pose);
    return Math.hypot(q1.x - q0.x, q1.y - q0.y) - r.largoNatural;
  });
}

// --- Muestras ---------------------------------------------------------------------------------------------------------

export interface MuestraCuerpo {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  K: number;
  Ug: number;
  N: number;
  f: number;
  /** Ángulo y velocidad angular (0 si no gira). */
  th: number;
  w: number;
}

export interface Muestra {
  t: number;
  cuerpos: MuestraCuerpo[];
  Ue: number;
  E: number;
  Wroce: number;
  Waplicadas: number;
  Wimpactos: number;
}

// --- Simulación -------------------------------------------------------------------------------------------------------

export interface OpcionesSim {
  /** Paso de integración en segundos. */
  h?: number;
  /** Separación entre muestras guardadas para los gráficos. */
  periodoMuestreo?: number;
  /** Coeficiente de restitución de los choques (0 = plástico, los cuerpos quedan juntos; 1 = elástico). */
  restitucion?: number;
}

/** Estado al comienzo de un paso (para ubicar los eventos que ocurren dentro de él). */
interface Prev {
  pose: Pose;
  vel: Vel;
  elong: number[];
  t: number;
  W: Estado['W'];
  /** Valor de la restricción de cada cuerda (distancia − largo) al comienzo del paso. */
  phi: number[];
}

/** Interpolación cúbica de Hermite entre los extremos de un paso (exacta si la aceleración es constante). */
function hermite1(x0: number, v0: number, x1: number, v1: number, h: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * x0 + (u3 - 2 * u2 + u) * h * v0 + (-2 * u3 + 3 * u2) * x1 + (u3 - u2) * h * v1;
}
/** Derivada temporal de la cúbica de Hermite (la velocidad en el instante u·h). */
function hermiteDerivada(x0: number, v0: number, x1: number, v1: number, h: number, u: number): number {
  const u2 = u * u;
  return ((6 * u2 - 6 * u) * x0 + (-6 * u2 + 6 * u) * x1) / h + (3 * u2 - 4 * u + 1) * v0 + (3 * u2 - 2 * u) * v1;
}
function hermite(p0: Punto, v0: Punto, p1: Punto, v1: Punto, h: number, u: number): Punto {
  return { x: hermite1(p0.x, v0.x, p1.x, v1.x, h, u), y: hermite1(p0.y, v0.y, p1.y, v1.y, h, u) };
}

/** La pose en el instante `u·h` dentro del paso (por Hermite, con las velocidades de los extremos del paso). */
function poseIntermedia(prev: Prev, pose: Pose, vel: Vel, h: number, u: number): Pose {
  return {
    p: pose.p.map((q, j) => hermite(prev.pose.p[j]!, prev.vel.v[j]!, q, vel.v[j]!, h, u)),
    th: pose.th.map((t, j) => hermite1(prev.pose.th[j]!, prev.vel.w[j]!, t, vel.w[j]!, h, u)),
    rot: pose.rot.map((r, k) => hermite1(prev.pose.rot[k]!, prev.vel.wrot[k]!, r, vel.wrot[k]!, h, u)),
  };
}

/** Raíz de una función monótona en [0, 1] por bisección (la función cambia de signo entre los extremos). */
function bisectar(f: (u: number) => number): number {
  let lo = 0;
  let hi = 1;
  const signoLo = Math.sign(f(0)) || 1;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(f(mid) || 1) === signoLo) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export const PASO_POR_DEFECTO = 0.001;
const MAX_MUESTRAS = 20000;

export class Simulacion {
  readonly h: number;
  /** Coeficiente de restitución de los choques. */
  readonly e: number;
  estado!: Estado;
  historial: Muestra[] = [];
  eventos: EventoSim[] = [];
  private readonly geo: Geo;
  private periodo: number;
  private proxima = 0;
  private acumulado = 0;
  private energiaInicial = 0;
  private inicial: Modo[] = [];

  constructor(readonly modelo: Modelo, opciones: OpcionesSim = {}) {
    this.h = opciones.h ?? PASO_POR_DEFECTO;
    this.e = Math.min(1, Math.max(0, opciones.restitucion ?? 0));
    this.periodo = opciones.periodoMuestreo ?? 0.01;
    this.geo = geometria(modelo);
    this.reiniciar();
  }

  private get pose(): Pose {
    const e = this.estado;
    return { p: e.p, th: e.th, rot: e.rot };
  }
  private get vel(): Vel {
    const e = this.estado;
    return { v: e.v, w: e.w, wrot: e.wrot };
  }

  /** Vuelve al instante inicial: cuerpos donde se dibujaron, con su velocidad inicial. */
  reiniciar(): void {
    this.dinFinal = null;
    const m = this.modelo;
    const n = m.cuerpos.length;
    const p = m.cuerpos.map((c) => ({ ...c.p0 }));
    const v = m.cuerpos.map((c) => ({ ...c.v0 }));
    const th = m.cuerpos.map((c) => c.th0);
    const modo: Modo[] = m.cuerpos.map(() => ({ k: 'libre' }));

    // Contacto inicial: el cuerpo se apoya exactamente sobre la primera superficie de su lista `apoyo` (grafo).
    const indiceSup = new Map(m.superficies.map((s, k) => [s.id, k]));
    m.cuerpos.forEach((c, i) => {
      for (const id of c.elemento.apoyo ?? []) {
        const k = indiceSup.get(id);
        if (k === undefined) continue;
        const mk = marcoSup(m, k, p[i]!);
        const d = mk.d;
        const lado: 1 | -1 = d >= 0 ? 1 : -1;
        const gap = lado * d - apoyoActual(m, this.geo, i, k, th, p[i]!);
        // Un apoyo que quedó lejos (la superficie se movió sin el cuerpo) no se respeta; el validador lo avisa.
        if (Math.abs(gap) > APOYO_MAXIMO) continue;
        const nOut = { x: lado * mk.n.x, y: lado * mk.n.y };
        const vn = dot(v[i]!, nOut);
        // Si parte alejándose de la superficie (un lanzamiento desde el suelo), no queda apoyado: vuela.
        // (La v1 lo dejaba pegado y deslizando: es una de las diferencias intencionales con ella.)
        // (Umbral relativo: una velocidad dibujada "a lo largo" del plano tiene un error de redondeo de ~1e-5.)
        if (vn > 2e-3 * Math.hypot(v[i]!.x, v[i]!.y) + EPS_V) break;
        // La velocidad inicial no puede atravesar la superficie.
        if (vn < 0) v[i] = { x: v[i]!.x - vn * nOut.x, y: v[i]!.y - vn * nOut.y };
        p[i] = { x: p[i]!.x - nOut.x * gap, y: p[i]!.y - nOut.y * gap };
        modo[i] = { k: 'desliza', s: k, lado, dir: 0 };
        break;
      }
    });

    const pose0: Pose = { p, th, rot: m.rotores.map(() => 0) };
    this.estado = {
      t: 0,
      p,
      v,
      a: p.map(cero),
      th,
      w: m.cuerpos.map(() => 0),
      alfa: m.cuerpos.map(() => 0),
      rot: pose0.rot,
      wrot: m.rotores.map(() => 0),
      modo,
      cuerdaActiva: m.cuerdas.map(() => true), // se ajusta abajo según el sentido del movimiento
      N: new Array<number>(n).fill(0),
      fric: new Array<number>(n).fill(0),
      T: new Array<number>(m.cuerdas.length).fill(0),
      Tp: m.cuerdas.map(() => [0]),
      extra: m.cuerpos.map(() => null),
      Nx: new Array<number>(n).fill(0),
      contactos: [],
      Nc: [],
      fc: [],
      W: { roce: 0, aplicadas: 0, impactos: 0 },
      elong: elongaciones(m, pose0),
    };
    this.contactosIniciales();
    this.inicial = modo.map((x) => ({ ...x }));
    // Una cuerda cuyos extremos ya se están acercando parte floja (no puede empujar).
    m.cuerdas.forEach((c, k) => {
      if (this.dphiCuerda(c) < -1e-12) this.estado.cuerdaActiva[k] = false;
    });
    this.historial = [];
    this.eventos = [];
    this.detenida = null;
    this.acumulado = 0;
    this.periodo = this.periodo > 0 ? this.periodo : 0.01;
    this.proxima = 0;
    // Los cuerpos apoyados que parten en reposo: ¿los sostiene el roce estático (o ruedan sin deslizar)?
    const candidatos = new Set<number>();
    modo.forEach((md, i) => {
      if (md.k === 'desliza' && Math.abs(vTangente(m, i, md, p[i]!, v[i]!, 0)) < EPS_V) candidatos.add(i);
    });
    const contCand = new Set<number>();
    this.estado.contactos.forEach((c, q) => {
      if (Math.abs(vTangPar(m, c, this.pose, this.vel)) < EPS_V) contCand.add(q);
    });
    this.reconciliar(candidatos, false, contCand);
    this.refrescar();
    this.energiaInicial = energias(m, this.pose, this.vel).E;
    this.registrar();
  }

  /**
   * Cuerpos dibujados en contacto (uno en el `apoyo` del otro, o a menos de 2 mm): parten apoyados uno en otro. El que
   * se apoya se acomoda justo sobre la cara del otro. Un par que parte traslapado se ignora hasta que se separe.
   */
  private contactosIniciales(): void {
    const m = this.modelo;
    const e = this.estado;
    const n = m.cuerpos.length;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const dist = Math.hypot(e.p[a]!.x - e.p[b]!.x, e.p[a]!.y - e.p[b]!.y);
        if (dist > radioEnvolvente(m, a) + radioEnvolvente(m, b) + APOYO_MAXIMO) continue;
        const car = separacion(m, a, b, this.pose);
        if (car.esquina) continue;
        const ids = (k: number): readonly string[] => m.cuerpos[k]!.elemento.apoyo ?? [];
        const iEnJ = ids(car.i).includes(m.cuerpos[car.j]!.id);
        const jEnI = ids(car.j).includes(m.cuerpos[car.i]!.id);
        if (Math.abs(car.gap) > (iEnJ || jEnI ? APOYO_MAXIMO : TOCA)) continue;
        const g = geoContacto(m, car, this.pose);
        // Se mueve el que se apoya en el otro (por defecto, i): la separación queda en cero.
        const mover = jEnI && !iEnJ ? car.j : car.i;
        const sg = mover === car.i ? -1 : 1;
        e.p[mover] = { x: e.p[mover]!.x + sg * g.n.x * g.gap, y: e.p[mover]!.y + sg * g.n.y * g.gap };
        // Si parten alejándose, no quedan en contacto; si se acercan, la velocidad relativa normal se anula.
        const dv = { x: e.v[car.i]!.x - e.v[car.j]!.x, y: e.v[car.i]!.y - e.v[car.j]!.y };
        const vn = dot(dv, g.n);
        if (vn > 2e-3 * Math.hypot(dv.x, dv.y) + EPS_V) continue;
        if (vn < 0) e.v[mover] = { x: e.v[mover]!.x + sg * vn * g.n.x, y: e.v[mover]!.y + sg * vn * g.n.y };
        e.contactos.push({ i: car.i, j: car.j, cara: car.cara, k: 'desliza', dir: 0 });
        e.Nc.push(0);
        e.fc.push(0);
      }
    }
  }

  /** Superficie en la que el cuerpo está apoyado al empezar (null si parte en el aire). */
  modoInicial(i: number): { s: number; lado: 1 | -1 } | null {
    const md = this.inicial[i];
    return md && md.k !== 'libre' ? { s: md.s, lado: md.lado } : null;
  }

  /** Energía mecánica en t = 0. */
  get energiaMecanicaInicial(): number {
    return this.energiaInicial;
  }

  // -- avance -----------------------------------------------------------------------------------------------

  /** Si la simulación se detuvo sola (un cuerpo llegó a una polea), el motivo; null mientras sigue. */
  detenida: string | null = null;

  /** ¿El último avance se cortó por falta de tiempo (el equipo no alcanza a simular en tiempo real)? */
  retrasada = false;

  /**
   * Avanza `dt` segundos de tiempo simulado (en pasos fijos); devuelve cuántos pasos dio. Con `presupuestoMs`, deja de
   * avanzar cuando se gasta ese tiempo real (y descarta el atraso): la simulación va más lenta que el tiempo real, pero
   * la pantalla no se congela. Sin presupuesto (pruebas, exportaciones) avanza exactamente `dt`.
   */
  avanzar(dt: number, maxPasos = 2000, presupuestoMs = Infinity): number {
    this.retrasada = false;
    if (this.detenida) return 0;
    this.acumulado += dt;
    let n = 0;
    const t0 = presupuestoMs < Infinity ? performance.now() : 0;
    while (this.acumulado >= this.h - 1e-15 && n < maxPasos && !this.detenida) {
      this.paso();
      this.acumulado -= this.h;
      n++;
      if ((n & 3) === 0 && presupuestoMs < Infinity && performance.now() - t0 > presupuestoMs) {
        this.retrasada = this.acumulado >= this.h;
        this.acumulado = 0;
        break;
      }
    }
    if (n >= maxPasos) this.acumulado = 0; // no se acumula atraso si el equipo no da abasto
    return n;
  }

  /** Un paso RK4 de duración `h` (los eventos que ocurren dentro de él se tratan en su instante exacto). */
  paso(): void {
    if (this.detenida) return;
    this.integrar(this.h, 0);
    this.revisarTopes();
  }

  /**
   * Un cuerpo que llega a la polea por la que pasa su cuerda (el tramo que los une se acaba) no puede seguir: la
   * simulación se detiene ahí con un evento, en vez de seguir con una geometría imposible.
   */
  private revisarTopes(): void {
    const m = this.modelo;
    const e = this.estado;
    m.cuerdas.forEach((c, k) => {
      if (this.detenida || !c.ruta || !e.cuerdaActiva[k]) return;
      const q0 = posExt(m, c.ext[0], this.pose);
      const q1 = posExt(m, c.ext[1], this.pose);
      const geo = geometriaRuta(q0, c.moviles ? pasosEn(m, c, this.pose) : c.ruta, q1);
      const lados: Array<[number, Punto, Punto]> = [];
      if (c.ext[0].tipo === 'cuerpo') lados.push([c.ext[0].i, q0, geo.haciaA]);
      if (c.ext[1].tipo === 'cuerpo') lados.push([c.ext[1].i, q1, geo.haciaB]);
      for (const [i, q, t] of lados) {
        if (geo.valida && Math.hypot(q.x - t.x, q.y - t.y) > TRAMO_MINIMO) continue;
        const texto = `${this.nombre(i)} llega a la polea: la simulación se detiene aquí`;
        this.evento(e.t, 'llega-polea', i, texto);
        this.detenida = texto;
        return;
      }
    });
  }

  /** Un paso RK4 de duración `hh` a partir del estado actual. */
  private integrar(hh: number, profundidad: number): void {
    const m = this.modelo;
    const e = this.estado;
    const h = hh;
    const n = m.cuerpos.length;
    const nr = m.rotores.length;
    const meta: Meta = { modo: e.modo, cuerdaActiva: e.cuerdaActiva, N: e.N, contactos: e.contactos, Nc: e.Nc, extra: e.extra };
    const prev: Prev = {
      pose: { p: e.p.map((q) => ({ ...q })), th: e.th.slice(), rot: e.rot.slice() },
      vel: { v: e.v.map((q) => ({ ...q })), w: e.w.slice(), wrot: e.wrot.slice() },
      elong: e.elong.slice(),
      t: e.t,
      W: { ...e.W },
      phi: m.cuerdas.map((c) => valorCuerda(m, c, this.pose)),
    };

    const f = (pose: Pose, vel: Vel) => dinamica(m, this.geo, pose, vel, meta);
    const masPose = (pose: Pose, vel: Vel, s: number): Pose => ({
      p: pose.p.map((q, i) => ({ x: q.x + s * vel.v[i]!.x, y: q.y + s * vel.v[i]!.y })),
      th: pose.th.map((t, i) => t + s * vel.w[i]!),
      rot: pose.rot.map((r, k) => r + s * vel.wrot[k]!),
    });
    const masVel = (vel: Vel, d: Din, s: number): Vel => ({
      v: vel.v.map((q, i) => ({ x: q.x + s * d.a[i]!.x, y: q.y + s * d.a[i]!.y })),
      w: vel.w.map((w, i) => w + s * d.alfa[i]!),
      wrot: vel.wrot.map((w, k) => w + s * d.arot[k]!),
    });

    const pose1 = this.pose;
    const vel1 = this.vel;
    const k1 = f(pose1, vel1);
    const pose2 = masPose(pose1, vel1, h / 2);
    const vel2 = masVel(vel1, k1, h / 2);
    const k2 = f(pose2, vel2);
    const pose3 = masPose(pose1, vel2, h / 2);
    const vel3 = masVel(vel1, k2, h / 2);
    const k3 = f(pose3, vel3);
    const pose4 = masPose(pose1, vel3, h);
    const vel4 = masVel(vel1, k3, h);
    const k4 = f(pose4, vel4);

    const c6 = h / 6;
    for (let i = 0; i < n; i++) {
      e.p[i] = {
        x: e.p[i]!.x + c6 * (vel1.v[i]!.x + 2 * vel2.v[i]!.x + 2 * vel3.v[i]!.x + vel4.v[i]!.x),
        y: e.p[i]!.y + c6 * (vel1.v[i]!.y + 2 * vel2.v[i]!.y + 2 * vel3.v[i]!.y + vel4.v[i]!.y),
      };
      e.v[i] = {
        x: e.v[i]!.x + c6 * (k1.a[i]!.x + 2 * k2.a[i]!.x + 2 * k3.a[i]!.x + k4.a[i]!.x),
        y: e.v[i]!.y + c6 * (k1.a[i]!.y + 2 * k2.a[i]!.y + 2 * k3.a[i]!.y + k4.a[i]!.y),
      };
      e.th[i] = e.th[i]! + c6 * (vel1.w[i]! + 2 * vel2.w[i]! + 2 * vel3.w[i]! + vel4.w[i]!);
      e.w[i] = e.w[i]! + c6 * (k1.alfa[i]! + 2 * k2.alfa[i]! + 2 * k3.alfa[i]! + k4.alfa[i]!);
    }
    for (let k = 0; k < nr; k++) {
      e.rot[k] = e.rot[k]! + c6 * (vel1.wrot[k]! + 2 * vel2.wrot[k]! + 2 * vel3.wrot[k]! + vel4.wrot[k]!);
      e.wrot[k] = e.wrot[k]! + c6 * (k1.arot[k]! + 2 * k2.arot[k]! + 2 * k3.arot[k]! + k4.arot[k]!);
    }
    e.W.roce += c6 * (k1.potRoce + 2 * k2.potRoce + 2 * k3.potRoce + k4.potRoce);
    e.W.aplicadas += c6 * (k1.potAp + 2 * k2.potAp + 2 * k3.potAp + k4.potAp);
    e.t += h;

    this.proyectar();
    const reinicio = this.cambiosDeRegimen(prev, h, profundidad);
    if (reinicio) return; // el resto del paso ya se integró desde el instante del evento
    this.refrescar();
    if (e.t + 1e-12 >= this.proxima) this.registrar();
  }

  // -- restricciones -----------------------------------------------------------------------------------------

  /** Corrige la deriva numérica: devuelve posiciones y velocidades al espacio permitido por las restricciones. */
  private proyectar(): void {
    const m = this.modelo;
    const e = this.estado;
    for (let it = 0; it < 4; it++) {
      e.modo.forEach((md, i) => {
        if (md.k === 'libre') return;
        const s = m.superficies[md.s]!;
        const mk = marcoSup(m, md.s, e.p[i]!);
        const nOut = { x: mk.n.x * md.lado, y: mk.n.y * md.lado };
        const c = m.cuerpos[i]!;
        // En una curva, un bloque que no gira se dibuja alineado con ella en cada punto.
        if (s.arco && c.I === 0 && c.elemento.tipo === 'bloque') e.th[i] = anguloAlineado(m, md.s, e.th[i]!, e.p[i]!);
        const gap = md.lado * mk.d - apoyoActual(m, this.geo, i, md.s, e.th, e.p[i]!);
        e.p[i] = { x: e.p[i]!.x - nOut.x * gap, y: e.p[i]!.y - nOut.y * gap };
        const vn = dot(e.v[i]!, nOut);
        e.v[i] = { x: e.v[i]!.x - vn * nOut.x, y: e.v[i]!.y - vn * nOut.y };
        if (c.I > 0 && c.elemento.tipo === 'bloque') {
          if (!s.arco) e.w[i] = 0;
          else {
            // Gira con la curva: ω = (e × v)/L
            const rx = e.p[i]!.x - s.arco.c.x;
            const ry = e.p[i]!.y - s.arco.c.y;
            e.w[i] = (rx * e.v[i]!.y - ry * e.v[i]!.x) / (rx * rx + ry * ry || 1e-12);
          }
        }
        if (md.k === 'adherido') {
          // Sin deslizar: se anula la velocidad del punto de contacto (en una esfera que gira, repartida entre v y ω).
          const rc = brazoContacto(m, i, nOut);
          const vt = vTangente(m, i, md, e.p[i]!, e.v[i]!, e.w[i]!);
          const im = this.geo.inv[i]!;
          const iI = rc ? this.geo.invM[dT(i)]! : 0;
          const ct = rc ? cruz(rc, mk.t) : 0;
          const wsum = im + iI * ct * ct;
          if (wsum > 1e-18) {
            const lam = -vt / wsum;
            e.v[i] = { x: e.v[i]!.x + im * lam * mk.t.x, y: e.v[i]!.y + im * lam * mk.t.y };
            if (rc) e.w[i] = e.w[i]! + iI * lam * ct;
          }
        }
      });
      e.extra.forEach((x, i) => {
        if (!x || e.modo[i]!.k === 'libre') return;
        const mk = marcoSup(m, x.s, e.p[i]!);
        const nOut = { x: mk.n.x * x.lado, y: mk.n.y * x.lado };
        const gap = x.lado * mk.d - apoyoActual(m, this.geo, i, x.s, e.th, e.p[i]!);
        e.p[i] = { x: e.p[i]!.x - nOut.x * gap, y: e.p[i]!.y - nOut.y * gap };
        const vn = dot(e.v[i]!, nOut);
        e.v[i] = { x: e.v[i]!.x - vn * nOut.x, y: e.v[i]!.y - vn * nOut.y };
      });
      for (const c of e.contactos) {
        const g = geoContacto(m, c, this.pose);
        this.proyectarFila(entradasPar(m, c.i, c.j, g.n, g.ri, g.rj), g.gap);
        const f = filasContacto(m, c, this.pose, null);
        this.proyectarFila(compactar(f.normal.e), null);
        if (f.bloqueo) this.proyectarFila(f.bloqueo.e, null);
        if (f.tang) this.proyectarFila(compactar(f.tang.e), null);
      }
      m.cuerdas.forEach((c, k) => {
        if (e.cuerdaActiva[k]) this.proyectarCuerda(c);
      });
    }
  }

  /**
   * Corrige una restricción por el camino de menor energía: si `phi` no es null, la posición (φ → 0, linealizado); si es
   * null, la velocidad (J q̇ → 0).
   */
  private proyectarFila(e0: readonly Entrada[], phi: number | null): void {
    const e = compactar(e0);
    const invM = this.geo.invM;
    const w = e.reduce((s, x) => s + invM[x.k]! * x.g * x.g, 0);
    if (w < 1e-18) return;
    const d = phi ?? this.dotQ(e);
    for (const x of e) this.moverQ(x.k, (-d / w) * invM[x.k]! * x.g, phi === null);
  }

  /**
   * Impulso en un choque: la fila `nueva` (velocidad relativa normal) pasa a `objetivo` y todas las demás restricciones
   * activas quedan con velocidad nula, en un solo sistema (J M⁻¹ Jᵀ) Λ = objetivo − J q̇;  Δq̇ = M⁻¹ Jᵀ Λ. El choque es
   * instantáneo y sin roce: la adherencia no se impone y los que quedan moviéndose pasan a deslizar.
   */
  private impulso(nueva: Fila, objetivo: number): void {
    const m = this.modelo;
    const e = this.estado;
    const R = restricciones(m, this.pose, null, { modo: e.modo, cuerdaActiva: e.cuerdaActiva, N: e.N, contactos: e.contactos, Nc: e.Nc, extra: e.extra }, true);
    const filas = [...R.filas, { e: compactar(nueva.e), gamma: 0 }];
    const A = matrizA(filas, this.geo.invM);
    const b = filas.map((f, r) => (r === filas.length - 1 ? objetivo : 0) - this.dotQ(f.e));
    const L = resolver(A, b);
    filas.forEach((f, r) => {
      for (const x of f.e) this.moverQ(x.k, this.geo.invM[x.k]! * x.g * L[r]!, true);
    });
    e.modo.forEach((md, i) => {
      if (md.k === 'adherido' && Math.abs(vTangente(m, i, md, e.p[i]!, e.v[i]!, e.w[i]!)) > EPS_V) e.modo[i] = { k: 'desliza', s: md.s, lado: md.lado, dir: 0 };
    });
    e.contactos.forEach((c, q) => {
      if (c.k === 'adherido' && Math.abs(vTangPar(m, c, this.pose, this.vel)) > EPS_V) e.contactos[q] = { ...c, k: 'desliza', dir: 0 };
    });
  }

  /** Velocidad de cambio del largo de una cuerda (positiva si se estira). */
  private dphiCuerda(c: CuerdaDef): number {
    const filas = filasCuerda(this.modelo, c, this.pose, null);
    if (filas.length === 1) return this.dotQ(filas[0]!.fila.e);
    // Con poleas con masa: la derivada del largo total, numéricamente.
    const eps = 1e-6;
    return (valorCuerda(this.modelo, c, avanzarPose(this.pose, this.vel, eps)) - valorCuerda(this.modelo, c, avanzarPose(this.pose, this.vel, -eps))) / (2 * eps);
  }

  /** J q̇ de una fila. */
  private dotQ(e: readonly Entrada[]): number {
    let s = 0;
    for (const x of e) s += x.g * this.qPunto(x.k);
    return s;
  }
  private qPunto(k: number): number {
    const e = this.estado;
    const n = this.modelo.cuerpos.length;
    if (k >= 3 * n) return e.wrot[k - 3 * n]!;
    const i = Math.floor(k / 3);
    const r = k % 3;
    return r === 0 ? e.v[i]!.x : r === 1 ? e.v[i]!.y : e.w[i]!;
  }
  private moverQ(k: number, d: number, velocidad: boolean): void {
    const e = this.estado;
    const n = this.modelo.cuerpos.length;
    if (k >= 3 * n) {
      if (velocidad) e.wrot[k - 3 * n]! += d;
      else e.rot[k - 3 * n]! += d;
      return;
    }
    const i = Math.floor(k / 3);
    const r = k % 3;
    if (r === 2) {
      if (velocidad) e.w[i]! += d;
      else e.th[i]! += d;
      return;
    }
    const q = velocidad ? e.v : e.p;
    q[i] = r === 0 ? { x: q[i]!.x + d, y: q[i]!.y } : { x: q[i]!.x, y: q[i]!.y + d };
  }

  /** Lleva la cuerda (cada pieza) a su largo, y su velocidad de cambio a cero, por el camino de menor energía. */
  private proyectarCuerda(c: CuerdaDef): void {
    const invM = this.geo.invM;
    const n = filasCuerda(this.modelo, c, this.pose, null).length;
    for (let j = 0; j < n; j++) {
      const r = filasCuerda(this.modelo, c, this.pose, null)[j]!;
      const e = compactar(r.fila.e);
      const w = e.reduce((s, x) => s + invM[x.k]! * x.g * x.g, 0);
      if (w < 1e-18) continue;
      for (const x of e) this.moverQ(x.k, (-r.phi / w) * invM[x.k]! * x.g, false);
      const r2 = compactar(filasCuerda(this.modelo, c, this.pose, null)[j]!.fila.e);
      const w2 = r2.reduce((s, x) => s + invM[x.k]! * x.g * x.g, 0);
      if (w2 < 1e-18) continue;
      const dv = this.dotQ(r2);
      for (const x of r2) this.moverQ(x.k, (-dv / w2) * invM[x.k]! * x.g, true);
    }
  }

  // -- cambios de régimen -------------------------------------------------------------------------------------

  private evento(t: number, tipo: TipoEvento, cuerpo: number | null, texto: string): void {
    if (this.eventos.length < MAX_EVENTOS) this.eventos.push({ t, tipo, cuerpo, texto });
  }

  private nombre(i: number): string {
    const c = this.modelo.cuerpos[i]!.elemento;
    return c.etiqueta.trim() ? `$${c.etiqueta}$` : `cuerpo ${i + 1}`;
  }

  private din(): Din {
    const e = this.estado;
    return dinamica(this.modelo, this.geo, this.pose, this.vel, { modo: e.modo, cuerdaActiva: e.cuerdaActiva, N: e.N, contactos: e.contactos, Nc: e.Nc, extra: e.extra });
  }

  /** Energía mecánica actual (para contabilizar los ajustes de posición de un cambio de superficie). */
  private mecanica(): number {
    return energias(this.modelo, this.pose, this.vel).E;
  }

  private cinetica(): number {
    const m = this.modelo;
    const e = this.estado;
    let K = 0;
    m.cuerpos.forEach((c, i) => (K += 0.5 * c.masa * dot(e.v[i]!, e.v[i]!) + 0.5 * c.I * e.w[i]! ** 2));
    m.rotores.forEach((r, k) => (K += 0.5 * r.I * e.wrot[k]! ** 2));
    return K;
  }

  /** Lleva el estado al instante `u·h` dentro del paso que acaba de darse (posiciones por Hermite, resto lineal). */
  private retroceder(prev: Prev, u: number, h: number): void {
    const e = this.estado;
    const lerp = (a: number, b: number): number => a + u * (b - a);
    const pose = poseIntermedia(prev, this.pose, this.vel, h, u);
    // Velocidades: la derivada de la misma cúbica de Hermite (exacta con aceleración constante, y en una curva no acorta
    // la rapidez como lo haría promediar dos vectores girados).
    const dv = (x0: number, v0: number, x1: number, v1: number): number => hermiteDerivada(x0, v0, x1, v1, h, u);
    const v = e.v.map((q, j) => ({
      x: dv(prev.pose.p[j]!.x, prev.vel.v[j]!.x, e.p[j]!.x, q.x),
      y: dv(prev.pose.p[j]!.y, prev.vel.v[j]!.y, e.p[j]!.y, q.y),
    }));
    const w = e.w.map((x, j) => dv(prev.pose.th[j]!, prev.vel.w[j]!, e.th[j]!, x));
    const wrot = e.wrot.map((x, k) => dv(prev.pose.rot[k]!, prev.vel.wrot[k]!, e.rot[k]!, x));
    e.p.splice(0, e.p.length, ...pose.p);
    e.th.splice(0, e.th.length, ...pose.th);
    e.rot.splice(0, e.rot.length, ...pose.rot);
    e.v.splice(0, e.v.length, ...v);
    e.w.splice(0, e.w.length, ...w);
    e.wrot.splice(0, e.wrot.length, ...wrot);
    e.W = { roce: lerp(prev.W.roce, e.W.roce), aplicadas: lerp(prev.W.aplicadas, e.W.aplicadas), impactos: prev.W.impactos };
    e.t = prev.t + u * h;
    e.elong = elongaciones(this.modelo, this.pose);
  }

  /** Integra lo que queda de un paso después de un evento, y refresca las salidas. */
  private terminarPaso(resto: number, profundidad: number): void {
    const e = this.estado;
    if (resto > 1e-12) this.integrar(resto, profundidad + 1);
    else {
      this.refrescar();
      if (e.t + 1e-12 >= this.proxima) this.registrar();
    }
  }

  /** Devuelve true si retrocedió a un instante intermedio (impacto o cuerda que se tensa) y ya integró el resto del paso. */
  private cambiosDeRegimen(prev: Prev, h: number, profundidad: number): boolean {
    const m = this.modelo;
    const e = this.estado;
    const n = m.cuerpos.length;

    // 1) Cuerpos que llegan a una superficie: los libres (impacto) y los apoyados que llegan a otra (el pie de un plano:
    //    pasan a la nueva). Se aplica en su instante exacto.
    let primero: { i: number; s: number; lado: 1 | -1; frac: number } | null = null;
    for (let i = 0; i < n; i++) {
      const md = e.modo[i]!;
      m.superficies.forEach((s, k) => {
        if (md.k !== 'libre' && (k === md.s || e.extra[i]?.s === k)) return;
        void s;
        const mPrev = marcoSup(m, k, prev.pose.p[i]!);
        const mNew = marcoSup(m, k, e.p[i]!);
        const hPrev = apoyoAlLlegar(m, this.geo, i, k, prev.pose.th, prev.pose.p[i]!);
        const hNew = apoyoAlLlegar(m, this.geo, i, k, e.th, e.p[i]!);
        const lado: 1 | -1 = mPrev.d >= 0 ? 1 : -1;
        // Una pista de un solo lado no detiene a quien llega por el lado sólido.
        if (s.unLado && lado < 0) return;
        const gapPrev = lado * mPrev.d - hPrev;
        const gapNew = lado * mNew.d - hNew;
        const u = mNew.u;
        // Un cuerpo apoyado solo pasa a otra superficie si va hacia ella.
        if (md.k !== 'libre' && lado * dot(e.v[i]!, mNew.n) >= 0) return;
        if (gapPrev >= -1e-9 && gapNew < 0 && u >= 0 && u <= mNew.largo) {
          const gap = (x: number): number => {
            const q = hermite(prev.pose.p[i]!, prev.vel.v[i]!, e.p[i]!, e.v[i]!, h, x);
            const t = hermite1(prev.pose.th[i]!, prev.vel.w[i]!, e.th[i]!, e.w[i]!, h, x);
            const ths = e.th.slice();
            ths[i] = t;
            return lado * marcoSup(m, k, q).d - apoyoAlLlegar(m, this.geo, i, k, ths, q);
          };
          const frac = gap(0) <= 0 ? 0 : bisectar(gap);
          if (!primero || frac < primero.frac) primero = { i, s: k, lado, frac };
        }
      });
    }
    // 1b) Choques entre cuerpos que no estaban en contacto (el primero del paso)
    const choque = profundidad < 4 ? this.primerChoque(prev, h) : null;
    if (choque && (!primero || choque.frac < (primero as { frac: number }).frac)) {
      this.retroceder(prev, choque.frac, h);
      this.chocar(choque.a, choque.b);
      this.terminarPaso(h * (1 - choque.frac), profundidad);
      return true;
    }
    if (primero && profundidad < 4) {
      const { i, s, lado, frac } = primero as { i: number; s: number; lado: 1 | -1; frac: number };
      // Se vuelve al instante del choque y se aplica allí el impacto.
      this.retroceder(prev, frac, h);
      const sup = m.superficies[s]!;
      const c = m.cuerpos[i]!;
      const kAntes = this.cinetica();
      const cambio = e.modo[i]!.k !== 'libre';
      // Con e > 0 rebota (si el rebote alcanza): la velocidad normal se invierte y se reduce en e. (Un cuerpo que pasa de
      // una superficie a otra no rebota: sigue apoyado.)
      const mLlega = marcoSup(m, s, e.p[i]!);
      const nRebote = { x: mLlega.n.x * lado, y: mLlega.n.y * lado };
      const vnR = dot(e.v[i]!, nRebote);
      if (!cambio && this.e > 0 && -vnR * this.e > V_REBOTE) {
        e.v[i] = { x: e.v[i]!.x - (1 + this.e) * vnR * nRebote.x, y: e.v[i]!.y - (1 + this.e) * vnR * nRebote.y };
        e.W.impactos = prev.W.impactos + this.cinetica() - kAntes;
        this.evento(e.t, 'rebote', i, `${this.nombre(i)} rebota en la superficie`);
        this.terminarPaso(h * (1 - frac), profundidad);
        return true;
      }
      // Un bloque que gira cae sobre una cara: queda alineado con la superficie y deja de girar (choque inelástico).
      // Uno que no gira (partícula) también queda alineado: su orientación solo se ve.
      if (c.elemento.tipo === 'bloque') {
        e.th[i] = anguloAlineado(m, s, e.th[i]!, e.p[i]!);
        e.w[i] = 0;
      }
      void sup;
      const nOut = { x: mLlega.n.x * lado, y: mLlega.n.y * lado };
      const gap = lado * mLlega.d - apoyoActual(m, this.geo, i, s, e.th, e.p[i]!);
      e.p[i] = { x: e.p[i]!.x - nOut.x * gap, y: e.p[i]!.y - nOut.y * gap };
      const vn = dot(e.v[i]!, nOut);
      if (vn < 0) e.v[i] = { x: e.v[i]!.x - vn * nOut.x, y: e.v[i]!.y - vn * nOut.y };
      e.W.impactos = prev.W.impactos + this.cinetica() - kAntes;
      if (cambio && this.quedaEnEsquina(i, s, lado)) {
        this.terminarPaso(h * (1 - frac), profundidad);
        return true;
      }
      e.modo[i] = { k: 'desliza', s, lado, dir: 0 };
      e.extra[i] = null;
      if (cambio) this.evento(e.t, 'cambia-superficie', i, `${this.nombre(i)} pasa a la otra superficie`);
      else this.evento(e.t, 'impacto', i, `${this.nombre(i)} llega a la superficie y queda apoyado`);
      // Solo puede quedar adherido si llega sin velocidad (del punto de contacto) a lo largo de la superficie (o, si
      // pasa de una superficie a otra, si venía rodando o quieto).
      if (cambio) this.seguirAdherido(i);
      else if (Math.abs(vTangente(m, i, e.modo[i] as Extract<Modo, { s: number }>, e.p[i]!, e.v[i]!, e.w[i]!)) < EPS_V) this.reconciliar(new Set([i]), true);
      this.terminarPaso(h * (1 - frac), profundidad);
      return true;
    }

    // 1c) Cuerpos apoyados que pasan por el extremo de su superficie: se ubica el instante exacto (como un impacto), para
    //     que el cambio a otra superficie que sigue (el piso al pie de una rampa curva) no deba corregir la posición.
    if (profundidad < 4) {
      let sale: { i: number; frac: number } | null = null;
      for (let i = 0; i < n; i++) {
        const md = e.modo[i]!;
        if (md.k === 'libre') continue;
        const mN = marcoSup(m, md.s, e.p[i]!);
        if (mN.u >= 0 && mN.u <= mN.largo) continue;
        const mP = marcoSup(m, md.s, prev.pose.p[i]!);
        if (mP.u < 0 || mP.u > mP.largo) continue;
        const borde = mN.u < 0 ? 0 : mN.largo;
        const pose = this.pose;
        const vel = this.vel;
        const f = (x: number): number => marcoSup(m, md.s, poseIntermedia(prev, pose, vel, h, x).p[i]!).u - borde;
        const frac = bisectar(f);
        if (!sale || frac < sale.frac) sale = { i, frac };
      }
      if (sale && sale.frac < 1 - 1e-9) {
        this.retroceder(prev, sale.frac, h);
        // Un pelo más allá del borde, para que la revisión de abajo (salida por el extremo) lo trate ahora.
        this.salirPorExtremo(sale.i);
        this.terminarPaso(h * (1 - sale.frac), profundidad);
        return true;
      }
    }

    // 2) Resortes: paso por el largo natural
    const el = elongaciones(m, this.pose);
    el.forEach((x, k) => {
      const x0 = prev.elong[k]!;
      if (x0 * x < 0) this.evento(prev.t + (h * x0) / (x0 - x), 'resorte-natural', null, `El resorte ${k + 1} pasa por su largo natural`);
    });
    e.elong = el;

    // 3) Cuerdas que se tensan: en su instante exacto (antes se evalúa si alguna estaba floja y llegó a su largo)
    if (profundidad < 4) {
      for (let k = 0; k < m.cuerdas.length; k++) {
        if (e.cuerdaActiva[k]) continue;
        const c = m.cuerdas[k]!;
        const phiNew = valorCuerda(m, c, this.pose);
        if (!(prev.phi[k]! < -1e-9 && phiNew >= -1e-9) || this.dphiCuerda(c) < 0) continue;
        const pose = this.pose;
        const vel = this.vel;
        const phi = (x: number): number => valorCuerda(m, c, poseIntermedia(prev, pose, vel, h, x));
        const frac = bisectar(phi);
        this.retroceder(prev, frac, h);
        const antes = this.cinetica();
        e.cuerdaActiva[k] = true;
        this.proyectarCuerda(c);
        e.W.impactos += this.cinetica() - antes;
        this.evento(e.t, 'cuerda-tensa', null, `La cuerda ${k + 1} se tensa`);
        this.terminarPaso(h * (1 - frac), profundidad);
        return true;
      }
    }

    // 3b) Cuerdas que se aflojan (alguna de sus piezas tendría que empujar)
    // (La dinámica se recalcula solo después de aflojar una: con muchas cuerdas, no una vez por cuerda.)
    let dc = m.cuerdas.length > 0 ? this.din() : null;
    for (let k = 0; dc && k < m.cuerdas.length; k++) {
      if (!e.cuerdaActiva[k] || !(Math.min(...dc.Tp[k]!) < -EPS_F)) continue;
      e.cuerdaActiva[k] = false;
      this.evento(e.t, 'cuerda-floja', null, `La cuerda ${k + 1} se afloja`);
      dc = this.din();
    }

    // 4) Cuerpos apoyados: despegue, salida por el extremo, detención, ruptura del roce estático
    const candidatos = new Set<number>();
    const velAntes = new Map<number, { v: Punto; w: number }>();
    let d = dc ?? this.din();
    for (let i = 0; i < n; i++) {
      const md = e.modo[i]!;
      if (md.k === 'libre') continue;
      // La segunda superficie (esquina) se suelta si su normal se haría negativa o si el cuerpo sale de ella.
      const x2 = e.extra[i];
      if (x2) {
        const m2 = marcoSup(m, x2.s, e.p[i]!);
        if (d.Nx[i]! < -EPS_F || m2.u < 0 || m2.u > m2.largo) {
          e.extra[i] = null;
          d = this.din();
        }
      }
      if (d.N[i]! < -EPS_F) {
        const x = e.extra[i];
        e.extra[i] = null;
        if (x) {
          // Deja la primera pero sigue apoyado en la segunda (la pared de la esquina, por ejemplo).
          e.modo[i] = { k: 'desliza', s: x.s, lado: x.lado, dir: 0 };
          this.evento(e.t, 'cambia-superficie', i, `${this.nombre(i)} pasa a la otra superficie`);
        } else {
          e.modo[i] = { k: 'libre' };
          this.evento(e.t, 'despegue', i, `${this.nombre(i)} se despega de la superficie`);
        }
        d = this.din();
        continue;
      }
      const mk = marcoSup(m, md.s, e.p[i]!);
      if (mk.u < 0 || mk.u > mk.largo) {
        this.salirPorExtremo(i);
        d = this.din();
        continue;
      }
      if (md.k === 'desliza') {
        const vtPrev = vTangente(m, i, md, e.p[i]!, prev.vel.v[i]!, prev.vel.w[i]!);
        const vtNew = vTangente(m, i, md, e.p[i]!, e.v[i]!, e.w[i]!);
        // Una esfera que gira y desliza llega a rodar sin deslizar cuando el deslizamiento se anula. Con el roce que cambia de
        // signo dentro del paso, puede quedar oscilando cerca de cero sin cambiar de signo entre pasos: si llegaría a cero en
        // el paso siguiente (al ritmo actual), se considera que ya llegó.
        const llega = this.rueda(i) && Math.abs(vtNew) < Math.abs(vtPrev) && Math.abs(vtNew) <= Math.abs(vtPrev - vtNew);
        if (Math.abs(vtPrev) > EPS_V && (vtPrev * vtNew < 0 || Math.abs(vtNew) < EPS_V || llega)) {
          velAntes.set(i, { v: { ...e.v[i]! }, w: e.w[i]! });
          // Se anula la velocidad del punto de contacto (en una esfera que gira, repartida entre v y ω).
          const rc = brazoContacto(m, i, { x: mk.n.x * md.lado, y: mk.n.y * md.lado });
          const im = this.geo.inv[i]!;
          const iI = rc ? this.geo.invM[dT(i)]! : 0;
          const ct = rc ? cruz(rc, mk.t) : 0;
          const lam = -vtNew / (im + iI * ct * ct);
          e.v[i] = { x: e.v[i]!.x + im * lam * mk.t.x, y: e.v[i]!.y + im * lam * mk.t.y };
          if (rc) e.w[i] = e.w[i]! + iI * lam * ct;
          candidatos.add(i);
        }
      }
    }
    // 4b) Contactos entre cuerpos: separación, caída por el borde, detención relativa
    for (let vuelta = 0; vuelta <= e.contactos.length; vuelta++) {
      const q = e.contactos.findIndex((c, k) => {
        if (d.Nc[k]! < -EPS_F) return true;
        const g = geoContacto(m, c, this.pose);
        return Math.abs(g.u) > g.semiCara;
      });
      if (q < 0) break;
      const c = e.contactos[q]!;
      const cae = d.Nc[q]! >= -EPS_F;
      this.quitarContacto(q);
      this.evento(e.t, cae ? 'sale-extremo' : 'separa', c.i, cae ? `${this.nombre(c.i)} cae por el borde de ${this.nombre(c.j)}` : `${this.nombre(c.i)} y ${this.nombre(c.j)} se separan`);
      d = this.din();
    }
    const contCand = new Set<number>();
    const velAntesC = new Map<number, Vel>();
    e.contactos.forEach((c, q) => {
      if (c.k !== 'desliza') return;
      const vtPrev = vTangPar(m, c, this.pose, prev.vel);
      const vtNew = vTangPar(m, c, this.pose, this.vel);
      if (Math.abs(vtPrev) > EPS_V && (vtPrev * vtNew < 0 || Math.abs(vtNew) < EPS_V)) {
        velAntesC.set(q, { v: e.v.map((x) => ({ ...x })), w: e.w.slice(), wrot: e.wrot.slice() });
        const g = geoContacto(m, c, this.pose);
        this.proyectarFila(entradasPar(m, c.i, c.j, g.t, g.ri, g.rj), null);
        contCand.add(q);
      }
    });
    if (candidatos.size > 0 || contCand.size > 0) {
      this.reconciliar(candidatos, true, contCand);
      // Un contacto que no quedó adherido sigue con la velocidad que traía (ya cambió de sentido).
      for (const [q, x] of velAntesC) {
        if (e.contactos[q]?.k !== 'desliza') continue;
        e.v.splice(0, e.v.length, ...x.v);
        e.w.splice(0, e.w.length, ...x.w);
      }
      // Si no quedó adherido, no hay razón para frenarlo: sigue con la velocidad que traía (ya cambió de sentido). Si quedó,
      // el deslizamiento que quedaba (menos de un paso) lo anuló el roce: esa energía es trabajo del roce.
      for (const [i, x] of velAntes) {
        const c = m.cuerpos[i]!;
        if (e.modo[i]!.k !== 'desliza') {
          const Kc = (v: Punto, w: number): number => 0.5 * c.masa * dot(v, v) + 0.5 * c.I * w * w;
          e.W.roce += Kc(e.v[i]!, e.w[i]!) - Kc(x.v, x.w);
          continue;
        }
        e.v[i] = x.v;
        e.w[i] = x.w;
      }
      d = this.din();
    }

    for (let i = 0; i < n; i++) {
      const md = e.modo[i]!;
      if (md.k !== 'adherido') continue;
      const s = m.superficies[md.s]!;
      if (Math.abs(d.fric[i]!) > s.muS * Math.max(d.N[i]!, 0) + 1e-9) {
        e.modo[i] = { k: 'desliza', s: md.s, lado: md.lado, dir: -signo(d.fric[i]!) };
        this.evento(e.t, 'estatico-cinetico', i, `${this.nombre(i)} ${this.rueda(i) ? 'deja de rodar sin deslizar: desliza' : 'vence el roce estático y empieza a deslizar'}`);
        d = this.din();
      }
    }
    e.contactos.forEach((c, q) => {
      if (c.k !== 'adherido') return;
      if (Math.abs(d.fc[q]!) > rocePar(m, c).muS * Math.max(d.Nc[q]!, 0) + 1e-9) {
        e.contactos[q] = { ...c, k: 'desliza', dir: -signo(d.fc[q]!) };
        this.evento(e.t, 'estatico-cinetico', c.i, `${this.nombre(c.i)} empieza a deslizar sobre ${this.nombre(c.j)}`);
        d = this.din();
      }
    });
    // La última dinámica corresponde al estado final del paso: refrescar() la reutiliza.
    this.dinFinal = d;
    return false;
  }

  /** Dinámica del estado final del paso, ya calculada al revisar los cambios de régimen. */
  private dinFinal: Din | null = null;

  /**
   * Un cuerpo apoyado que llegó a la superficie k (ya sin la velocidad que la atravesaría): ¿queda en la esquina, tocando
   * las dos, o pasa a la nueva? Si se aleja de la que tenía (el pie de un plano, una rampa), pasa; si las fuerzas lo
   * apretan contra las dos (un bloque empujado contra la pared), quedan las dos. Devuelve true si quedó en la esquina.
   */
  private quedaEnEsquina(i: number, k: number, lado: 1 | -1): boolean {
    const m = this.modelo;
    const e = this.estado;
    const md = e.modo[i]!;
    if (md.k === 'libre') return false;
    const n0 = marcoSup(m, md.s, e.p[i]!).n;
    const n0Out = { x: n0.x * md.lado, y: n0.y * md.lado };
    if (dot(e.v[i]!, n0Out) > EPS_V) return false;
    // Si las dos normales casi coinciden (una curva que empieza tangente al piso, un plano poco inclinado) no es una
    // esquina: pasa a la nueva.
    const nk = marcoSup(m, k, e.p[i]!).n;
    if (dot(n0Out, { x: nk.x * lado, y: nk.y * lado }) > Math.SQRT1_2) return false;
    e.extra[i] = { s: k, lado };
    const d = this.din();
    if (d.N[i]! < -EPS_F) {
      e.extra[i] = null;
      return false; // la nueva lo sostiene sola: pasa a ella
    }
    if (d.Nx[i]! < -EPS_F) {
      e.extra[i] = null; // solo la rozó: sigue en la que tenía
      return true;
    }
    this.evento(e.t, 'cambia-superficie', i, `${this.nombre(i)} queda apoyado en las dos superficies (esquina)`);
    return true;
  }

  /**
   * Un cuerpo que sale por el extremo de la superficie `desde` y ya toca otra (dos tramos de piso seguidos, la cima de una
   * rampa que da a una meseta): se acomoda sobre ella. Si va hacia ella, sigue apoyado (pierde solo la velocidad que la
   * atravesaría); si se aleja (un borde convexo), queda en el aire justo sobre ella. Devuelve true si siguió apoyado.
   */
  private seguirEnOtra(i: number, desde: number): boolean {
    const m = this.modelo;
    const e = this.estado;
    let mejor: { k: number; lado: 1 | -1; gap: number } | null = null;
    m.superficies.forEach((_, k) => {
      if (k === desde) return;
      const mk = marcoSup(m, k, e.p[i]!);
      if (mk.u < -1e-6 || mk.u > mk.largo + 1e-6) return;
      const d = mk.d;
      const lado: 1 | -1 = d >= 0 ? 1 : -1;
      if (m.superficies[k]!.unLado && lado < 0) return;
      const h = apoyoAlLlegar(m, this.geo, i, k, e.th, e.p[i]!);
      const gap = lado * d - h;
      // Toca si está a menos de 1 mm, o metido menos que su propio apoyo (el bloque inclinado en la arista).
      if (gap > 1e-3 || gap < -h) return;
      if (!mejor || Math.abs(gap) < Math.abs(mejor.gap)) mejor = { k, lado, gap };
    });
    if (!mejor) return false;
    const { k, lado } = mejor as { k: number; lado: 1 | -1; gap: number };
    const c = m.cuerpos[i]!;
    const eAntes = this.mecanica();
    if (c.elemento.tipo === 'bloque') {
      e.th[i] = anguloAlineado(m, k, e.th[i]!, e.p[i]!);
      e.w[i] = 0;
    }
    const mk = marcoSup(m, k, e.p[i]!);
    const nOut = { x: mk.n.x * lado, y: mk.n.y * lado };
    const gap = lado * mk.d - apoyoActual(m, this.geo, i, k, e.th, e.p[i]!);
    e.p[i] = { x: e.p[i]!.x - nOut.x * gap, y: e.p[i]!.y - nOut.y * gap };
    const vn = dot(e.v[i]!, nOut);
    // Se aleja si su velocidad forma más de ~1° con la nueva superficie (menos que eso es el paso que se pasó del extremo
    // de una curva que llega tangente).
    if (vn > 0.02 * Math.hypot(e.v[i]!.x, e.v[i]!.y) + EPS_V) return false;
    if (vn < 0) e.v[i] = { x: e.v[i]!.x - vn * nOut.x, y: e.v[i]!.y - vn * nOut.y };
    e.W.impactos += this.mecanica() - eAntes;
    e.modo[i] = { k: 'desliza', s: k, lado, dir: 0 };
    this.evento(e.t, 'cambia-superficie', i, `${this.nombre(i)} pasa a la otra superficie`);
    return true;
  }

  /**
   * Tras pasar a otra superficie: si el punto de contacto casi no desliza (venía rodando, o en reposo), se prueba si el
   * roce estático lo sostiene, sin avisar (no es un evento nuevo: sigue rodando o quieto).
   */
  private seguirAdherido(i: number): void {
    const m = this.modelo;
    const e = this.estado;
    const md = e.modo[i]!;
    if (md.k !== 'desliza') return;
    const vt = vTangente(m, i, md, e.p[i]!, e.v[i]!, e.w[i]!);
    if (Math.abs(vt) < Math.max(EPS_V, 1e-4 * Math.hypot(e.v[i]!.x, e.v[i]!.y))) this.reconciliar(new Set([i]), false);
  }

  /**
   * El cuerpo apoyado `i` llegó al extremo de su superficie: si estaba en una esquina sigue en la otra; si ya toca otra
   * superficie, pasa a ella; si no, sigue en el aire.
   */
  private salirPorExtremo(i: number): void {
    const e = this.estado;
    const md = e.modo[i]!;
    if (md.k === 'libre') return;
    const x = e.extra[i];
    e.extra[i] = null;
    if (x) {
      e.modo[i] = { k: 'desliza', s: x.s, lado: x.lado, dir: 0 };
      this.evento(e.t, 'cambia-superficie', i, `${this.nombre(i)} pasa a la otra superficie`);
      this.seguirAdherido(i);
      return;
    }
    if (this.seguirEnOtra(i, md.s)) {
      this.seguirAdherido(i);
      return;
    }
    e.modo[i] = { k: 'libre' };
    this.evento(e.t, 'sale-extremo', i, `${this.nombre(i)} sale por el extremo de la superficie`);
  }

  private quitarContacto(q: number): void {
    const e = this.estado;
    e.contactos.splice(q, 1);
    e.Nc.splice(q, 1);
    e.fc.splice(q, 1);
  }

  /** El primer choque del paso entre dos cuerpos que no estaban en contacto (fracción del paso), o null. */
  private primerChoque(prev: Prev, h: number): { a: number; b: number; frac: number } | null {
    const m = this.modelo;
    const e = this.estado;
    const n = m.cuerpos.length;
    if (n < 2) return null;
    const enContacto = new Set(e.contactos.map((c) => `${Math.min(c.i, c.j)},${Math.max(c.i, c.j)}`));
    const pose = this.pose;
    const vel = this.vel;
    let mejor: { a: number; b: number; frac: number } | null = null;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        if (enContacto.has(`${a},${b}`)) continue;
        if (Math.hypot(e.p[a]!.x - e.p[b]!.x, e.p[a]!.y - e.p[b]!.y) > radioEnvolvente(m, a) + radioEnvolvente(m, b)) continue;
        if (separacion(m, a, b, pose).gap >= 0) continue;
        // Si ya se traslapaban al comienzo del paso (dibujados así), no es un choque: se ignoran hasta que se separen.
        if (separacion(m, a, b, prev.pose).gap < -1e-9) continue;
        const f = (u: number): number => separacion(m, a, b, poseIntermedia(prev, pose, vel, h, u)).gap;
        const frac = f(0) <= 0 ? 0 : bisectar(f);
        if (!mejor || frac < mejor.frac) mejor = { a, b, frac };
      }
    }
    return mejor;
  }

  /** Choque entre a y b en el instante actual: impulso con restitución y, si no rebotan, contacto persistente. */
  private chocar(a: number, b: number): void {
    const m = this.modelo;
    const e = this.estado;
    const car: Caracteristica = separacion(m, a, b, this.pose);
    let fila: Fila;
    let n: Punto;
    if (car.esquina) {
      const ri = { x: car.P.x - e.p[car.i]!.x, y: car.P.y - e.p[car.i]!.y };
      const rj = { x: car.P.x - e.p[car.j]!.x, y: car.P.y - e.p[car.j]!.y };
      n = car.n;
      fila = { e: entradasPar(m, car.i, car.j, n, ri, rj), gamma: 0 };
    } else {
      const g = geoContacto(m, car, this.pose);
      n = g.n;
      fila = { e: entradasPar(m, car.i, car.j, n, g.ri, g.rj), gamma: 0 };
    }
    const vn = this.dotQ(compactar(fila.e));
    if (vn >= 0) return; // ya se están separando
    const kAntes = this.cinetica();
    const rebota = this.e > 0 && -vn * this.e > V_REBOTE;
    this.impulso(fila, rebota ? -this.e * vn : 0);
    e.W.impactos += this.cinetica() - kAntes;
    const [ni, nj] = [this.nombre(car.i), this.nombre(car.j)];
    if (rebota || car.esquina) {
      if (-vn > 1e-4) this.evento(e.t, rebota ? 'rebote' : 'choque', car.i, rebota ? `${ni} y ${nj} chocan y rebotan` : `${ni} choca con ${nj}`);
      return;
    }
    e.contactos.push({ i: car.i, j: car.j, cara: car.cara, k: 'desliza', dir: 0 });
    e.Nc.push(0);
    e.fc.push(0);
    const sobre = n.y > 0.5 ? `${ni} cae sobre ${nj}` : n.y < -0.5 ? `${nj} cae sobre ${ni}` : `${ni} choca con ${nj}`;
    this.evento(e.t, 'choque', car.i, `${sobre} y quedan en contacto`);
    const q = e.contactos.length - 1;
    if (Math.abs(vTangPar(m, e.contactos[q]!, this.pose, this.vel)) < EPS_V) this.reconciliar(new Set(), true, new Set([q]));
  }

  /** ¿Es una esfera que gira (rueda)? */
  private rueda(i: number): boolean {
    const c = this.modelo.cuerpos[i]!;
    return c.I > 0 && c.elemento.tipo === 'esfera';
  }

  /**
   * Decide quiénes de `candidatos` (cuerpos apoyados sin velocidad del punto de contacto a lo largo de la superficie)
   * los sostiene el roce estático (o ruedan sin deslizar). Los prueba como adheridos y suelta a los que necesitan más
   * roce del que hay (|f| > μs N): esos pasan a deslizar en el sentido en que los empuja el resto de las fuerzas.
   */
  private reconciliar(candidatos: Set<number>, avisar: boolean, contCand: Set<number> = new Set()): void {
    const m = this.modelo;
    const e = this.estado;
    if (candidatos.size === 0 && contCand.size === 0) return;
    for (const i of candidatos) {
      const md = e.modo[i]!;
      if (md.k === 'desliza') e.modo[i] = { k: 'adherido', s: md.s, lado: md.lado };
    }
    for (const q of contCand) e.contactos[q] = { ...e.contactos[q]!, k: 'adherido' };
    const sueltos = new Set<number>();
    const sueltosC = new Set<number>();
    for (let vuelta = 0; vuelta <= candidatos.size + contCand.size; vuelta++) {
      const d = this.din();
      let cambio = false;
      for (const i of candidatos) {
        const md = e.modo[i]!;
        if (md.k !== 'adherido') continue;
        const s = m.superficies[md.s]!;
        if (Math.abs(d.fric[i]!) > s.muS * Math.max(d.N[i]!, 0) + 1e-9) {
          e.modo[i] = { k: 'desliza', s: md.s, lado: md.lado, dir: -signo(d.fric[i]!) };
          sueltos.add(i);
          cambio = true;
          break;
        }
      }
      if (!cambio) {
        for (const q of contCand) {
          const c = e.contactos[q]!;
          if (c.k !== 'adherido') continue;
          if (Math.abs(d.fc[q]!) > rocePar(m, c).muS * Math.max(d.Nc[q]!, 0) + 1e-9) {
            e.contactos[q] = { ...c, k: 'desliza', dir: -signo(d.fc[q]!) };
            sueltosC.add(q);
            cambio = true;
            break;
          }
        }
      }
      if (!cambio) break;
    }
    if (!avisar) return;
    for (const q of contCand) {
      const c = e.contactos[q]!;
      const mu = rocePar(m, c);
      if (c.k === 'adherido') this.evento(e.t, 'detencion', c.i, `${this.nombre(c.i)} queda en reposo respecto de ${this.nombre(c.j)}`);
      else if (sueltosC.has(q) && (mu.muS > 0 || mu.muK > 0)) this.evento(e.t, 'invierte', c.i, `${this.nombre(c.i)} cambia de sentido sobre ${this.nombre(c.j)}`);
    }
    for (const i of candidatos) {
      if (e.modo[i]!.k === 'adherido') {
        if (this.rueda(i) && Math.hypot(e.v[i]!.x, e.v[i]!.y) > 1e-6) this.evento(e.t, 'detencion', i, `${this.nombre(i)} rueda sin deslizar`);
        else this.evento(e.t, 'detencion', i, `${this.nombre(i)} se detiene (el roce estático lo sostiene)`);
      } else if (sueltos.has(i)) {
        // En una superficie sin roce, invertir el movimiento no es un cambio de régimen: no se registra.
        const md = e.modo[i]!;
        const sup = md.k === 'libre' ? null : m.superficies[md.s]!;
        if (sup && (sup.muK > 0 || sup.muS > 0)) this.evento(e.t, 'invierte', i, `${this.nombre(i)} se detiene un instante y cambia de sentido`);
      }
    }
  }

  // -- salidas -----------------------------------------------------------------------------------------------------

  /** Aceleración, normales, roces y tensiones del estado actual. */
  private refrescar(): void {
    const e = this.estado;
    const d = this.dinFinal ?? this.din();
    this.dinFinal = null;
    e.a = d.a;
    e.alfa = d.alfa;
    e.N = d.N;
    e.fric = d.fric;
    e.T = d.T;
    e.Tp = d.Tp.map((x) => (x.length > 0 ? x : [0]));
    e.Nc = d.Nc;
    e.fc = d.fc;
    e.Nx = d.Nx;
  }

  private registrar(): void {
    const m = this.modelo;
    const e = this.estado;
    const en = energias(m, this.pose, this.vel);
    this.historial.push({
      t: e.t,
      cuerpos: m.cuerpos.map((c, i) => ({
        x: e.p[i]!.x,
        y: e.p[i]!.y,
        vx: e.v[i]!.x,
        vy: e.v[i]!.y,
        ax: e.a[i]!.x,
        ay: e.a[i]!.y,
        K: 0.5 * c.masa * dot(e.v[i]!, e.v[i]!) + 0.5 * c.I * e.w[i]! ** 2,
        Ug: c.masa * m.g * e.p[i]!.y,
        N: e.N[i]!,
        f: e.fric[i]!,
        th: e.th[i]!,
        w: e.w[i]!,
      })),
      Ue: en.Ue,
      E: en.E,
      Wroce: e.W.roce,
      Waplicadas: e.W.aplicadas,
      Wimpactos: e.W.impactos,
    });
    this.proxima = e.t + this.periodo;
    if (this.historial.length > MAX_MUESTRAS) {
      // Se conserva una de cada dos muestras y se duplica el período: la historia nunca crece sin límite.
      this.historial = this.historial.filter((_, k) => k % 2 === 0);
      this.periodo *= 2;
      this.proxima = e.t + this.periodo;
    }
  }

  /** Energía actual y trabajo de las fuerzas no conservativas. */
  energiaActual(): Energias & { Wnc: number; residuo: number } {
    const e = this.estado;
    const en = energias(this.modelo, this.pose, this.vel);
    const Wnc = e.W.roce + e.W.aplicadas + e.W.impactos;
    return { ...en, Wnc, residuo: en.E - this.energiaInicial - Wnc };
  }

  /** Posición actual de un extremo de cuerda o resorte (con el giro del cuerpo). */
  posicionExtremo(e: Extremo): Punto {
    return posExt(this.modelo, e, this.pose);
  }

  /** Una descripción corta del estado de un cuerpo, para mostrar en la interfaz. */
  descripcion(i: number): string {
    const md = this.estado.modo[i]!;
    if (md.k === 'libre') {
      // Sobre otro cuerpo (o en contacto con él)
      for (const c of this.estado.contactos) {
        if (c.i !== i && c.j !== i) continue;
        const g = geoContacto(this.modelo, c, this.pose);
        const otro = c.i === i ? c.j : c.i;
        const arriba = c.i === i ? g.n.y > 0.5 : g.n.y < -0.5;
        return `${arriba ? 'sobre' : 'en contacto con'} ${this.nombre(otro)}`;
      }
      return 'en el aire';
    }
    const moviendo = Math.abs(dot(this.estado.v[i]!, marcoSup(this.modelo, md.s, this.estado.p[i]!).t)) > 1e-6;
    if (md.k === 'adherido') {
      if (this.rueda(i) && moviendo) return 'rueda sin deslizar';
      return this.modelo.superficies[md.s]!.muS > 0 ? 'en reposo (roce estático)' : 'en reposo';
    }
    return moviendo ? 'deslizando' : 'apoyado';
  }
}
