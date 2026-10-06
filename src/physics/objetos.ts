import type { Punto } from '../core/camara';
import { arcoDe, largoTramo, marcoTramo, puntoEnTramo } from './curvas';
import type { Bloque, Cuerda, Elemento, Esfera, Polea, Resorte, Superficie } from '../core/elementos';
import { nuevoIdElemento } from '../core/elementos';

/**
 * Objetos físicos de la pizarra: bloque, esfera, superficie (suelo, plano inclinado, pared),
 * polea, cuerda y resorte. Son figuras geométricas con propiedades físicas; el diagrama de
 * cuerpo libre (`dcl.ts`) infiere los contactos por cercanía.
 */

export const TIPOS_OBJETO = ['bloque', 'esfera', 'superficie', 'plano', 'curva', 'polea', 'cuerda', 'resorte'] as const;
export type TipoObjeto = (typeof TIPOS_OBJETO)[number];

export const NOMBRE_OBJETO: Readonly<Record<TipoObjeto, string>> = {
  bloque: 'Bloque',
  esfera: 'Esfera',
  superficie: 'Superficie',
  plano: 'Plano inclinado',
  curva: 'Curva',
  polea: 'Polea',
  cuerda: 'Cuerda',
  resorte: 'Resorte',
};

export const GROSOR_OBJETO = 0.03;
export const MASA_POR_DEFECTO = 2;
/** Tamaños de las piezas que se colocan con un clic (Nivel 2: piezas de tamaño fijo, editables en su panel). */
export const ANCHO_BLOQUE = 0.5;
export const ALTO_BLOQUE = 0.4;
export const RADIO_ESFERA = 0.25;
export const RADIO_POLEA = 0.25;
const redondear = (n: number): number => Math.round(n * 1e4) / 1e4;
const pt = (p: Punto): Punto => ({ x: redondear(p.x), y: redondear(p.y) });

export function crearBloque(centro: Punto, ancho = 0.9, alto = 0.6, extra: Partial<Bloque> = {}): Bloque {
  return {
    id: nuevoIdElemento(),
    tipo: 'bloque',
    color: 'tinta',
    centro: pt(centro),
    ancho,
    alto,
    angulo: 0,
    masa: MASA_POR_DEFECTO,
    etiqueta: 'm',
    ...extra,
  };
}

export function crearEsfera(centro: Punto, radio = 0.35, extra: Partial<Esfera> = {}): Esfera {
  return { id: nuevoIdElemento(), tipo: 'esfera', color: 'tinta', centro: pt(centro), radio, masa: MASA_POR_DEFECTO, etiqueta: 'm', ...extra };
}

export function crearSuperficie(a: Punto, b: Punto, extra: Partial<Superficie> = {}): Superficie {
  return {
    id: nuevoIdElemento(),
    tipo: 'superficie',
    color: 'tinta',
    a: pt(a),
    b: pt(b),
    muS: 0,
    muK: 0,
    relleno: 'achurado',
    grosor: GROSOR_OBJETO,
    ...extra,
  };
}

export function crearPolea(centro: Punto, radio = 0.3, extra: Partial<Polea> = {}): Polea {
  return { id: nuevoIdElemento(), tipo: 'polea', color: 'tinta', centro: pt(centro), radio, grosor: GROSOR_OBJETO * 0.8, ...extra };
}

export function crearCuerda(a: Punto, b: Punto, extra: Partial<Cuerda> = {}): Cuerda {
  return { id: nuevoIdElemento(), tipo: 'cuerda', color: 'tinta', a: pt(a), b: pt(b), grosor: GROSOR_OBJETO * 0.6, ...extra };
}

export function crearResorte(a: Punto, b: Punto, extra: Partial<Resorte> = {}): Resorte {
  const largo = Math.hypot(b.x - a.x, b.y - a.y);
  return {
    id: nuevoIdElemento(),
    tipo: 'resorte',
    color: 'tinta',
    a: pt(a),
    b: pt(b),
    k: 100,
    largoNatural: redondear(largo),
    espiras: 8,
    grosor: GROSOR_OBJETO * 0.6,
    ...extra,
  };
}

