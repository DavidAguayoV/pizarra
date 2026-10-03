import type { Punto } from '../core/camara';
import { apoyoEn } from '../physics/dcl';
import type { Modelo } from './modelo';
import { posExtremo } from './modelo';

/**
 * Motor de simulación: RK4 de paso fijo sobre partículas con restricciones.
 *
 * En cada instante se resuelve el sistema lineal de Lagrange
 *
 *     M a = F + Jᵀ λ        J a = γ
 *
 * donde las filas de J son las restricciones activas: contacto con una superficie (λ = N ≥ 0),
 * adherencia (roce estático: λ = f, con |f| ≤ μs N) y cuerdas, con o sin polea (λ = −T, T ≥ 0).
 * El roce cinético (μk N, opuesto al deslizamiento) se itera con N hasta converger.
 *
 * Los cambios de régimen (despegue, impacto, estático → cinético, detención, cuerda que se afloja
 * o se tensa, salida por el extremo de una superficie, resorte en su largo natural) se detectan al
 * final de cada paso y quedan registrados como eventos.
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
  | 'resorte-natural';

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
  /** Apoyado y en reposo respecto de la superficie (roce estático). */
  | { k: 'adherido'; s: number; lado: 1 | -1 };

export interface Estado {
  t: number;
  p: Punto[];
  v: Punto[];
  /** Aceleración en este instante (la de la última evaluación). */
  a: Punto[];
  modo: Modo[];
  cuerdaActiva: boolean[];
  /** Normal sobre cada cuerpo (0 si está libre). */
  N: number[];
  /** Fuerza de roce a lo largo de la tangente de su superficie (con signo). */
  fric: number[];
  /** Tensión de cada cuerda (0 si está floja). */
  T: number[];
  /** Trabajo acumulado de las fuerzas no conservativas. */
  W: { roce: number; aplicadas: number; impactos: number };
  /** Elongación anterior de cada resorte (para detectar el largo natural). */
  elong: number[];
}

const EPS_V = 1e-9;
const EPS_F = 1e-9;
const MAX_EVENTOS = 400;

const cero = (): Punto => ({ x: 0, y: 0 });
const dot = (a: Punto, b: Punto): number => a.x * b.x + a.y * b.y;
const signo = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);

// --- Álgebra lineal densa mínima ------------------------------------------------------------------------

/** Resuelve A x = b por eliminación gaussiana con pivoteo parcial. */
function resolver(A: number[][], b: number[]): number[] {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    if (p !== c) {
      [A[c], A[p]] = [A[p]!, A[c]!];
      [b[c], b[p]] = [b[p]!, b[c]!];
    }
    const piv = A[c]![c]!;
    if (Math.abs(piv) < 1e-14) continue; // restricción redundante: ese multiplicador queda en 0
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
    x[r] = Math.abs(piv) < 1e-14 ? 0 : s / piv;
  }
  return x;
}

// --- Dinámica ---------------------------------------------------------------------------------------------------

interface Fila {
  entradas: Array<{ i: number; g: Punto }>;
  gamma: number;
}

interface Din {
  a: Punto[];
  N: number[];
  fric: number[];
  T: number[];
  potRoce: number;
  potAp: number;
}

/** Datos geométricos que no cambian: apoyo de cada cuerpo sobre cada superficie. */
interface Geo {
  apoyo: number[][];
  inv: number[];
}

function geometria(m: Modelo): Geo {
  return {
    apoyo: m.cuerpos.map((c) => m.superficies.map((s) => apoyoEn(c.elemento, s.n))),
    inv: m.cuerpos.map((c) => (c.masa > 0 ? 1 / c.masa : 0)),
  };
}

