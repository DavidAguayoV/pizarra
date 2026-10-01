import type { Punto } from '../core/camara';
import { colorDeTinta, PALETA_EXPORTACION } from '../core/colores';
import type { ColorTinta, Elemento, Imagen, Linea, Texto, Trazo } from '../core/elementos';
import { COLORES_TINTA, geometriaPunta, INTERLINEADO, lineasDe, puntosDe } from '../core/elementos';
import { OPACIDAD_RESALTADOR } from '../ink/dibujo';
import { grosorMedio } from '../ink/herramientas';
import { bezierPorPuntos, simplificarRdp } from '../ink/suavizado';
import type { PaletaTema } from '../ui/tokens';
import { cajaEscena } from './svg';

/**
 * Exportación a TikZ para pegar en LaTeX / Beamer.
 *
 * - Coordenadas en cm, con el origen en la esquina inferior izquierda del contenido.
 * - Trazos libres: Ramer–Douglas–Peucker y luego curvas Bézier cúbicas suaves.
 * - Textos y etiquetas en español; el texto entre $...$ se deja como matemática.
 * - Los colores se definen dentro de la figura, con nombre `pz<rol>`.
 */

export interface OpcionesTikz {
  /** `fragmento`: solo el tikzpicture (para pegar). `documento`: standalone compilable. */
  modo?: 'fragmento' | 'documento';
  /** Ancho total de la figura en cm. Por defecto 12. Se ignora si se da `cmPorMetro`. */
  anchoCm?: number;
  /** Escala fija: centímetros de la figura por metro de la pizarra. */
  cmPorMetro?: number;
  paleta?: PaletaTema;
}

export interface ImagenExportada {
  nombre: string;
  src: string;
}

export interface ResultadoTikz {
  codigo: string;
  /** Archivos que el .tex referencia con \includegraphics (deben quedar junto al .tex). */
  imagenes: ImagenExportada[];
}

const PT_POR_CM = 28.4528;
const TOLERANCIA_RDP_CM = 0.02;
export const ANCHO_CM_POR_DEFECTO = 12;

const NOMBRES_CAPA: Record<Elemento['tipo'], string> = {
  trazo: 'trazos libres',
  linea: 'formas',
  flecha: 'formas',
  rect: 'formas',
  elipse: 'formas',
  texto: 'texto',
  imagen: 'imágenes',
};

export function nombreColor(c: ColorTinta): string {
  return `pz${c}`;
}

function num(v: number, dec = 3): string {
  const r = v.toFixed(dec).replace(/\.?0+$/, '');
  return r === '-0' || r === '' ? '0' : r;
}

