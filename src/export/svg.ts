import { colorDeTinta, PALETA_EXPORTACION } from '../core/colores';
import type { Caja2D, Elemento, Trazo } from '../core/elementos';
import { ASCENSO, cajaDe, geometriaPunta, INTERLINEADO, lineasDe, puntosDe, unirCajas } from '../core/elementos';
import { grosorMedio } from '../ink/herramientas';
import { OPACIDAD_RESALTADOR } from '../ink/dibujo';
import type { PaletaTema } from '../ui/tokens';
import { TIPOGRAFIA } from '../ui/tokens';

export interface OpcionesSvg {
  paleta?: PaletaTema;
  /** Dibuja un fondo del color de la paleta (por defecto sí). */
  fondo?: boolean;
  /** Tamaño de la figura: píxeles por metro del mundo. */
  pxPorMetro?: number;
  /** Margen alrededor del contenido, en metros. */
  margen?: number;
}

export const MARGEN_EXPORTACION = 0.15;

/** Caja que envuelve toda la escena, o null si está vacía. */
export function cajaEscena(elementos: readonly Elemento[]): Caja2D | null {
  return unirCajas(elementos.map(cajaDe));
}

export function escaparXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const n = (v: number): string => {
  const r = (Math.round(v * 100) / 100).toString();
  return r === '-0' ? '0' : r;
};

/** SVG autocontenido. El grosor de un trazo con lápiz usa el valor medio de su presión. */
export function aSvg(elementos: readonly Elemento[], op: OpcionesSvg = {}): string {
  const paleta = op.paleta ?? PALETA_EXPORTACION;
  const s = op.pxPorMetro ?? 200;
  const margen = op.margen ?? MARGEN_EXPORTACION;
  const caja = cajaEscena(elementos) ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
  const x0 = caja.x0 - margen;
  const y1 = caja.y1 + margen;
  const ancho = (caja.x1 + margen - x0) * s;
  const alto = (y1 - (caja.y0 - margen)) * s;
  const X = (x: number) => n((x - x0) * s);
  const Y = (y: number) => n((y1 - y) * s);
  const L = (m: number) => n(m * s);

  const partes = elementos.map((e) => elementoSvg(e, paleta, X, Y, L));
  const fondo = op.fondo === false ? '' : `<rect width="100%" height="100%" fill="${paleta.fondo}"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n(ancho)}" height="${n(alto)}" viewBox="0 0 ${n(ancho)} ${n(alto)}">`,
    fondo,
    ...partes,
    '</svg>',
    '',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

type Conv = (v: number) => string;

function elementoSvg(e: Elemento, paleta: PaletaTema, X: Conv, Y: Conv, L: Conv): string {
  if (e.tipo === 'imagen') {
    return `<image x="${X(e.pos.x)}" y="${Y(e.pos.y)}" width="${L(e.ancho)}" height="${L(e.alto)}" xlink:href="${e.src}"/>`;
  }
  const c = colorDeTinta(paleta, e.color);
  const trazo = (g: number) => `stroke="${c}" stroke-width="${L(g)}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  switch (e.tipo) {
    case 'trazo':
      return trazoSvg(e, c, X, Y, L);
    case 'linea':
      return `<line x1="${X(e.a.x)}" y1="${Y(e.a.y)}" x2="${X(e.b.x)}" y2="${Y(e.b.y)}" ${trazo(e.grosor)}/>`;
    case 'flecha': {
      const g = geometriaPunta(e);
      return [
        `<line x1="${X(e.a.x)}" y1="${Y(e.a.y)}" x2="${X(g.base.x)}" y2="${Y(g.base.y)}" ${trazo(e.grosor)}/>`,
        `<polygon points="${X(g.cola.x)},${Y(g.cola.y)} ${X(g.izq.x)},${Y(g.izq.y)} ${X(g.der.x)},${Y(g.der.y)}" fill="${c}"/>`,
      ].join('\n');
    }
    case 'rect':
      return `<rect x="${X(Math.min(e.a.x, e.b.x))}" y="${Y(Math.max(e.a.y, e.b.y))}" width="${L(Math.abs(e.b.x - e.a.x))}" height="${L(Math.abs(e.b.y - e.a.y))}" ${trazo(e.grosor)}/>`;
    case 'elipse':
      return `<ellipse cx="${X((e.a.x + e.b.x) / 2)}" cy="${Y((e.a.y + e.b.y) / 2)}" rx="${L(Math.abs(e.b.x - e.a.x) / 2)}" ry="${L(Math.abs(e.b.y - e.a.y) / 2)}" ${trazo(e.grosor)}/>`;
    case 'texto': {
      const lineas = lineasDe(e)
        .map((linea, i) => {
          const y = Y(e.pos.y - e.tam * (ASCENSO + i * INTERLINEADO));
          return `<tspan x="${X(e.pos.x)}" y="${y}">${escaparXml(linea)}</tspan>`;
        })
        .join('');
      return `<text font-family="${escaparXml(TIPOGRAFIA.texto)}" font-size="${L(e.tam)}" fill="${c}" xml:space="preserve">${lineas}</text>`;
    }
  }
}

function trazoSvg(t: Trazo, color: string, X: Conv, Y: Conv, L: Conv): string {
  const pts = puntosDe(t);
  if (pts.length === 0) return '';
  const g = grosorMedio(t);
  if (pts.length === 1 || (pts.length === 2 && pts[0]!.x === pts[1]!.x && pts[0]!.y === pts[1]!.y)) {
    return `<circle cx="${X(pts[0]!.x)}" cy="${Y(pts[0]!.y)}" r="${L(g / 2)}" fill="${color}"${t.resaltador ? ` fill-opacity="${OPACIDAD_RESALTADOR}"` : ''}/>`;
  }
  let d = `M${X(pts[0]!.x)} ${Y(pts[0]!.y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const q = pts[i + 1]!;
    d += ` Q${X(p.x)} ${Y(p.y)} ${X((p.x + q.x) / 2)} ${Y((p.y + q.y) / 2)}`;
  }
  const u = pts[pts.length - 1]!;
  d += ` L${X(u.x)} ${Y(u.y)}`;
  const op = t.resaltador ? ` stroke-opacity="${OPACIDAD_RESALTADOR}"` : '';
  return `<path d="${d}" stroke="${color}" stroke-width="${L(g)}" stroke-linecap="round" stroke-linejoin="round" fill="none"${op}/>`;
}
