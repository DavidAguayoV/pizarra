import type { Punto } from '../core/camara';
import type { Bloque, Cuerda, Elemento, Esfera, Polea, Resorte, Superficie } from '../core/elementos';
import { nuevoIdElemento } from '../core/elementos';

/**
 * Objetos físicos de la pizarra: bloque, esfera, superficie (suelo, plano inclinado, pared),
 * polea, cuerda y resorte. Son figuras geométricas con propiedades físicas; el diagrama de
 * cuerpo libre (`dcl.ts`) infiere los contactos por cercanía.
 */

export const TIPOS_OBJETO = ['bloque', 'esfera', 'superficie', 'plano', 'polea', 'cuerda', 'resorte'] as const;
export type TipoObjeto = (typeof TIPOS_OBJETO)[number];

export const NOMBRE_OBJETO: Readonly<Record<TipoObjeto, string>> = {
  bloque: 'Bloque',
  esfera: 'Esfera',
  superficie: 'Superficie',
  plano: 'Plano inclinado',
  polea: 'Polea',
  cuerda: 'Cuerda',
  resorte: 'Resorte',
};

export const GROSOR_OBJETO = 0.03;
export const MASA_POR_DEFECTO = 2;
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
  let mejor: { s: Superficie; holgura: number } | null = null;
  for (const e of elementos) {
    if (e.tipo !== 'superficie') continue;
    const l = largoSegmento(e.a, e.b);
    if (l < 1e-6) continue;
    const n = normalSuperficie(e);
    const t = { x: (e.b.x - e.a.x) / l, y: (e.b.y - e.a.y) / l };
    const rel = { x: c.centro.x - e.a.x, y: c.centro.y - e.a.y };
    const u = rel.x * t.x + rel.y * t.y;
    if (u < -0.25 || u > l + 0.25) continue;
    const d = rel.x * n.x + rel.y * n.y;
    const h = c.tipo === 'esfera' ? c.radio : Math.abs(Math.cos(c.angulo - Math.atan2(t.y, t.x))) * c.alto / 2 + Math.abs(Math.sin(c.angulo - Math.atan2(t.y, t.x))) * c.ancho / 2;
    const holgura = Math.abs(Math.abs(d) - h);
    if (holgura <= IMAN_SUPERFICIE && (!mejor || holgura < mejor.holgura)) mejor = { s: e, holgura };
  }
  if (!mejor) return c;
  const s = mejor.s;
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