// --- Geometría de superficies ------------------------------------------------------------------

/** Ángulo de la superficie respecto del horizontal (rad), en la dirección a → b. */
export function anguloSuperficie(s: Superficie): number {
  return Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);
}

/** Largo de un segmento. */
export function largoSegmento(a: Punto, b: Punto): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Normal unitaria "hacia arriba" de la superficie: a la izquierda de a → b. El lado sólido
 * (achurado, cuña) queda a la derecha; para invertirlo se intercambian a y b.
 */
export function normalSuperficie(s: Superficie): Punto {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: -dy / l, y: dx / l };
}

const PASO_ACHURADO = 0.18;
const LARGO_ACHURADO = 0.14;

/** Rayitas del achurado, del lado sólido. Cada una es un segmento [desde, hasta]. */
export function achurado(s: Superficie): Array<[Punto, Punto]> {
  if (arcoDe(s)) {
    // En una curva, cada rayita sale de su punto con la normal y la tangente de ese punto.
    const L = largoTramo(s);
    const cuantas = Math.max(1, Math.floor(L / PASO_ACHURADO));
    const margen = (L - (cuantas - 1) * PASO_ACHURADO) / 2;
    return Array.from({ length: cuantas }, (_, i) => {
      const p = puntoEnTramo(s, (margen + i * PASO_ACHURADO) / L);
      const { n, t } = marcoTramo(s, p);
      return [p, { x: p.x - n.x * LARGO_ACHURADO - t.x * LARGO_ACHURADO, y: p.y - n.y * LARGO_ACHURADO - t.y * LARGO_ACHURADO }] as [Punto, Punto];
    });
  }
  const l = largoSegmento(s.a, s.b);
  if (l < 1e-6) return [];
  const n = normalSuperficie(s);
  const t = { x: (s.b.x - s.a.x) / l, y: (s.b.y - s.a.y) / l };
  const out: Array<[Punto, Punto]> = [];
  const cuantas = Math.max(1, Math.floor(l / PASO_ACHURADO));
  const margen = (l - (cuantas - 1) * PASO_ACHURADO) / 2;
  for (let i = 0; i < cuantas; i++) {
    const d = margen + i * PASO_ACHURADO;
    const p = { x: s.a.x + t.x * d, y: s.a.y + t.y * d };
    out.push([p, { x: p.x - n.x * LARGO_ACHURADO - t.x * LARGO_ACHURADO, y: p.y - n.y * LARGO_ACHURADO - t.y * LARGO_ACHURADO }]);
  }
  return out;
}

/** Triángulo de la cuña del plano inclinado: a, b y la esquina del lado sólido. */
export function trianguloCuna(s: Superficie): [Punto, Punto, Punto] {
  const n = normalSuperficie(s);
  const candidatos = [{ x: s.b.x, y: s.a.y }, { x: s.a.x, y: s.b.y }];
  // La esquina elegida es la que queda del lado sólido (opuesto a la normal).
  const lado = (p: Punto) => (p.x - s.a.x) * n.x + (p.y - s.a.y) * n.y;
  const esquina = lado(candidatos[0]!) < lado(candidatos[1]!) ? candidatos[0]! : candidatos[1]!;
  return [s.a, s.b, esquina];
}

// --- Roce a la vista ------------------------------------------------------------------------------

/** Coeficientes por defecto de una superficie «con roce» (botón de Armar). */
export const ROCE_POR_DEFECTO = { muS: 0.4, muK: 0.3 } as const;

/**
 * Etiqueta con los coeficientes de roce de una superficie (si tiene): en LaTeX y su centro, del lado sólido (bajo el
 * achurado o dentro de la cuña), donde no la tapan los cuerpos que se apoyan encima.
 */
