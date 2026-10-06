import type { Punto } from '../core/camara';
import { apoyoEn } from '../physics/dcl';
import type { PasoGeo } from '../grafo/ruta';
import { geometriaRuta, largosPorPieza } from '../grafo/ruta';
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
 * una por pieza si pasan por poleas con masa) y el bloqueo del giro de un bloque apoyado (no se vuelca). El roce
 * cinético (μk N, opuesto al deslizamiento del punto de contacto) se itera con N hasta converger.
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
  | 'llega-polea';

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
    const L = largosPorPieza(g, masivas.map((x) => x.j))[k]!;
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

// --- Dinámica -----------------------------------------------------------------------------------------------------

interface Din {
  a: Punto[];
  alfa: number[];
  arot: number[];
  N: number[];
  fric: number[];
  T: number[];
  Tp: number[][];
  potRoce: number;
  potAp: number;
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
function apoyoActual(m: Modelo, geo: Geo, i: number, k: number, th: readonly number[]): number {
  const c = m.cuerpos[i]!;
  if (c.I === 0 || c.elemento.tipo !== 'bloque') return geo.apoyo[i]![k]!;
  return apoyoEn({ ...c.elemento, angulo: th[i]! }, m.superficies[k]!.n);
}

/** Brazo del centro de una esfera que gira al punto de contacto con su superficie (null si no es el caso). */
function brazoContacto(m: Modelo, i: number, nOut: Punto): Punto | null {
  const c = m.cuerpos[i]!;
  if (c.I === 0 || c.elemento.tipo !== 'esfera') return null;
  return { x: -nOut.x * c.radio, y: -nOut.y * c.radio };
}

/** Velocidad del punto de contacto a lo largo de la superficie (la del centro si el cuerpo no rueda). */
function vTangente(m: Modelo, i: number, md: Extract<Modo, { s: number }>, v: Punto, w: number): number {
  const s = m.superficies[md.s]!;
  const rc = brazoContacto(m, i, { x: s.n.x * md.lado, y: s.n.y * md.lado });
  return dot(v, s.t) + (rc ? w * cruz(rc, s.t) : 0);
}

function dinamica(m: Modelo, geo: Geo, pose: Pose, vel: Vel, meta: Pick<Estado, 'modo' | 'cuerdaActiva' | 'N'>): Din {
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
  const filas: Fila[] = [];
  const filaContacto = new Array<number>(n).fill(-1);
  const filaTang = new Array<number>(n).fill(-1);
  const filaCuerda: number[][] = m.cuerdas.map(() => []);
  for (let i = 0; i < n; i++) {
    const md = meta.modo[i]!;
    if (md.k === 'libre') continue;
    const s = m.superficies[md.s]!;
    const nOut = { x: s.n.x * md.lado, y: s.n.y * md.lado };
    filaContacto[i] = filas.length;
    filas.push({ e: [{ k: dX(i), g: nOut.x }, { k: dY(i), g: nOut.y }], gamma: 0 });
    // Un bloque que gira, mientras está apoyado, no se vuelca: su giro queda bloqueado.
    if (m.cuerpos[i]!.I > 0 && m.cuerpos[i]!.elemento.tipo === 'bloque') filas.push({ e: [{ k: dT(i), g: 1 }], gamma: 0 });
    if (md.k === 'adherido') {
      // Sin deslizar: el punto de contacto no se mueve a lo largo de la superficie (en una esfera que gira: rodadura).
      const rc = brazoContacto(m, i, nOut);
      filaTang[i] = filas.length;
      filas.push({ e: [{ k: dX(i), g: s.t.x }, { k: dY(i), g: s.t.y }, ...(rc ? [{ k: dT(i), g: cruz(rc, s.t) }] : [])], gamma: 0 });
    }
  }
  m.cuerdas.forEach((c, k) => {
    if (!meta.cuerdaActiva[k]) return;
    for (const { fila } of filasCuerda(m, c, pose, vel)) {
      filaCuerda[k]!.push(filas.length);
      filas.push({ e: compactar(fila.e), gamma: fila.gamma });
    }
  });

  const hayDeslizando = meta.modo.some((md) => md.k === 'desliza');
  let Nsup = meta.N.map((x, i) => (x > 0 ? x : m.cuerpos[i]!.masa * m.g * 0.5));
  let q2: number[] = [];
  let lambda: number[] = [];
  let fricFuerza = new Array<number>(n).fill(0);
  const nf = filas.length;
  // A = J M⁻¹ Jᵀ no depende del roce cinético: se arma una sola vez por evaluación.
  const A0: number[][] = Array.from({ length: nf }, () => new Array<number>(nf).fill(0));
  for (let r = 0; r < nf; r++) {
    for (let s = r; s < nf; s++) {
      let suma = 0;
      for (const a of filas[r]!.e) for (const b of filas[s]!.e) if (a.k === b.k) suma += a.g * b.g * geo.invM[a.k]!;
      A0[r]![s] = suma;
      A0[s]![r] = suma;
    }
  }
  for (let it = 0; it < (hayDeslizando ? 6 : 1); it++) {
    const Qi = Q.slice();
    fricFuerza = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      const md = meta.modo[i]!;
      if (md.k !== 'desliza') continue;
      const s = m.superficies[md.s]!;
      const vt = vTangente(m, i, md, vel.v[i]!, vel.w[i]!);
      const sg = Math.abs(vt) > EPS_V ? signo(vt) : md.dir;
      const fr = -sg * s.muK * Math.max(Nsup[i]!, 0);
      fricFuerza[i] = fr;
      Qi[dX(i)]! += fr * s.t.x;
      Qi[dY(i)]! += fr * s.t.y;
      // El roce actúa en el punto de contacto: en una esfera que gira, también hace torque.
      const rc = brazoContacto(m, i, { x: s.n.x * md.lado, y: s.n.y * md.lado });
      if (rc) Qi[dT(i)]! += fr * cruz(rc, s.t);
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
    const dif = Math.max(0, ...nueva.map((x2, i) => Math.abs(x2 - Math.max(Nsup[i]!, 0))));
    Nsup = nueva.map((x2, i) => (meta.modo[i]!.k === 'desliza' ? x2 : Nsup[i]!));
    if (dif < 1e-11) break;
  }

  const a = m.cuerpos.map((_, i) => ({ x: q2[dX(i)] ?? 0, y: q2[dY(i)] ?? 0 }));
  const alfa = m.cuerpos.map((_, i) => q2[dT(i)] ?? 0);
  const arot = m.rotores.map((_, k) => q2[3 * n + k] ?? 0);
  const N = m.cuerpos.map((_, i) => (filaContacto[i]! >= 0 ? lambda[filaContacto[i]!]! : 0));
  const fric = m.cuerpos.map((_, i) => (meta.modo[i]!.k === 'adherido' ? lambda[filaTang[i]!]! : fricFuerza[i]!));
  const Tp = filaCuerda.map((rs) => rs.map((r) => -lambda[r]!));
  const T = m.cuerdas.map((_, k) => Tp[k]![0] ?? 0);
  let potRoce = 0;
  let potAp = 0;
  for (let i = 0; i < n; i++) {
    const md = meta.modo[i]!;
    if (md.k === 'desliza') potRoce += fricFuerza[i]! * vTangente(m, i, md, vel.v[i]!, vel.w[i]!);
    potAp += dot(Fap[i]!, vel.v[i]!);
  }
  return { a, alfa, arot, N, fric, T, Tp, potRoce, potAp };
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
        const sup = m.superficies[k]!;
        const rel = { x: p[i]!.x - sup.a.x, y: p[i]!.y - sup.a.y };
        const d = dot(rel, sup.n);
        const lado: 1 | -1 = d >= 0 ? 1 : -1;
        const gap = lado * d - this.geo.apoyo[i]![k]!;
        // Un apoyo que quedó lejos (la superficie se movió sin el cuerpo) no se respeta; el validador lo avisa.
        if (Math.abs(gap) > APOYO_MAXIMO) continue;
        const nOut = { x: lado * sup.n.x, y: lado * sup.n.y };
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
      W: { roce: 0, aplicadas: 0, impactos: 0 },
      elong: elongaciones(m, pose0),
    };
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
      if (md.k === 'desliza' && Math.abs(vTangente(m, i, md, v[i]!, 0)) < EPS_V) candidatos.add(i);
    });
    this.reconciliar(candidatos, false);
    this.refrescar();
    this.energiaInicial = energias(m, this.pose, this.vel).E;
    this.registrar();
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

  /** Avanza `dt` segundos de tiempo simulado (en pasos fijos); devuelve cuántos pasos dio. */
  avanzar(dt: number, maxPasos = 2000): number {
    if (this.detenida) return 0;
    this.acumulado += dt;
    let n = 0;
    while (this.acumulado >= this.h - 1e-15 && n < maxPasos && !this.detenida) {
      this.paso();
      this.acumulado -= this.h;
      n++;
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
    const meta = { modo: e.modo, cuerdaActiva: e.cuerdaActiva, N: e.N };
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
        const nOut = { x: s.n.x * md.lado, y: s.n.y * md.lado };
        const gap = dot({ x: e.p[i]!.x - s.a.x, y: e.p[i]!.y - s.a.y }, nOut) - apoyoActual(m, this.geo, i, md.s, e.th);
        e.p[i] = { x: e.p[i]!.x - nOut.x * gap, y: e.p[i]!.y - nOut.y * gap };
        const vn = dot(e.v[i]!, nOut);
        e.v[i] = { x: e.v[i]!.x - vn * nOut.x, y: e.v[i]!.y - vn * nOut.y };
        const c = m.cuerpos[i]!;
        if (c.I > 0 && c.elemento.tipo === 'bloque') e.w[i] = 0;
        if (md.k === 'adherido') {
          // Sin deslizar: se anula la velocidad del punto de contacto (en una esfera que gira, repartida entre v y ω).
          const rc = brazoContacto(m, i, nOut);
          const vt = vTangente(m, i, md, e.v[i]!, e.w[i]!);
          const im = this.geo.inv[i]!;
          const iI = rc ? this.geo.invM[dT(i)]! : 0;
          const ct = rc ? cruz(rc, s.t) : 0;
          const wsum = im + iI * ct * ct;
          if (wsum > 1e-18) {
            const lam = -vt / wsum;
            e.v[i] = { x: e.v[i]!.x + im * lam * s.t.x, y: e.v[i]!.y + im * lam * s.t.y };
            if (rc) e.w[i] = e.w[i]! + iI * lam * ct;
          }
        }
      });
      m.cuerdas.forEach((c, k) => {
        if (e.cuerdaActiva[k]) this.proyectarCuerda(c);
      });
    }
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
    return dinamica(this.modelo, this.geo, this.pose, this.vel, { modo: e.modo, cuerdaActiva: e.cuerdaActiva, N: e.N });
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
    const v = e.v.map((q, j) => ({ x: lerp(prev.vel.v[j]!.x, q.x), y: lerp(prev.vel.v[j]!.y, q.y) }));
    const w = e.w.map((x, j) => lerp(prev.vel.w[j]!, x));
    const wrot = e.wrot.map((x, k) => lerp(prev.vel.wrot[k]!, x));
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

    // 1) Cuerpos libres que llegan a una superficie: el impacto se aplica en su instante exacto
    let primero: { i: number; s: number; lado: 1 | -1; frac: number } | null = null;
    for (let i = 0; i < n; i++) {
      if (e.modo[i]!.k !== 'libre') continue;
      m.superficies.forEach((s, k) => {
        const hPrev = apoyoActual(m, this.geo, i, k, prev.pose.th);
        const hNew = apoyoActual(m, this.geo, i, k, e.th);
        const dPrev = dot({ x: prev.pose.p[i]!.x - s.a.x, y: prev.pose.p[i]!.y - s.a.y }, s.n);
        const lado: 1 | -1 = dPrev >= 0 ? 1 : -1;
        const gapPrev = lado * dPrev - hPrev;
        const relNew = { x: e.p[i]!.x - s.a.x, y: e.p[i]!.y - s.a.y };
        const gapNew = lado * dot(relNew, s.n) - hNew;
        const u = dot(relNew, s.t);
        if (gapPrev >= -1e-9 && gapNew < 0 && u >= 0 && u <= s.largo) {
          const gap = (x: number): number => {
            const q = hermite(prev.pose.p[i]!, prev.vel.v[i]!, e.p[i]!, e.v[i]!, h, x);
            const t = hermite1(prev.pose.th[i]!, prev.vel.w[i]!, e.th[i]!, e.w[i]!, h, x);
            const ths = e.th.slice();
            ths[i] = t;
            return lado * dot({ x: q.x - s.a.x, y: q.y - s.a.y }, s.n) - apoyoActual(m, this.geo, i, k, ths);
          };
          const frac = gap(0) <= 0 ? 0 : bisectar(gap);
          if (!primero || frac < primero.frac) primero = { i, s: k, lado, frac };
        }
      });
    }
    if (primero && profundidad < 4) {
      const { i, s, lado, frac } = primero as { i: number; s: number; lado: 1 | -1; frac: number };
      // Se vuelve al instante del choque y se aplica allí el impacto.
      this.retroceder(prev, frac, h);
      const sup = m.superficies[s]!;
      const c = m.cuerpos[i]!;
      const kAntes = this.cinetica();
      // Un bloque que gira cae sobre una cara: queda alineado con la superficie y deja de girar (choque inelástico).
      if (c.I > 0 && c.elemento.tipo === 'bloque') {
        const base = Math.atan2(sup.t.y, sup.t.x);
        const cuarto = Math.PI / 2;
        e.th[i] = base + Math.round((e.th[i]! - base) / cuarto) * cuarto;
        e.w[i] = 0;
      }
      const nOut = { x: sup.n.x * lado, y: sup.n.y * lado };
      const gap = lado * dot({ x: e.p[i]!.x - sup.a.x, y: e.p[i]!.y - sup.a.y }, sup.n) - apoyoActual(m, this.geo, i, s, e.th);
      e.p[i] = { x: e.p[i]!.x - nOut.x * gap, y: e.p[i]!.y - nOut.y * gap };
      const vn = dot(e.v[i]!, nOut);
      if (vn < 0) e.v[i] = { x: e.v[i]!.x - vn * nOut.x, y: e.v[i]!.y - vn * nOut.y };
      e.W.impactos = prev.W.impactos + this.cinetica() - kAntes;
      e.modo[i] = { k: 'desliza', s, lado, dir: 0 };
      this.evento(e.t, 'impacto', i, `${this.nombre(i)} llega a la superficie y queda apoyado`);
      // Solo puede quedar adherido si llega sin velocidad (del punto de contacto) a lo largo de la superficie.
      if (Math.abs(vTangente(m, i, e.modo[i] as Extract<Modo, { s: number }>, e.v[i]!, e.w[i]!)) < EPS_V) this.reconciliar(new Set([i]), true);
      this.terminarPaso(h * (1 - frac), profundidad);
      return true;
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
    m.cuerdas.forEach((c, k) => {
      void c;
      if (!e.cuerdaActiva[k]) return;
      if (Math.min(...this.din().Tp[k]!) < -EPS_F) {
        e.cuerdaActiva[k] = false;
        this.evento(e.t, 'cuerda-floja', null, `La cuerda ${k + 1} se afloja`);
      }
    });

    // 4) Cuerpos apoyados: despegue, salida por el extremo, detención, ruptura del roce estático
    const candidatos = new Set<number>();
    const velAntes = new Map<number, { v: Punto; w: number }>();
    let d = this.din();
    for (let i = 0; i < n; i++) {
      const md = e.modo[i]!;
      if (md.k === 'libre') continue;
      const s = m.superficies[md.s]!;
      if (d.N[i]! < -EPS_F) {
        e.modo[i] = { k: 'libre' };
        this.evento(e.t, 'despegue', i, `${this.nombre(i)} se despega de la superficie`);
        d = this.din();
        continue;
      }
      const u = dot({ x: e.p[i]!.x - s.a.x, y: e.p[i]!.y - s.a.y }, s.t);
      if (u < 0 || u > s.largo) {
        e.modo[i] = { k: 'libre' };
        this.evento(e.t, 'sale-extremo', i, `${this.nombre(i)} sale por el extremo de la superficie`);
        d = this.din();
        continue;
      }
      if (md.k === 'desliza') {
        const vtPrev = vTangente(m, i, md, prev.vel.v[i]!, prev.vel.w[i]!);
        const vtNew = vTangente(m, i, md, e.v[i]!, e.w[i]!);
        if (Math.abs(vtPrev) > EPS_V && (vtPrev * vtNew < 0 || Math.abs(vtNew) < EPS_V)) {
          velAntes.set(i, { v: { ...e.v[i]! }, w: e.w[i]! });
          // Se anula la velocidad del punto de contacto (en una esfera que gira, repartida entre v y ω).
          const rc = brazoContacto(m, i, { x: s.n.x * md.lado, y: s.n.y * md.lado });
          const im = this.geo.inv[i]!;
          const iI = rc ? this.geo.invM[dT(i)]! : 0;
          const ct = rc ? cruz(rc, s.t) : 0;
          const lam = -vtNew / (im + iI * ct * ct);
          e.v[i] = { x: e.v[i]!.x + im * lam * s.t.x, y: e.v[i]!.y + im * lam * s.t.y };
          if (rc) e.w[i] = e.w[i]! + iI * lam * ct;
          candidatos.add(i);
        }
      }
    }
    if (candidatos.size > 0) {
      this.reconciliar(candidatos, true);
      // Si no quedó adherido, no hay razón para frenarlo: sigue con la velocidad que traía (ya cambió de sentido).
      for (const [i, x] of velAntes) {
        if (e.modo[i]!.k !== 'desliza') continue;
        e.v[i] = x.v;
        e.w[i] = x.w;
      }
    }

    d = this.din();
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
    return false;
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
  private reconciliar(candidatos: Set<number>, avisar: boolean): void {
    const m = this.modelo;
    const e = this.estado;
    if (candidatos.size === 0) return;
    for (const i of candidatos) {
      const md = e.modo[i]!;
      if (md.k === 'desliza') e.modo[i] = { k: 'adherido', s: md.s, lado: md.lado };
    }
    const sueltos = new Set<number>();
    for (let vuelta = 0; vuelta <= candidatos.size; vuelta++) {
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
      if (!cambio) break;
    }
    if (!avisar) return;
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
    const d = this.din();
    e.a = d.a;
    e.alfa = d.alfa;
    e.N = d.N;
    e.fric = d.fric;
    e.T = d.T;
    e.Tp = d.Tp.map((x) => (x.length > 0 ? x : [0]));
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
    if (md.k === 'libre') return 'en el aire';
    const moviendo = Math.abs(dot(this.estado.v[i]!, this.modelo.superficies[md.s]!.t)) > 1e-6;
    if (md.k === 'adherido') return this.rueda(i) && moviendo ? 'rueda sin deslizar' : 'en reposo (roce estático)';
    return moviendo ? 'deslizando' : 'apoyado';
  }
}