function dinamica(m: Modelo, _geo: Geo, p: readonly Punto[], v: readonly Punto[], meta: Pick<Estado, 'modo' | 'cuerdaActiva' | 'N'>): Din {
  const n = m.cuerpos.length;
  const F: Punto[] = m.cuerpos.map((c) => ({ x: 0, y: -c.masa * m.g }));
  const Fap: Punto[] = m.cuerpos.map(() => cero());
  for (const f of m.fuerzas) {
    F[f.cuerpo]!.x += f.F.x;
    F[f.cuerpo]!.y += f.F.y;
    Fap[f.cuerpo]!.x += f.F.x;
    Fap[f.cuerpo]!.y += f.F.y;
  }
  for (const r of m.resortes) {
    const q0 = posExtremo(r.ext[0], p);
    const q1 = posExtremo(r.ext[1], p);
    const dx = q1.x - q0.x;
    const dy = q1.y - q0.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-12) continue;
    const f = (r.k * (L - r.largoNatural)) / L;
    if (r.ext[0].tipo === 'cuerpo') {
      F[r.ext[0].i]!.x += f * dx;
      F[r.ext[0].i]!.y += f * dy;
    }
    if (r.ext[1].tipo === 'cuerpo') {
      F[r.ext[1].i]!.x -= f * dx;
      F[r.ext[1].i]!.y -= f * dy;
    }
  }

  // Restricciones activas
  const filas: Fila[] = [];
  const filaContacto = new Array<number>(n).fill(-1);
  const filaTang = new Array<number>(n).fill(-1);
  const filaCuerda = new Array<number>(m.cuerdas.length).fill(-1);
  for (let i = 0; i < n; i++) {
    const md = meta.modo[i]!;
    if (md.k === 'libre') continue;
    const s = m.superficies[md.s]!;
    filaContacto[i] = filas.length;
    filas.push({ entradas: [{ i, g: { x: s.n.x * md.lado, y: s.n.y * md.lado } }], gamma: 0 });
    if (md.k === 'adherido') {
      filaTang[i] = filas.length;
      filas.push({ entradas: [{ i, g: s.t }], gamma: 0 });
    }
  }
  m.cuerdas.forEach((c, k) => {
    if (!meta.cuerdaActiva[k]) return;
    const q0 = posExtremo(c.ext[0], p);
    const q1 = posExtremo(c.ext[1], p);
    const v0 = c.ext[0].tipo === 'cuerpo' ? v[c.ext[0].i]! : cero();
    const v1 = c.ext[1].tipo === 'cuerpo' ? v[c.ext[1].i]! : cero();
    const entradas: Fila['entradas'] = [];
    let gamma: number;
    if (c.polea) {
      const d0 = { x: q0.x - c.polea[0].x, y: q0.y - c.polea[0].y };
      const d1 = { x: q1.x - c.polea[1].x, y: q1.y - c.polea[1].y };
      const l0 = Math.hypot(d0.x, d0.y) || 1e-12;
      const l1 = Math.hypot(d1.x, d1.y) || 1e-12;
      const u0 = { x: d0.x / l0, y: d0.y / l0 };
      const u1 = { x: d1.x / l1, y: d1.y / l1 };
      gamma = -((dot(v0, v0) - dot(u0, v0) ** 2) / l0 + (dot(v1, v1) - dot(u1, v1) ** 2) / l1);
      if (c.ext[0].tipo === 'cuerpo') entradas.push({ i: c.ext[0].i, g: u0 });
      if (c.ext[1].tipo === 'cuerpo') entradas.push({ i: c.ext[1].i, g: u1 });
    } else {
      const d = { x: q0.x - q1.x, y: q0.y - q1.y };
      const l = Math.hypot(d.x, d.y) || 1e-12;
      const u = { x: d.x / l, y: d.y / l };
      const dv = { x: v0.x - v1.x, y: v0.y - v1.y };
      gamma = -(dot(dv, dv) - dot(u, dv) ** 2) / l;
      if (c.ext[0].tipo === 'cuerpo') entradas.push({ i: c.ext[0].i, g: u });
      if (c.ext[1].tipo === 'cuerpo') entradas.push({ i: c.ext[1].i, g: { x: -u.x, y: -u.y } });
    }
    filaCuerda[k] = filas.length;
    filas.push({ entradas, gamma });
  });

  const hayDeslizando = meta.modo.some((md) => md.k === 'desliza');
  let Nsup = meta.N.map((x, i) => (x > 0 ? x : m.cuerpos[i]!.masa * m.g * 0.5));
  let a: Punto[] = [];
  let lambda: number[] = [];
  let fricFuerza = new Array<number>(n).fill(0);
  for (let it = 0; it < (hayDeslizando ? 6 : 1); it++) {
    const Fi = F.map((f) => ({ ...f }));
    fricFuerza = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      const md = meta.modo[i]!;
      if (md.k !== 'desliza') continue;
      const s = m.superficies[md.s]!;
      const vt = dot(v[i]!, s.t);
      const sg = Math.abs(vt) > EPS_V ? signo(vt) : md.dir;
      const fr = -sg * s.muK * Math.max(Nsup[i]!, 0);
      fricFuerza[i] = fr;
      Fi[i]!.x += fr * s.t.x;
      Fi[i]!.y += fr * s.t.y;
    }
    // Sistema [M −Jᵀ; J 0] [a; λ] = [F; γ]
    const nf = filas.length;
    const S = 2 * n + nf;
    const A: number[][] = Array.from({ length: S }, () => new Array<number>(S).fill(0));
    const b = new Array<number>(S).fill(0);
    for (let i = 0; i < n; i++) {
      const masa = m.cuerpos[i]!.masa > 0 ? m.cuerpos[i]!.masa : 1e-9;
      A[2 * i]![2 * i] = masa;
      A[2 * i + 1]![2 * i + 1] = masa;
      b[2 * i] = Fi[i]!.x;
      b[2 * i + 1] = Fi[i]!.y;
    }
    filas.forEach((f, r) => {
      for (const e of f.entradas) {
        A[2 * n + r]![2 * e.i] = e.g.x;
        A[2 * n + r]![2 * e.i + 1] = e.g.y;
        A[2 * e.i]![2 * n + r] = -e.g.x;
        A[2 * e.i + 1]![2 * n + r] = -e.g.y;
      }
      b[2 * n + r] = f.gamma;
    });
    const x = resolver(A, b);
    a = m.cuerpos.map((_, i) => ({ x: x[2 * i]!, y: x[2 * i + 1]! }));
    lambda = x.slice(2 * n);
    if (!hayDeslizando) break;
    const nueva = m.cuerpos.map((_, i) => (filaContacto[i]! >= 0 ? lambda[filaContacto[i]!]! : 0));
    const dif = Math.max(0, ...nueva.map((x2, i) => Math.abs(x2 - Math.max(Nsup[i]!, 0))));
    Nsup = nueva.map((x2, i) => (meta.modo[i]!.k === 'desliza' ? x2 : Nsup[i]!));
    if (dif < 1e-11) break;
  }

  const N = m.cuerpos.map((_, i) => (filaContacto[i]! >= 0 ? lambda[filaContacto[i]!]! : 0));
  const fric = m.cuerpos.map((_, i) => {
    const md = meta.modo[i]!;
    if (md.k === 'adherido') return lambda[filaTang[i]!]!;
    return fricFuerza[i]!;
  });
  const T = m.cuerdas.map((_, k) => (filaCuerda[k]! >= 0 ? -lambda[filaCuerda[k]!]! : 0));
  let potRoce = 0;
  let potAp = 0;
  for (let i = 0; i < n; i++) {
    const md = meta.modo[i]!;
    if (md.k === 'desliza') potRoce += fricFuerza[i]! * dot(v[i]!, m.superficies[md.s]!.t);
    potAp += dot(Fap[i]!, v[i]!);
  }
  return { a, N, fric, T, potRoce, potAp };
}

