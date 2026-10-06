import { colorDeElemento, PALETA_EXPORTACION } from '../core/colores';
import { arcoDe, muestrasTramo } from '../physics/curvas';
import type { Bloque, Caja2D, Ejes, Elemento, Esfera, Polea, Resorte, Superficie, Trazo, Vector } from '../core/elementos';
import { ASCENSO, cajaDe, esquinasBloque, extremosEjes, geometriaPunta, INTERLINEADO, lineasDe, puntosDe, unirCajas } from '../core/elementos';
import { componerLinea, matASvg } from '../core/matematica';
import { achurado, etiquetaRoce, puntosResorte, trianguloCuna } from '../physics/objetos';
import type { AnclaEtiqueta } from '../physics/vectores';
import { anclarCaja, anclaEtiquetaVector, anclasEjes, arcoAngulo, cajaConEtiquetas, cajaConEtiquetasEjes, geometriaComponentes } from '../physics/vectores';
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
  const ejes = new Map(elementos.filter((e): e is Ejes => e.tipo === 'ejes').map((e) => [e.id, e]));
  return unirCajas(
    elementos.map((e) => {
      if (e.tipo === 'vector') return cajaConEtiquetas(e, e.ref ? (ejes.get(e.ref) ?? null) : null);
      if (e.tipo === 'ejes') return cajaConEtiquetasEjes(e);
      return cajaDe(e);
    }),
  );
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

  const ejes = new Map(elementos.filter((e): e is Ejes => e.tipo === 'ejes').map((e) => [e.id, e]));
  const ejesDe = (id: string): Ejes | null => ejes.get(id) ?? null;
  const partes = elementos.map((e) => elementoSvg(e, paleta, X, Y, L, ejesDe));
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

function elementoSvg(e: Elemento, paleta: PaletaTema, X: Conv, Y: Conv, L: Conv, ejesDe: (id: string) => Ejes | null): string {
  if (e.tipo === 'imagen') {
    return `<image x="${X(e.pos.x)}" y="${Y(e.pos.y)}" width="${L(e.ancho)}" height="${L(e.alto)}" xlink:href="${e.src}"/>`;
  }
  const c = colorDeElemento(paleta, e);
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
    case 'texto':
      return lineasDe(e)
        .map((linea, i) =>
          matASvg(componerLinea(linea), e.pos.x, e.pos.y - e.tam * (ASCENSO + i * INTERLINEADO), e.tam, { X, Y, L }, c, TIPOGRAFIA.texto),
        )
        .join('\n');
    case 'vector':
      return vectorSvg(e, c, X, Y, L, ejesDe);
    case 'ejes':
      return ejesSvg(e, c, X, Y, L);
    case 'bloque':
      return bloqueSvg(e, c, paleta, X, Y, L);
    case 'esfera':
      return esferaSvg(e, c, paleta, X, Y, L);
    case 'superficie':
      return superficieSvg(e, c, paleta, X, Y, L);
    case 'polea':
      return poleaSvg(e, c, paleta, X, Y, L);
    case 'cuerda': {
      if (!e.camino) return `<line x1="${X(e.a.x)}" y1="${Y(e.a.y)}" x2="${X(e.b.x)}" y2="${Y(e.b.y)}" ${trazo(e.grosor)}/>`;
      // Rectas y arcos en un solo trazado. En SVG la y crece hacia abajo: un barrido antihorario del mundo es
      // horario en pantalla (sweep-flag = 1).
      let d = '';
      let fin: Pt | null = null;
      for (const t of e.camino) {
        if (t.k === 'recta') {
          if (!fin || Math.hypot(fin.x - t.a.x, fin.y - t.a.y) > 1e-9) d += `M${X(t.a.x)} ${Y(t.a.y)} `;
          d += `L${X(t.b.x)} ${Y(t.b.y)} `;
          fin = t.b;
        } else {
          const ang = t.desde + t.barrido;
          fin = { x: t.c.x + t.r * Math.cos(ang), y: t.c.y + t.r * Math.sin(ang) };
          d += `A${L(t.r)} ${L(t.r)} 0 ${Math.abs(t.barrido) > Math.PI ? 1 : 0} ${t.barrido > 0 ? 1 : 0} ${X(fin.x)} ${Y(fin.y)} `;
        }
      }
      return `<path d="${d.trim()}" fill="none" ${trazo(e.grosor)}/>`;
    }
    case 'resorte':
      return resorteSvg(e, c, X, Y, L);
  }
}