export function etiquetaRoce(s: Superficie): { fuente: string; centro: Punto } | null {
  if (!(s.muS > 0) && !(s.muK > 0)) return null;
  const l = largoSegmento(s.a, s.b);
  if (l < 1e-6) return null;
  const m = puntoEnTramo(s, 0.5);
  const n = arcoDe(s) ? marcoTramo(s, m).n : normalSuperficie(s);
  const num = (x: number) => String(Math.round(x * 1000) / 1000).replace('.', '{,}');
  const fuente = `\\mu_s=${num(s.muS)},\\ \\mu_k=${num(s.muK)}`;
  const d = s.relleno === 'cuna' && !arcoDe(s) ? 0.32 : 0.34;
  return { fuente, centro: { x: m.x - n.x * d, y: m.y - n.y * d } };
}

// --- Resorte -------------------------------------------------------------------------------------

/** Vértices del zigzag: tramos rectos en las puntas y `espiras` dientes en el medio. */
export function puntosResorte(r: Resorte): Punto[] {
  const l = largoSegmento(r.a, r.b);
  if (l < 1e-6) return [r.a, r.b];
  const t = { x: (r.b.x - r.a.x) / l, y: (r.b.y - r.a.y) / l };
  const n = { x: -t.y, y: t.x };
  const lead = Math.min(0.15 * l, 0.25);
  const util = Math.max(l - 2 * lead, 0);
  const amp = Math.min(0.1, util / (r.espiras * 2) * 1.2);
  const pts: Punto[] = [r.a, { x: r.a.x + t.x * lead, y: r.a.y + t.y * lead }];
  const dientes = Math.max(1, Math.round(r.espiras)) * 2;
  for (let i = 1; i <= dientes; i++) {
    const d = lead + (util * (i - 0.5)) / dientes;
    const signo = i % 2 === 1 ? 1 : -1;
    pts.push({ x: r.a.x + t.x * d + n.x * amp * signo, y: r.a.y + t.y * d + n.y * amp * signo });
  }
  pts.push({ x: r.b.x - t.x * lead, y: r.b.y - t.y * lead }, r.b);
  return pts;
}

/** Elongación del resorte (m): positiva si está estirado. */
export function elongacion(r: Resorte): number {
  return largoSegmento(r.a, r.b) - r.largoNatural;
}

// --- Ajuste sobre superficies ------------------------------------------------------------------------

/** Distancia máxima a la que un cuerpo suelto "se pega" a una superficie al soltarlo. */
export const IMAN_SUPERFICIE = 0.3;

/**
 * Si el cuerpo quedó cerca de una superficie, lo apoya sobre ella: lo desplaza hasta tocarla y, si es
 * un bloque, lo gira para que su base quede paralela. Si no hay ninguna cerca, lo devuelve igual.
 * Así los contactos del diagrama de cuerpo libre no dependen de la puntería.
 */
export function acomodarSobreSuperficie<T extends Bloque | Esfera>(c: T, elementos: readonly Elemento[]): T {
  const s = superficieCercana(c, elementos);
  return s ? apoyarEn(c, s) : c;
}

/** La superficie a menos de `IMAN_SUPERFICIE` en la que se apoyaría el cuerpo al soltarlo, o null. */
export function superficieCercana(c: Bloque | Esfera, elementos: readonly Elemento[]): Superficie | null {
  let mejor: { s: Superficie; holgura: number } | null = null;
  for (const e of elementos) {
    if (e.tipo !== 'superficie') continue;
    const l = largoTramo(e);
    if (l < 1e-6) continue;
    const { u, d, t } = marcoTramo(e, c.centro);
    if (u < -0.25 || u > l + 0.25) continue;
    // En una curva el bloque se apoya alineado con ella.
    const rel = arcoDe(e) ? 0 : c.tipo === 'bloque' ? c.angulo - Math.atan2(t.y, t.x) : 0;
    const h = c.tipo === 'esfera' ? c.radio : (Math.abs(Math.cos(rel)) * c.alto) / 2 + (Math.abs(Math.sin(rel)) * c.ancho) / 2;
    const holgura = Math.abs(Math.abs(d) - h);
    if (holgura <= IMAN_SUPERFICIE && (!mejor || holgura < mejor.holgura)) mejor = { s: e, holgura };
  }
  return mejor?.s ?? null;
}

