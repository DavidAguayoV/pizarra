import type { Punto } from '../core/camara';
import type { Bloque, Cuerda, Elemento, Esfera, Superficie, Union, Vector } from '../core/elementos';
import { normalSuperficie } from '../physics/objetos';
import { puertoLocal } from './puertos';

/**
 * Migración de la versión 1: completa las relaciones que la v1 **deducía por cercanía** y la v2 guarda.
 *
 * ⚠ CONGELADO. Estas reglas son exactamente las de la Etapa 5 (`sim/modelo.ts` y `sim/motor.ts › reiniciar`),
 * copiadas aquí para que un proyecto guardado se simule igual aunque el resto del código cambie. No se
 * "mejoran": la prueba `tests/equivalencia-v1.test.ts` compara contra resultados grabados con la v1.
 *
 * Solo toca los campos que faltan (`undefined`); un elemento ya completo no cambia. Es idempotente.
 *   - cuerpo  → `apoyo`: superficies a menos de 9 cm (y dentro de su largo ± 25 cm), de la más cercana a la más lejana;
 *   - cuerda  → `union` y `ruta`: dos cuerdas que terminan a menos de radio + 14 cm de una polea forman una sola
 *               que pasa por ella (paso `fijos`); cada extremo se ata al cuerpo más cercano a menos de 9 cm, y si no hay
 *               ninguno queda **fijo** en el espacio (así lo trataba la v1);
 *   - resorte → `union`, con la misma regla de los extremos;
 *   - vector (fuerza aplicada o tensión) → `cuerpo`: el primero a menos de 15 cm de su origen.
 */

const TOL = 0.09;
const TOL_VECTOR = TOL + 0.06;
const RADIO_EXTRA_POLEA = 0.14;

type CuerpoV1 = Bloque | Esfera;

const dot = (a: Punto, b: Punto): number => a.x * b.x + a.y * b.y;
const dist = (a: Punto, b: Punto): number => Math.hypot(a.x - b.x, a.y - b.y);

function apoyoEnV1(c: CuerpoV1, d: Punto): number {
  if (c.tipo === 'esfera') return c.radio;
  const u = { x: Math.cos(c.angulo), y: Math.sin(c.angulo) };
  const v = { x: -u.y, y: u.x };
  return (Math.abs(dot(d, u)) * c.ancho) / 2 + (Math.abs(dot(d, v)) * c.alto) / 2;
}

function distanciaAlCuerpoV1(c: CuerpoV1, p: Punto): number {
  if (c.tipo === 'esfera') return Math.max(0, Math.hypot(p.x - c.centro.x, p.y - c.centro.y) - c.radio);
  const dx = p.x - c.centro.x;
  const dy = p.y - c.centro.y;
  const co = Math.cos(-c.angulo);
  const si = Math.sin(-c.angulo);
  const lx = Math.abs(dx * co - dy * si) - c.ancho / 2;
  const ly = Math.abs(dx * si + dy * co) - c.alto / 2;
  return Math.hypot(Math.max(lx, 0), Math.max(ly, 0));
}

/** Superficies de apoyo según la regla de contacto inicial de la v1. */
function apoyosV1(c: CuerpoV1, superficies: readonly Superficie[]): string[] {
  const cand: Array<{ id: string; gap: number }> = [];
  for (const s of superficies) {
    const largo = dist(s.a, s.b) || 1e-9;
    const t = { x: (s.b.x - s.a.x) / largo, y: (s.b.y - s.a.y) / largo };
    const n = normalSuperficie(s);
    const rel = { x: c.centro.x - s.a.x, y: c.centro.y - s.a.y };
    const d = dot(rel, n);
    const lado = d >= 0 ? 1 : -1;
    const gap = lado * d - apoyoEnV1(c, n);
    const u = dot(rel, t);
    if (Math.abs(gap) <= TOL && u >= -0.25 && u <= largo + 0.25) cand.push({ id: s.id, gap: Math.abs(gap) });
  }
  // Orden estable por cercanía: la primera es la que la v1 elegía.
  return cand
    .map((x, i) => ({ ...x, i }))
    .sort((p, q) => p.gap - q.gap || p.i - q.i)
    .map((x) => x.id);
}

/** ¿Hace falta completar algo? (atajo para no copiar la escena en cada llamada) */
function incompleta(elementos: readonly Elemento[]): boolean {
  return elementos.some(
    (e) =>
      ((e.tipo === 'bloque' || e.tipo === 'esfera') && e.apoyo === undefined) ||
      ((e.tipo === 'cuerda' || e.tipo === 'resorte') && e.union === undefined) ||
      (e.tipo === 'vector' && e.cuerpo === undefined && !e.fantasma && (e.rol === 'aplicada' || e.rol === 'tension')),
  );
}