type Pt = { x: number; y: number };

function flechaSvg(a: Pt, b: Pt, grosor: number, color: string, X: Conv, Y: Conv, L: Conv, opacidad = 1, raya = ''): string {
  const g = geometriaPunta({ a, b, grosor });
  const opLinea = opacidad < 1 ? ` stroke-opacity="${opacidad}"` : '';
  const opRelleno = opacidad < 1 ? ` fill-opacity="${opacidad}"` : '';
  return [
    `<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(g.base.x)}" y2="${Y(g.base.y)}" stroke="${color}" stroke-width="${L(grosor)}" stroke-linecap="round"${opLinea}${raya}/>`,
    `<polygon points="${X(g.cola.x)},${Y(g.cola.y)} ${X(g.izq.x)},${Y(g.izq.y)} ${X(g.der.x)},${Y(g.der.y)}" fill="${color}"${opRelleno}/>`,
  ].join('\n');
}

function etiquetaSvg(a: AnclaEtiqueta | null, color: string, X: Conv, Y: Conv, L: Conv): string {
  return a ? matASvg(a.caja, a.origen.x, a.origen.y, a.tam, { X, Y, L }, color, TIPOGRAFIA.texto) : '';
}

function vectorSvg(v: Vector, c: string, X: Conv, Y: Conv, L: Conv, ejesDe: (id: string) => Ejes | null): string {
  const ejes = v.ref ? ejesDe(v.ref) : null;
  const partes: string[] = [];
  const raya = (a: number, b: number) => ` stroke-dasharray="${L(a)} ${L(b)}"`;
  if (v.componentes && !v.fantasma) {
    const g = geometriaComponentes(v, ejes);
    for (const p of [g.d.puntaX, g.d.puntaY]) {
      partes.push(`<line x1="${X(v.b.x)}" y1="${Y(v.b.y)}" x2="${X(p.x)}" y2="${Y(p.y)}" stroke="${c}" stroke-width="${L(v.grosor * 0.5)}" stroke-opacity="0.45"${raya(0.04, 0.06)}/>`);
      partes.push(flechaSvg(v.a, p, v.grosor * 0.7, c, X, Y, L, 0.85, raya(0.12, 0.06)));
    }
    partes.push(etiquetaSvg(g.etiquetaX, c, X, Y, L), etiquetaSvg(g.etiquetaY, c, X, Y, L));
  }
  partes.push(flechaSvg(v.a, v.b, v.grosor, c, X, Y, L, v.fantasma ? 0.65 : 1, v.fantasma ? raya(0.1, 0.07) : ''));
  if (v.angulo && !v.fantasma) {
    const arco = arcoAngulo(v, ejes);
    if (arco) {
      const p0 = { x: arco.centro.x + arco.radio * Math.cos(arco.desde), y: arco.centro.y + arco.radio * Math.sin(arco.desde) };
      const p1 = { x: arco.centro.x + arco.radio * Math.cos(arco.hasta), y: arco.centro.y + arco.radio * Math.sin(arco.hasta) };
      const barrido = arco.hasta > arco.desde ? 0 : 1; // el SVG tiene y hacia abajo: el sentido se invierte
      partes.push(`<path d="M${X(p0.x)} ${Y(p0.y)} A${L(arco.radio)} ${L(arco.radio)} 0 0 ${barrido} ${X(p1.x)} ${Y(p1.y)}" stroke="${c}" stroke-width="${L(v.grosor * 0.5)}" fill="none"/>`);
      partes.push(etiquetaSvg(arco.etiqueta, c, X, Y, L));
    }
  }
  partes.push(etiquetaSvg(anclaEtiquetaVector(v), c, X, Y, L));
  return partes.filter((p) => p !== '').join('\n');
}