/**
 * Bloque sobre el que se puede apoyar un cuerpo soltado encima (su cara de arriba horizontal, el centro del cuerpo sobre
 * ella y su base a menos del imán): el más cercano, o null.
 */
export function cuerpoDebajo(c: Bloque | Esfera, elementos: readonly Elemento[]): Bloque | null {
  const base = c.tipo === 'esfera' ? c.radio : Math.abs(Math.cos(c.angulo)) * (c.alto / 2) + Math.abs(Math.sin(c.angulo)) * (c.ancho / 2);
  let mejor: { b: Bloque; holgura: number } | null = null;
  for (const e of elementos) {
    if (e.tipo !== 'bloque' || e.id === c.id || Math.abs(Math.sin(e.angulo)) > 1e-3) continue;
    if (Math.abs(c.centro.x - e.centro.x) > e.ancho / 2) continue;
    const holgura = Math.abs(c.centro.y - base - (e.centro.y + e.alto / 2));
    if (holgura <= IMAN_SUPERFICIE && c.centro.y > e.centro.y && (!mejor || holgura < mejor.holgura)) mejor = { b: e, holgura };
  }
  return mejor?.b ?? null;
}

/** Deja el cuerpo justo sobre la cara de arriba del bloque `b` (un bloque, sin inclinar). */
export function apoyarSobre<T extends Bloque | Esfera>(c: T, b: Bloque): T {
  const base = c.tipo === 'esfera' ? c.radio : c.alto / 2;
  const centro = { x: c.centro.x, y: Math.round((b.centro.y + b.alto / 2 + base) * 1e4) / 1e4 };
  return c.tipo === 'bloque' ? { ...c, centro, angulo: 0 } : { ...c, centro };
}

/** Apoya el cuerpo sobre la superficie: lo lleva hasta tocarla y, si es un bloque, lo deja paralelo a ella. */
export function apoyarEn<T extends Bloque | Esfera>(c: T, s: Superficie): T {
  if (arcoDe(s)) {
    // En una curva: sobre el punto más cercano, del lado donde está, con la normal y la tangente de ese punto.
    const mc = marcoTramo(s, c.centro);
    const lado = mc.d >= 0 ? 1 : -1;
    const q = puntoEnTramo(s, Math.min(Math.max(mc.u / mc.largo, 0), 1));
    const { n, t } = marcoTramo(s, q);
    const h = c.tipo === 'esfera' ? c.radio : c.alto / 2;
    const centro = pt({ x: q.x + n.x * lado * h, y: q.y + n.y * lado * h });
    if (c.tipo === 'esfera') return { ...c, centro };
    return { ...c, centro, angulo: redondear(Math.atan2(t.y, t.x)) };
  }
  const l = largoSegmento(s.a, s.b);
  const n = normalSuperficie(s);
  const t = { x: (s.b.x - s.a.x) / l, y: (s.b.y - s.a.y) / l };
  const rel = { x: c.centro.x - s.a.x, y: c.centro.y - s.a.y };
  const lado = rel.x * n.x + rel.y * n.y >= 0 ? 1 : -1;
  const u = Math.min(Math.max(rel.x * t.x + rel.y * t.y, 0), l);
  const h = c.tipo === 'esfera' ? c.radio : c.alto / 2;
  const centro = pt({ x: s.a.x + t.x * u + n.x * lado * h, y: s.a.y + t.y * u + n.y * lado * h });
  if (c.tipo === 'esfera') return { ...c, centro };
  return { ...c, centro, angulo: redondear(Math.atan2(t.y, t.x)) };
}