/** Escapa los caracteres especiales de LaTeX; deja intacto lo que va entre $...$ si están balanceados. */
export function escaparLatex(texto: string): string {
  const trozos = texto.split('$');
  const balanceado = trozos.length % 2 === 1;
  const esc = (s: string) =>
    s
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/([&%#_{}])/g, '\\$1')
      .replace(/\$/g, '\\$')
      .replace(/~/g, '\\textasciitilde{}')
      .replace(/\^/g, '\\textasciicircum{}');
  if (!balanceado) return esc(texto);
  return trozos.map((t, i) => (i % 2 === 1 ? `$${t}$` : esc(t))).join('');
}

export function aTikz(elementos: readonly Elemento[], op: OpcionesTikz = {}): ResultadoTikz {
  const paleta = op.paleta ?? PALETA_EXPORTACION;
  const caja = cajaEscena(elementos);
  const imagenes: ImagenExportada[] = [];

  const cuerpo: string[] = [];
  let escala = op.cmPorMetro ?? 1;
  if (caja) {
    const anchoM = Math.max(caja.x1 - caja.x0, 1e-6);
    escala = op.cmPorMetro ?? (op.anchoCm ?? ANCHO_CM_POR_DEFECTO) / anchoM;
    const P = (p: Punto): string => `(${num((p.x - caja.x0) * escala)},${num((p.y - caja.y0) * escala)})`;
    const grosorPt = (g: number): string => `line width=${num(Math.max(g * escala * PT_POR_CM, 0.2), 2)}pt`;
    let capa = '';
    for (const e of elementos) {
      const nombre = NOMBRES_CAPA[e.tipo];
      if (nombre !== capa) {
        cuerpo.push(`  % --- ${nombre} ---`);
        capa = nombre;
      }
      cuerpo.push(...elementoTikz(e, escala, P, grosorPt, imagenes));
    }
  } else {
    cuerpo.push('  % (escena vacía)');
  }

  const usados = COLORES_TINTA.filter((c) => elementos.some((e) => e.tipo !== 'imagen' && e.color === c));
  const colores = usados.map(
    (c) => `  \\definecolor{${nombreColor(c)}}{HTML}{${colorDeTinta(paleta, c).slice(1).toUpperCase()}}`,
  );

  const figura = [
    '% Figura generada por Pizarra de Física (https://davidaguayov.github.io/pizarra/)',
    '% Requiere \\usepackage{tikz}' + (imagenes.length ? ' y \\usepackage{graphicx}' : ''),
    `% Escala: ${num(escala, 2)} cm por metro de pizarra`,
    '\\begin{tikzpicture}[x=1cm, y=1cm]',
    ...(colores.length ? ['  % --- colores ---', ...colores] : []),
    ...cuerpo,
    '\\end{tikzpicture}',
  ].join('\n');

  if ((op.modo ?? 'fragmento') === 'fragmento') return { codigo: figura + '\n', imagenes };

  const documento = [
    '\\documentclass[tikz,border=4pt]{standalone}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage[T1]{fontenc}',
    '\\usepackage[spanish]{babel}',
    '\\usepackage{graphicx}',
    '\\begin{document}',
    figura,
    '\\end{document}',
    '',
  ].join('\n');
  return { codigo: documento, imagenes };
}

function elementoTikz(
  e: Elemento,
  escala: number,
  P: (p: Punto) => string,
  grosorPt: (g: number) => string,
  imagenes: ImagenExportada[],
): string[] {
  switch (e.tipo) {
    case 'trazo':
      return trazoTikz(e, escala, P, grosorPt);
    case 'linea':
      return [`  \\draw[${nombreColor(e.color)}, ${grosorPt(e.grosor)}, line cap=round] ${P(e.a)} -- ${P(e.b)};`];
    case 'flecha':
      // La punta es un triángulo relleno, igual que en pantalla; el cuerpo termina en su base.
      return flechaTikz(e, P, grosorPt);
    case 'rect':
      return [
        `  \\draw[${nombreColor(e.color)}, ${grosorPt(e.grosor)}, line join=round] ${P(e.a)} rectangle ${P(e.b)};`,
      ];
    case 'elipse': {
      const centro = P({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 });
      const rx = (Math.abs(e.b.x - e.a.x) / 2) * escala;
      const ry = (Math.abs(e.b.y - e.a.y) / 2) * escala;
      return [`  \\draw[${nombreColor(e.color)}, ${grosorPt(e.grosor)}] ${centro} ellipse (${num(rx)} and ${num(ry)});`];
    }
    case 'texto':
      return [textoTikz(e, escala, P)];
    case 'imagen':
      return [imagenTikz(e, escala, P, imagenes)];
  }
}

function flechaTikz(e: Linea, P: (p: Punto) => string, grosorPt: (g: number) => string): string[] {
  const g = geometriaPunta(e);
  const col = nombreColor(e.color);
  return [
    `  \\draw[${col}, ${grosorPt(e.grosor)}, line cap=round] ${P(e.a)} -- ${P(g.base)};`,
    `  \\fill[${col}] ${P(g.cola)} -- ${P(g.izq)} -- ${P(g.der)} -- cycle;`,
  ];
}

function trazoTikz(t: Trazo, escala: number, P: (p: Punto) => string, grosorPt: (g: number) => string): string[] {
  const pts = simplificarRdp(puntosDe(t), TOLERANCIA_RDP_CM / escala);
  if (pts.length === 0) return [];
  const col = nombreColor(t.color);
  const g = grosorMedio(t);
  const opciones = [col, grosorPt(g), t.resaltador ? `opacity=${OPACIDAD_RESALTADOR}` : '', 'line cap=round', 'line join=round']
    .filter(Boolean)
    .join(', ');
  const solo = pts.length === 1 || (pts.length === 2 && pts[0]!.x === pts[1]!.x && pts[0]!.y === pts[1]!.y);
  if (solo) {
    return [`  \\fill[${col}${t.resaltador ? `, opacity=${OPACIDAD_RESALTADOR}` : ''}] ${P(pts[0]!)} circle (${num((g * escala) / 2)});`];
  }
  if (pts.length === 2) return [`  \\draw[${opciones}] ${P(pts[0]!)} -- ${P(pts[1]!)};`];
  const segs = bezierPorPuntos(pts);
  const lineas = [`  \\draw[${opciones}] ${P(pts[0]!)}`];
  for (const s of segs) lineas.push(`    .. controls ${P(s.c1)} and ${P(s.c2)} .. ${P(s.fin)}`);
  lineas[lineas.length - 1] += ';';
  return lineas;
}

function textoTikz(t: Texto, escala: number, P: (p: Punto) => string): string {
  const pt = t.tam * escala * PT_POR_CM;
  const fuente = `font={\\fontsize{${num(pt, 2)}}{${num(pt * INTERLINEADO, 2)}}\\selectfont}`;
  const cuerpo = lineasDe(t).map(escaparLatex).join(' \\\\ ');
  return `  \\node[text=${nombreColor(t.color)}, anchor=north west, inner sep=0pt, align=left, ${fuente}] at ${P(t.pos)} {${cuerpo}};`;
}

function imagenTikz(i: Imagen, escala: number, P: (p: Punto) => string, imagenes: ImagenExportada[]): string {
  const nombre = `pizarra-imagen-${imagenes.length + 1}.${i.src.startsWith('data:image/png') ? 'png' : 'jpg'}`;
  imagenes.push({ nombre, src: i.src });
  return `  \\node[anchor=north west, inner sep=0pt] at ${P(i.pos)} {\\includegraphics[width=${num(i.ancho * escala)}cm]{${nombre}}};`;
}