// --- Energías -------------------------------------------------------------------------------------------------------

export interface Energias {
  K: number;
  Ug: number;
  Ue: number;
  /** Energía mecánica K + Ug + Ue (Ug con y = 0 como nivel de referencia). */
  E: number;
}

export function energias(m: Modelo, p: readonly Punto[], v: readonly Punto[]): Energias {
  let K = 0;
  let Ug = 0;
  m.cuerpos.forEach((c, i) => {
    K += 0.5 * c.masa * dot(v[i]!, v[i]!);
    Ug += c.masa * m.g * p[i]!.y;
  });
  let Ue = 0;
  for (const r of m.resortes) {
    const q0 = posExtremo(r.ext[0], p);
    const q1 = posExtremo(r.ext[1], p);
    const x = Math.hypot(q1.x - q0.x, q1.y - q0.y) - r.largoNatural;
    Ue += 0.5 * r.k * x * x;
  }
  return { K, Ug, Ue, E: K + Ug + Ue };
}

export function elongaciones(m: Modelo, p: readonly Punto[]): number[] {
  return m.resortes.map((r) => {
    const q0 = posExtremo(r.ext[0], p);
    const q1 = posExtremo(r.ext[1], p);
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
  p: Punto[];
  v: Punto[];
  elong: number[];
  t: number;
  W: Estado['W'];
  /** Valor de la restricción de cada cuerda (distancia − largo) al comienzo del paso. */
  phi: number[];
}

/** Valor de la restricción de una cuerda con los cuerpos en las posiciones `p` (0 = tensa; < 0 = floja). */
function valorCuerda(c: Modelo['cuerdas'][number], p: readonly Punto[]): number {
  const q0 = posExtremo(c.ext[0], p);
  const q1 = posExtremo(c.ext[1], p);
  if (c.polea) return Math.hypot(q0.x - c.polea[0].x, q0.y - c.polea[0].y) + Math.hypot(q1.x - c.polea[1].x, q1.y - c.polea[1].y) - c.largo;
  return Math.hypot(q0.x - q1.x, q0.y - q1.y) - c.largo;
}

/** Interpolación cúbica de Hermite de una posición entre los extremos de un paso (exacta si la aceleración es constante). */
function hermite(p0: Punto, v0: Punto, p1: Punto, v1: Punto, h: number, u: number): Punto {
  const u2 = u * u;
  const u3 = u2 * u;
  const a = 2 * u3 - 3 * u2 + 1;
  const b = u3 - 2 * u2 + u;
  const c = -2 * u3 + 3 * u2;
  const d = u3 - u2;
  return { x: a * p0.x + b * h * v0.x + c * p1.x + d * h * v1.x, y: a * p0.y + b * h * v0.y + c * p1.y + d * h * v1.y };
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

  /** Vuelve al instante inicial: cuerpos donde se dibujaron, con su velocidad inicial. */
  reiniciar(): void {
    const m = this.modelo;
    const n = m.cuerpos.length;
    const p = m.cuerpos.map((c) => ({ ...c.p0 }));
    const v = m.cuerpos.map((c) => ({ ...c.v0 }));
    const modo: Modo[] = m.cuerpos.map(() => ({ k: 'libre' }));

    // Contacto inicial: el cuerpo que toca una superficie se apoya exactamente sobre ella.
    m.cuerpos.forEach((c, i) => {
      let mejor: { s: number; lado: 1 | -1; gap: number } | null = null;
      m.superficies.forEach((s, k) => {
        const rel = { x: p[i]!.x - s.a.x, y: p[i]!.y - s.a.y };
        const d = dot(rel, s.n);
        const lado: 1 | -1 = d >= 0 ? 1 : -1;
        const gap = lado * d - this.geo.apoyo[i]![k]!;
        const u = dot(rel, s.t);
        if (Math.abs(gap) <= 0.09 && u >= -0.25 && u <= s.largo + 0.25 && (!mejor || Math.abs(gap) < Math.abs(mejor.gap))) mejor = { s: k, lado, gap };
      });
      if (mejor) {
        const { s, lado, gap } = mejor as { s: number; lado: 1 | -1; gap: number };
        const sup = m.superficies[s]!;
        p[i] = { x: p[i]!.x - lado * sup.n.x * gap, y: p[i]!.y - lado * sup.n.y * gap };
        // La velocidad inicial no puede atravesar la superficie.
        const vn = dot(v[i]!, { x: lado * sup.n.x, y: lado * sup.n.y });
        if (vn < 0) v[i] = { x: v[i]!.x - vn * lado * sup.n.x, y: v[i]!.y - vn * lado * sup.n.y };
        modo[i] = { k: 'desliza', s, lado, dir: 0 };
      }
      void c;
    });

    this.estado = {
      t: 0,
      p,
      v,
      a: p.map(cero),
      modo,
      cuerdaActiva: m.cuerdas.map(() => true),  // se ajusta abajo según el sentido del movimiento
      N: new Array<number>(n).fill(0),
      fric: new Array<number>(n).fill(0),
      T: new Array<number>(m.cuerdas.length).fill(0),
      W: { roce: 0, aplicadas: 0, impactos: 0 },
      elong: elongaciones(m, p),
    };
    this.inicial = modo.map((x) => ({ ...x }));
    // Una cuerda cuyos extremos ya se están acercando parte floja (no puede empujar).
    m.cuerdas.forEach((c, k) => {
      if (this.geometriaCuerda(c).dphi < -1e-12) this.estado.cuerdaActiva[k] = false;
    });
    this.historial = [];
    this.eventos = [];
    this.acumulado = 0;
    this.periodo = this.periodo > 0 ? this.periodo : 0.01;
    this.proxima = 0;
    // Los cuerpos apoyados que parten en reposo: ¿los sostiene el roce estático?
    const candidatos = new Set<number>();
    modo.forEach((md, i) => {
      if (md.k === 'desliza' && Math.abs(dot(v[i]!, m.superficies[md.s]!.t)) < EPS_V) candidatos.add(i);
    });
    this.reconciliar(candidatos, false);
    this.refrescar();
    this.energiaInicial = energias(m, this.estado.p, this.estado.v).E;
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

  /** Avanza `dt` segundos de tiempo simulado (en pasos fijos); devuelve cuántos pasos dio. */
  avanzar(dt: number, maxPasos = 2000): number {
    this.acumulado += dt;
    let n = 0;
    while (this.acumulado >= this.h - 1e-15 && n < maxPasos) {
      this.paso();
      this.acumulado -= this.h;
      n++;
    }
    if (n >= maxPasos) this.acumulado = 0; // no se acumula atraso si el equipo no da abasto
    return n;
  }

  /** Un paso RK4 de duración `h` (los eventos que ocurren dentro de él se tratan en su instante exacto). */
  paso(): void {
    this.integrar(this.h, 0);
  }

  /** Un paso RK4 de duración `hh` a partir del estado actual. */
  private integrar(hh: number, profundidad: number): void {
    const m = this.modelo;
    const e = this.estado;
    const h = hh;
    const n = m.cuerpos.length;
    const meta = { modo: e.modo, cuerdaActiva: e.cuerdaActiva, N: e.N };
    const prev = {
      p: e.p.map((q) => ({ ...q })),
      v: e.v.map((q) => ({ ...q })),
      elong: e.elong.slice(),
      t: e.t,
      W: { ...e.W },
      phi: m.cuerdas.map((c) => valorCuerda(c, e.p)),
    };

    const f = (p: Punto[], v: Punto[]) => dinamica(m, this.geo, p, v, meta);
    const suma = (base: Punto[], d: Punto[], s: number): Punto[] => base.map((q, i) => ({ x: q.x + s * d[i]!.x, y: q.y + s * d[i]!.y }));

    const k1 = f(e.p, e.v);
    const p2 = suma(e.p, e.v, h / 2);
    const v2 = suma(e.v, k1.a, h / 2);
    const k2 = f(p2, v2);
    const p3 = suma(e.p, v2, h / 2);
    const v3 = suma(e.v, k2.a, h / 2);
    const k3 = f(p3, v3);
    const p4 = suma(e.p, v3, h);
    const v4 = suma(e.v, k3.a, h);
    const k4 = f(p4, v4);

    for (let i = 0; i < n; i++) {
      e.p[i] = {
        x: e.p[i]!.x + (h / 6) * (e.v[i]!.x + 2 * v2[i]!.x + 2 * v3[i]!.x + v4[i]!.x),
        y: e.p[i]!.y + (h / 6) * (e.v[i]!.y + 2 * v2[i]!.y + 2 * v3[i]!.y + v4[i]!.y),
      };
      e.v[i] = {
        x: e.v[i]!.x + (h / 6) * (k1.a[i]!.x + 2 * k2.a[i]!.x + 2 * k3.a[i]!.x + k4.a[i]!.x),
        y: e.v[i]!.y + (h / 6) * (k1.a[i]!.y + 2 * k2.a[i]!.y + 2 * k3.a[i]!.y + k4.a[i]!.y),
      };
    }
    e.W.roce += (h / 6) * (k1.potRoce + 2 * k2.potRoce + 2 * k3.potRoce + k4.potRoce);
    e.W.aplicadas += (h / 6) * (k1.potAp + 2 * k2.potAp + 2 * k3.potAp + k4.potAp);
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
        const gap = dot({ x: e.p[i]!.x - s.a.x, y: e.p[i]!.y - s.a.y }, nOut) - this.geo.apoyo[i]![md.s]!;
        e.p[i] = { x: e.p[i]!.x - nOut.x * gap, y: e.p[i]!.y - nOut.y * gap };
        const vn = dot(e.v[i]!, nOut);
        e.v[i] = { x: e.v[i]!.x - vn * nOut.x, y: e.v[i]!.y - vn * nOut.y };
        if (md.k === 'adherido') {
          const vt = dot(e.v[i]!, s.t);
          e.v[i] = { x: e.v[i]!.x - vt * s.t.x, y: e.v[i]!.y - vt * s.t.y };
        }
      });
      m.cuerdas.forEach((c, k) => {
        if (e.cuerdaActiva[k]) this.proyectarCuerda(c);
      });
    }
  }

  /** Gradientes (por cuerpo) y valor de la restricción de una cuerda. */
  private geometriaCuerda(c: Modelo['cuerdas'][number]): { phi: number; dphi: number; g: Array<{ i: number; g: Punto }> } {
    const e = this.estado;
    const q0 = posExtremo(c.ext[0], e.p);
    const q1 = posExtremo(c.ext[1], e.p);
    const v0 = c.ext[0].tipo === 'cuerpo' ? e.v[c.ext[0].i]! : cero();
    const v1 = c.ext[1].tipo === 'cuerpo' ? e.v[c.ext[1].i]! : cero();
    const g: Array<{ i: number; g: Punto }> = [];
    if (c.polea) {
      const d0 = { x: q0.x - c.polea[0].x, y: q0.y - c.polea[0].y };
      const d1 = { x: q1.x - c.polea[1].x, y: q1.y - c.polea[1].y };
      const l0 = Math.hypot(d0.x, d0.y) || 1e-12;
      const l1 = Math.hypot(d1.x, d1.y) || 1e-12;
      const u0 = { x: d0.x / l0, y: d0.y / l0 };
      const u1 = { x: d1.x / l1, y: d1.y / l1 };
      if (c.ext[0].tipo === 'cuerpo') g.push({ i: c.ext[0].i, g: u0 });
      if (c.ext[1].tipo === 'cuerpo') g.push({ i: c.ext[1].i, g: u1 });
      return { phi: l0 + l1 - c.largo, dphi: dot(u0, v0) + dot(u1, v1), g };
    }
    const d = { x: q0.x - q1.x, y: q0.y - q1.y };
    const l = Math.hypot(d.x, d.y) || 1e-12;
    const u = { x: d.x / l, y: d.y / l };
    if (c.ext[0].tipo === 'cuerpo') g.push({ i: c.ext[0].i, g: u });
    if (c.ext[1].tipo === 'cuerpo') g.push({ i: c.ext[1].i, g: { x: -u.x, y: -u.y } });
    return { phi: l - c.largo, dphi: dot(u, { x: v0.x - v1.x, y: v0.y - v1.y }), g };
  }

  private proyectarCuerda(c: Modelo['cuerdas'][number]): void {
    const e = this.estado;
    const { phi, dphi, g } = this.geometriaCuerda(c);
    const w = g.reduce((s, x) => s + this.geo.inv[x.i]! * dot(x.g, x.g), 0);
    if (w < 1e-18) return;
    for (const x of g) {
      const kp = (-phi / w) * this.geo.inv[x.i]!;
      e.p[x.i] = { x: e.p[x.i]!.x + kp * x.g.x, y: e.p[x.i]!.y + kp * x.g.y };
    }
    const g2 = this.geometriaCuerda(c);
    const w2 = g2.g.reduce((s, x) => s + this.geo.inv[x.i]! * dot(x.g, x.g), 0);
    const dv = g2.dphi;
    void dphi;
    for (const x of g2.g) {
      const kv = (-dv / w2) * this.geo.inv[x.i]!;
      e.v[x.i] = { x: e.v[x.i]!.x + kv * x.g.x, y: e.v[x.i]!.y + kv * x.g.y };
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
    return dinamica(this.modelo, this.geo, e.p, e.v, { modo: e.modo, cuerdaActiva: e.cuerdaActiva, N: e.N });
  }

  private cinetica(): number {
    return this.estado.v.reduce((s, v, i) => s + 0.5 * this.modelo.cuerpos[i]!.masa * dot(v, v), 0);
  }

  /** Lleva el estado al instante `u·h` dentro del paso que acaba de darse (posiciones por Hermite, resto lineal). */
  private retroceder(prev: Prev, u: number, h: number): void {
    const e = this.estado;
    const n = this.modelo.cuerpos.length;
    const lerp = (a: number, b: number): number => a + u * (b - a);
    const p = e.p.map((q, j) => hermite(prev.p[j]!, prev.v[j]!, q, e.v[j]!, h, u));
    const v = e.v.map((q, j) => ({ x: lerp(prev.v[j]!.x, q.x), y: lerp(prev.v[j]!.y, q.y) }));
    for (let j = 0; j < n; j++) {
      e.p[j] = p[j]!;
      e.v[j] = v[j]!;
    }
    e.W = { roce: lerp(prev.W.roce, e.W.roce), aplicadas: lerp(prev.W.aplicadas, e.W.aplicadas), impactos: prev.W.impactos };
    e.t = prev.t + u * h;
    e.elong = elongaciones(this.modelo, e.p);
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
        const hh = this.geo.apoyo[i]![k]!;
        const dPrev = dot({ x: prev.p[i]!.x - s.a.x, y: prev.p[i]!.y - s.a.y }, s.n);
        const lado: 1 | -1 = dPrev >= 0 ? 1 : -1;
        const gapPrev = lado * dPrev - hh;
        const relNew = { x: e.p[i]!.x - s.a.x, y: e.p[i]!.y - s.a.y };
        const gapNew = lado * dot(relNew, s.n) - hh;
        const u = dot(relNew, s.t);
        if (gapPrev >= -1e-9 && gapNew < 0 && u >= 0 && u <= s.largo) {
          const gap = (x: number): number =>
            lado * dot({ x: hermite(prev.p[i]!, prev.v[i]!, e.p[i]!, e.v[i]!, h, x).x - s.a.x, y: hermite(prev.p[i]!, prev.v[i]!, e.p[i]!, e.v[i]!, h, x).y - s.a.y }, s.n) - hh;
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
      const nOut = { x: sup.n.x * lado, y: sup.n.y * lado };
      const gap = lado * dot({ x: e.p[i]!.x - sup.a.x, y: e.p[i]!.y - sup.a.y }, sup.n) - this.geo.apoyo[i]![s]!;
      e.p[i] = { x: e.p[i]!.x - nOut.x * gap, y: e.p[i]!.y - nOut.y * gap };
      const kAntes = 0.5 * m.cuerpos[i]!.masa * dot(e.v[i]!, e.v[i]!);
      const vn = dot(e.v[i]!, nOut);
      if (vn < 0) e.v[i] = { x: e.v[i]!.x - vn * nOut.x, y: e.v[i]!.y - vn * nOut.y };
      e.W.impactos = prev.W.impactos + 0.5 * m.cuerpos[i]!.masa * dot(e.v[i]!, e.v[i]!) - kAntes;
      e.modo[i] = { k: 'desliza', s, lado, dir: 0 };
      this.evento(e.t, 'impacto', i, `${this.nombre(i)} llega a la superficie y queda apoyado`);
      this.reconciliar(new Set([i]), true);
      this.terminarPaso(h * (1 - frac), profundidad);
      return true;
    }

    // 2) Resortes: paso por el largo natural
    const el = elongaciones(m, e.p);
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
        const phiNew = valorCuerda(c, e.p);
        if (!(prev.phi[k]! < -1e-9 && phiNew >= -1e-9) || this.geometriaCuerda(c).dphi < 0) continue;
        const phi = (x: number): number =>
          valorCuerda(c, e.p.map((q, j) => hermite(prev.p[j]!, prev.v[j]!, q, e.v[j]!, h, x)));
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

    // 3b) Cuerdas que se aflojan
    m.cuerdas.forEach((c, k) => {
      void c;
      if (!e.cuerdaActiva[k]) return;
      if (this.din().T[k]! < -EPS_F) {
        e.cuerdaActiva[k] = false;
        this.evento(e.t, 'cuerda-floja', null, `La cuerda ${k + 1} se afloja`);
      }
    });

    // 4) Cuerpos apoyados: despegue, salida por el extremo, detención, ruptura del roce estático
    const candidatos = new Set<number>();
    const velAntes = new Map<number, Punto>();
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
        const vtPrev = dot(prev.v[i]!, s.t);
        const vtNew = dot(e.v[i]!, s.t);
        if (Math.abs(vtPrev) > EPS_V && (vtPrev * vtNew < 0 || Math.abs(vtNew) < EPS_V)) {
          velAntes.set(i, { ...e.v[i]! });
          e.v[i] = { x: e.v[i]!.x - vtNew * s.t.x, y: e.v[i]!.y - vtNew * s.t.y };
          candidatos.add(i);
        }
      }
    }
    if (candidatos.size > 0) {
      this.reconciliar(candidatos, true);
      // Si no quedó adherido, no hay razón para frenarlo: sigue con la velocidad que traía (ya cambió de sentido).
      for (const [i, v] of velAntes) if (e.modo[i]!.k === 'desliza') e.v[i] = v;
    }

    d = this.din();
    for (let i = 0; i < n; i++) {
      const md = e.modo[i]!;
      if (md.k !== 'adherido') continue;
      const s = m.superficies[md.s]!;
      if (Math.abs(d.fric[i]!) > s.muS * Math.max(d.N[i]!, 0) + 1e-9) {
        e.modo[i] = { k: 'desliza', s: md.s, lado: md.lado, dir: -signo(d.fric[i]!) };
        this.evento(e.t, 'estatico-cinetico', i, `${this.nombre(i)} vence el roce estático y empieza a deslizar`);
        d = this.din();
      }
    }
    return false;
  }

  /**
   * Decide quiénes de `candidatos` (cuerpos apoyados sin velocidad a lo largo de la superficie) los
   * sostiene el roce estático. Los prueba como adheridos y suelta a los que necesitan más roce del que
   * hay (|f| > μs N): esos pasan a deslizar en el sentido en que los empuja el resto de las fuerzas.
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
      if (e.modo[i]!.k === 'adherido') this.evento(e.t, 'detencion', i, `${this.nombre(i)} se detiene (el roce estático lo sostiene)`);
      else if (sueltos.has(i)) {
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
    e.N = d.N;
    e.fric = d.fric;
    e.T = d.T;
  }

  private registrar(): void {
    const m = this.modelo;
    const e = this.estado;
    const en = energias(m, e.p, e.v);
    this.historial.push({
      t: e.t,
      cuerpos: m.cuerpos.map((c, i) => ({
        x: e.p[i]!.x,
        y: e.p[i]!.y,
        vx: e.v[i]!.x,
        vy: e.v[i]!.y,
        ax: e.a[i]!.x,
        ay: e.a[i]!.y,
        K: 0.5 * c.masa * dot(e.v[i]!, e.v[i]!),
        Ug: c.masa * m.g * e.p[i]!.y,
        N: e.N[i]!,
        f: e.fric[i]!,
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
    const en = energias(this.modelo, e.p, e.v);
    const Wnc = e.W.roce + e.W.aplicadas + e.W.impactos;
    return { ...en, Wnc, residuo: en.E - this.energiaInicial - Wnc };
  }

  /** Una descripción corta del estado de un cuerpo, para mostrar en la interfaz. */
  descripcion(i: number): string {
    const md = this.estado.modo[i]!;
    if (md.k === 'libre') return 'en el aire';
    if (md.k === 'adherido') return 'en reposo (roce estático)';
    return Math.abs(dot(this.estado.v[i]!, this.modelo.superficies[md.s]!.t)) > 1e-6 ? 'deslizando' : 'apoyado';
  }
}
