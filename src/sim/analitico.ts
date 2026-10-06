import type { Punto } from '../core/camara';
import type { Modelo } from './modelo';
import type { EventoSim, Simulacion } from './motor';

/**
 * Solución analítica de los casos que la tienen, para comparar con la simulación:
 *
 *  - aceleración constante: vuelo libre (caída libre, proyectil) y deslizamiento sobre una superficie
 *    con roce cinético, mientras el cuerpo no cambie de régimen;
 *  - oscilador armónico: un cuerpo unido a un resorte fijo que se mueve a lo largo de su eje
 *    (resorte vertical o sobre una superficie sin roce paralela al resorte).
 *
 * Si la escena no es uno de esos casos devuelve null: la simulación sigue valiendo, solo que no hay con qué compararla.
 */

export interface Analitica {
  tipo: 'aceleracion-constante' | 'armonico';
  /** Descripción para mostrar, con la fórmula que se usa. */
  descripcion: string;
  pos(t: number): Punto;
  vel(t: number): Punto;
  /** Instante hasta el cual la solución vale (primer cambio de régimen); Infinity si vale siempre. */
  validoHasta: number;
  /** Período del movimiento, si es periódico. */
  periodo?: number;
}

const dot = (a: Punto, b: Punto): number => a.x * b.x + a.y * b.y;

/** Fuerza constante sobre el cuerpo i (gravedad más fuerzas aplicadas). */
function fuerzaConstante(m: Modelo, i: number): Punto {
  const c = m.cuerpos[i]!;
  let x = 0;
  let y = -c.masa * m.g;
  for (const f of m.fuerzas) if (f.cuerpo === i) {
    x += f.F.x;
    y += f.F.y;
  }
  return { x, y };
}

/** ¿Algún resorte o cuerda está atado al cuerpo i? */
function atado(m: Modelo, i: number): { resortes: number[]; cuerdas: number[] } {
  const toca = (e: { tipo: string; i?: number }): boolean => e.tipo === 'cuerpo' && e.i === i;
  return {
    resortes: m.resortes.map((r, k) => (toca(r.ext[0]) || toca(r.ext[1]) ? k : -1)).filter((k) => k >= 0),
    cuerdas: m.cuerdas.map((c, k) => (toca(c.ext[0]) || toca(c.ext[1]) ? k : -1)).filter((k) => k >= 0),
  };
}

/** Instante del primer evento que involucra al cuerpo i (o Infinity). */
export function primerEvento(eventos: readonly EventoSim[], i: number): number {
  const e = eventos.find((x) => x.cuerpo === i && x.tipo !== 'detencion' && x.tipo !== 'invierte' && x.tipo !== 'resorte-natural');
  return e ? e.t : Infinity;
}