function ejesSvg(e: Ejes, c: string, X: Conv, Y: Conv, L: Conv): string {
  const [x, y] = extremosEjes(e);
  const a = anclasEjes(e);
  return [
    flechaSvg(x.neg, x.pos, e.grosor, c, X, Y, L),
    flechaSvg(y.neg, y.pos, e.grosor, c, X, Y, L),
    etiquetaSvg(a.x, c, X, Y, L),
    etiquetaSvg(a.y, c, X, Y, L),
  ].join('\n');
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

const cuerpoAttrs = (paleta: PaletaTema, L: Conv) =>
  `fill="${paleta.cuerpo}" stroke="${paleta.cuerpoBorde}" stroke-width="${L(0.025)}" stroke-linejoin="round"`;

function bloqueSvg(b: Bloque, c: string, paleta: PaletaTema, X: Conv, Y: Conv, L: Conv): string {
  const pts = esquinasBloque(b).map((p) => `${X(p.x)},${Y(p.y)}`).join(' ');
  return [`<polygon points="${pts}" ${cuerpoAttrs(paleta, L)}/>`, b.etiqueta.trim() ? etiquetaSvg(anclarCaja(b.etiqueta, b.centro), c, X, Y, L) : ''].filter((x) => x !== '').join('\n');
}

function esferaSvg(e: Esfera, c: string, paleta: PaletaTema, X: Conv, Y: Conv, L: Conv): string {
  return [`<circle cx="${X(e.centro.x)}" cy="${Y(e.centro.y)}" r="${L(e.radio)}" ${cuerpoAttrs(paleta, L)}/>`, e.etiqueta.trim() ? etiquetaSvg(anclarCaja(e.etiqueta, e.centro), c, X, Y, L) : ''].filter((x) => x !== '').join('\n');
}

function superficieSvg(s: Superficie, c: string, paleta: PaletaTema, X: Conv, Y: Conv, L: Conv): string {
  const partes: string[] = [];
  const curva = arcoDe(s) !== null;
  if (s.relleno === 'cuna' && !curva) {
    const t = trianguloCuna(s);
    partes.push(`<polygon points="${t.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}" fill="${paleta.cuerpo}" fill-opacity="0.5" stroke="${c}" stroke-width="${L(s.grosor * 0.6)}" stroke-linejoin="round"/>`);
  } else if (s.relleno === 'achurado' || (s.relleno === 'cuna' && curva)) {
    const d = achurado(s).map(([a, b]) => `M${X(a.x)} ${Y(a.y)} L${X(b.x)} ${Y(b.y)}`).join(' ');
    if (d) partes.push(`<path d="${d}" stroke="${c}" stroke-width="${L(s.grosor * 0.5)}" fill="none"/>`);
  }
  if (curva) {
    const pts = muestrasTramo(s).map((q) => `${X(q.x)},${Y(q.y)}`).join(' ');
    partes.push(`<polyline points="${pts}" stroke="${c}" stroke-width="${L(s.grosor)}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`);
  } else partes.push(`<line x1="${X(s.a.x)}" y1="${Y(s.a.y)}" x2="${X(s.b.x)}" y2="${Y(s.b.y)}" stroke="${c}" stroke-width="${L(s.grosor)}" stroke-linecap="round"/>`);
  const roce = etiquetaRoce(s);
  if (roce) partes.push(etiquetaSvg(anclarCaja(roce.fuente, roce.centro, 0.17), c, X, Y, L));
  return partes.join('\n');
}

function poleaSvg(p: Polea, c: string, paleta: PaletaTema, X: Conv, Y: Conv, L: Conv): string {
  return [
    ...(p.soporte ? [`<line x1="${X(p.centro.x)}" y1="${Y(p.centro.y)}" x2="${X(p.soporte.x)}" y2="${Y(p.soporte.y)}" stroke="${c}" stroke-width="${L(p.grosor * 1.4)}"/>`] : []),
    `<circle cx="${X(p.centro.x)}" cy="${Y(p.centro.y)}" r="${L(p.radio)}" ${cuerpoAttrs(paleta, L)}/>`,
    `<circle cx="${X(p.centro.x)}" cy="${Y(p.centro.y)}" r="${L(p.radio * 0.72)}" fill="none" stroke="${c}" stroke-width="${L(p.grosor * 0.6)}"/>`,
    `<circle cx="${X(p.centro.x)}" cy="${Y(p.centro.y)}" r="${L(Math.max(p.radio * 0.1, 0.02))}" fill="${c}"/>`,
  ].join('\n');
}

function resorteSvg(r: Resorte, c: string, X: Conv, Y: Conv, L: Conv): string {
  const pts = puntosResorte(r).map((p) => `${X(p.x)},${Y(p.y)}`).join(' ');
  return `<polyline points="${pts}" stroke="${c}" stroke-width="${L(r.grosor)}" stroke-linejoin="round" stroke-linecap="round" fill="none"/>`;
}