const memo = new WeakMap<readonly Elemento[], Elemento[]>();

export function completarV1(elementos: readonly Elemento[]): Elemento[] {
  if (!incompleta(elementos)) return elementos as Elemento[];
  const previo = memo.get(elementos);
  if (previo) return previo;

  const cuerpos = elementos.filter((e): e is CuerpoV1 => e.tipo === 'bloque' || e.tipo === 'esfera');
  const superficies = elementos.filter((e): e is Superficie => e.tipo === 'superficie');

  const extremo = (p: Punto): Union => {
    let mejor: CuerpoV1 | null = null;
    let dMejor = Infinity;
    for (const c of cuerpos) {
      const d = distanciaAlCuerpoV1(c, p);
      if (d < dMejor) {
        dMejor = d;
        mejor = c;
      }
    }
    return mejor && dMejor <= TOL ? { el: mejor.id, puerto: puertoLocal(mejor, p) } : { fijo: true };
  };

  const reemplazos = new Map<string, Elemento | null>();

  // Cuerdas que pasan por una polea (solo entre las que aún no tienen uniones).
  const legado = elementos.filter((e): e is Cuerda => e.tipo === 'cuerda' && e.union === undefined);
  const usadas = new Set<string>();
  for (const pol of elementos) {
    if (pol.tipo !== 'polea') continue;
    const tocan = legado
      .filter((c) => !usadas.has(c.id))
      .map((c) => {
        const da = dist(c.a, pol.centro);
        const db = dist(c.b, pol.centro);
        const radio = pol.radio + RADIO_EXTRA_POLEA;
        if (da <= radio && da <= db) return { c, lejano: c.b, cercano: c.a };
        if (db <= radio) return { c, lejano: c.a, cercano: c.b };
        return null;
      })
      .filter((x): x is { c: Cuerda; lejano: Punto; cercano: Punto } => x !== null);
    if (tocan.length !== 2) continue;
    const [u, v] = tocan as [(typeof tocan)[number], (typeof tocan)[number]];
    const unida: Cuerda = {
      ...u.c,
      a: u.lejano,
      b: v.lejano,
      union: [extremo(u.lejano), extremo(v.lejano)],
      ruta: [{ el: pol.id, fijos: [{ ...u.cercano }, { ...v.cercano }] }],
    };
    reemplazos.set(u.c.id, unida);
    reemplazos.set(v.c.id, null);
    usadas.add(u.c.id);
    usadas.add(v.c.id);
  }

  const out: Elemento[] = [];
  for (const e of elementos) {
    if (reemplazos.has(e.id)) {
      const r = reemplazos.get(e.id);
      if (r) out.push(r);
      continue;
    }
    if ((e.tipo === 'bloque' || e.tipo === 'esfera') && e.apoyo === undefined) out.push({ ...e, apoyo: apoyosV1(e, superficies) });
    else if ((e.tipo === 'cuerda' || e.tipo === 'resorte') && e.union === undefined) out.push({ ...e, union: [extremo(e.a), extremo(e.b)] });
    else if (e.tipo === 'vector' && e.cuerpo === undefined && !e.fantasma && (e.rol === 'aplicada' || e.rol === 'tension')) out.push({ ...e, cuerpo: cuerpoDeVector(e, cuerpos) });
    else out.push(e);
  }
  memo.set(elementos, out);
  return out;
}

function cuerpoDeVector(v: Vector, cuerpos: readonly CuerpoV1[]): string | null {
  return cuerpos.find((c) => distanciaAlCuerpoV1(c, v.a) <= TOL_VECTOR)?.id ?? null;
}

/**
 * Lo que la migración agrega a una escena v1, como un lote (para la op `escena/migracion`): los elementos
 * completados se actualizan y las cuerdas que se fundieron en otra se borran.
 */
export function loteMigracion(elementos: readonly Elemento[]): { actualizar: Elemento[]; borrar: string[] } | null {
  const completos = completarV1(elementos);
  if (completos === elementos) return null;
  const nuevos = new Map(completos.map((e) => [e.id, e]));
  const actualizar: Elemento[] = [];
  const borrar: string[] = [];
  for (const e of elementos) {
    const n = nuevos.get(e.id);
    if (!n) borrar.push(e.id);
    else if (n !== e) actualizar.push(n);
  }
  return { actualizar, borrar };
}