export function solucionAnalitica(sim: Simulacion, i: number): Analitica | null {
  const m = sim.modelo;
  const c = m.cuerpos[i];
  if (!c) return null;
  const { resortes, cuerdas } = atado(m, i);
  if (cuerdas.length > 0) return null;
  const est0 = sim.historial[0];
  if (!est0) return null;
  const p0 = { x: est0.cuerpos[i]!.x, y: est0.cuerpos[i]!.y };
  const v0 = { x: est0.cuerpos[i]!.vx, y: est0.cuerpos[i]!.vy };
  const F = fuerzaConstante(m, i);
  const modo = sim.modoInicial(i);

  // --- Un solo resorte fijo: oscilador armónico a lo largo de su eje -------------------------------------
  if (resortes.length === 1) {
    const r = m.resortes[resortes[0]!]!;
    const propio = r.ext[0].tipo === 'cuerpo' && r.ext[0].i === i ? 0 : 1;
    const otro = r.ext[1 - propio]!;
    if (otro.tipo !== 'fijo') return null;
    const q = r.ext[propio]!;
    if (q.tipo !== 'cuerpo') return null;
    const anclaje = otro.p;
    const attach = { x: p0.x + q.desp.x, y: p0.y + q.desp.y };
    const eje = { x: attach.x - anclaje.x, y: attach.y - anclaje.y };
    const L = Math.hypot(eje.x, eje.y);
    if (L < 1e-9) return null;
    const e = { x: eje.x / L, y: eje.y / L };
    const perp = { x: -e.y, y: e.x };
    // El movimiento debe quedar sobre el eje: velocidad perpendicular nula y fuerza perpendicular equilibrada
    if (Math.abs(dot(v0, perp)) > 1e-9) return null;
    let Fc: number;
    if (modo === null) {
      if (Math.abs(dot(F, perp)) > 1e-9) return null; // en el aire cae de costado: no es unidimensional
      Fc = dot(F, e);
    } else {
      const s = m.superficies[modo.s]!;
      if (s.arco) return null; // en una curva no es unidimensional
      if (Math.abs(dot(s.t, perp)) > 1e-6) return null; // la superficie debe ser paralela al resorte
      if (s.muK > 0 || s.muS > 0) return null; // con roce ya no es armónico simple
      Fc = dot(F, e);
    }
    const k = r.k;
    const w = Math.sqrt(k / c.masa);
    const s0 = L;
    const vs0 = dot(v0, e);
    const sEq = r.largoNatural + Fc / k;
    const A = s0 - sEq;
    const B = vs0 / w;
    const s = (t: number): number => sEq + A * Math.cos(w * t) + B * Math.sin(w * t);
    const ds = (t: number): number => -A * w * Math.sin(w * t) + B * w * Math.cos(w * t);
    return {
      tipo: 'armonico',
      descripcion: `Oscilador armónico: ω = √(k/m) = ${w.toFixed(3).replace('.', ',')} rad/s, T = 2π√(m/k) = ${((2 * Math.PI) / w).toFixed(4).replace('.', ',')} s`,
      pos: (t) => ({ x: p0.x + e.x * (s(t) - s0), y: p0.y + e.y * (s(t) - s0) }),
      vel: (t) => ({ x: e.x * ds(t), y: e.y * ds(t) }),
      validoHasta: primerEvento(sim.eventos, i),
      periodo: (2 * Math.PI) / w,
    };
  }
  if (resortes.length > 1) return null;

  // --- Sin resortes ni cuerdas: aceleración constante ------------------------------------------------------
  const masa = c.masa;
  if (modo === null) {
    const a = { x: F.x / masa, y: F.y / masa };
    return {
      tipo: 'aceleracion-constante',
      descripcion: `Aceleración constante a = (${a.x.toFixed(2).replace('.', ',')}; ${a.y.toFixed(2).replace('.', ',')}) m/s²: x = x₀ + v₀t + ½at²`,
      pos: (t) => ({ x: p0.x + v0.x * t + 0.5 * a.x * t * t, y: p0.y + v0.y * t + 0.5 * a.y * t * t }),
      vel: (t) => ({ x: v0.x + a.x * t, y: v0.y + a.y * t }),
      validoHasta: primerEvento(sim.eventos, i),
    };
  }
  // Sobre una superficie: movimiento a lo largo de ella con roce cinético constante
  const s = m.superficies[modo.s]!;
  if (s.arco) return null; // en una curva la aceleración no es constante
  const nOut = { x: s.n.x * modo.lado, y: s.n.y * modo.lado };
  const N = -dot(F, nOut);
  if (N < 0) return null; // se despega: no hay solución sencilla
  const Ft = dot(F, s.t);
  const vt = dot(v0, s.t);
  let at: number;
  let hasta = primerEvento(sim.eventos, i);
  if (Math.abs(vt) > 1e-9) {
    at = (Ft - Math.sign(vt) * s.muK * N) / masa;
    if (vt * at < 0) hasta = Math.min(hasta, -vt / at); // se detiene
  } else if (Math.abs(Ft) > s.muS * N + 1e-9) {
    at = (Ft - Math.sign(Ft) * s.muK * N) / masa; // parte del reposo y desliza
  } else {
    at = 0;
  }
  const txt = at.toFixed(3).replace('.', ',');
  return {
    tipo: 'aceleracion-constante',
    descripcion: `Deslizamiento con aceleración constante a lo largo de la superficie, a = ${txt} m/s²: s = v₀t + ½at²`,
    pos: (t) => ({ x: p0.x + s.t.x * (vt * t + 0.5 * at * t * t), y: p0.y + s.t.y * (vt * t + 0.5 * at * t * t) }),
    vel: (t) => ({ x: s.t.x * (vt + at * t), y: s.t.y * (vt + at * t) }),
    validoHasta: hasta,
  };
}

/**
 * La solución analítica con su validez al día: vale hasta el primer evento del cuerpo que ya ocurrió en la simulación
 * (sale por el extremo, pasa a otra superficie, choca…), que al construirla todavía no se conocía.
 */
export function analiticaVigente(sim: Simulacion, i: number, an: Analitica): Analitica {
  const t = primerEvento(sim.eventos, i);
  return t < an.validoHasta ? { ...an, validoHasta: t } : an;
}

/** Diferencia máxima entre la simulación y la solución analítica (en metros) mientras esta es válida. */
export function errorMaximo(sim: Simulacion, i: number, an: Analitica): { posicion: number; velocidad: number; muestras: number } {
  let ep = 0;
  let ev = 0;
  let n = 0;
  for (const mu of sim.historial) {
    if (mu.t > an.validoHasta) break;
    const c = mu.cuerpos[i]!;
    const p = an.pos(mu.t);
    const v = an.vel(mu.t);
    ep = Math.max(ep, Math.hypot(c.x - p.x, c.y - p.y));
    ev = Math.max(ev, Math.hypot(c.vx - v.x, c.vy - v.y));
    n++;
  }
  return { posicion: ep, velocidad: ev, muestras: n };
}
