import type { Punto } from '../core/camara';
import { claveColor, colorDeTinta, PALETA_EXPORTACION } from '../core/colores';
import type { Bloque, ColorTinta, Ejes, Elemento, Esfera, Imagen, Linea, Polea, Resorte, Superficie, Texto, Tramo, Trazo, Vector } from '../core/elementos';
import { COLORES_RESALTADOR, COLORES_TINTA, esquinasBloque, extremosEjes, geometriaPunta, INTERLINEADO, lineasDe, puntosDe } from '../core/elementos';
import { achurado, puntosResorte, trianguloCuna } from '../physics/objetos';
import type { AnclaEtiqueta } from '../physics/vectores';
import { aGrados, anclarCaja, anclaEtiquetaVector, anclasEjes, arcoAngulo, geometriaComponentes } from '../physics/vectores';
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
  ejes: 'sistema de referencia',
  vector: 'vectores',
  bloque: 'objetos',
  esfera: 'objetos',
  superficie: 'objetos',
  polea: 'objetos',
  cuerda: 'objetos',
  resorte: 'objetos',
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
    const ejes = new Map(elementos.filter((e): e is Ejes => e.tipo === 'ejes').map((e) => [e.id, e]));
    const ejesDe = (id: string): Ejes | null => ejes.get(id) ?? null;
    let capa = '';
    for (const e of elementos) {
      const nombre = NOMBRES_CAPA[e.tipo];
      if (nombre !== capa) {
        cuerpo.push(`  % --- ${nombre} ---`);
        capa = nombre;
      }
      cuerpo.push(...elementoTikz(e, escala, P, grosorPt, imagenes, ejesDe));
    }
  } else {
    cuerpo.push('  % (escena vacía)');
  }

  const usados = [...COLORES_TINTA, ...COLORES_RESALTADOR].filter((c) => elementos.some((e) => claveColor(e) === c));
  const usaCuerpo = elementos.some((e) => e.tipo === 'bloque' || e.tipo === 'esfera' || e.tipo === 'polea' || (e.tipo === 'superficie' && e.relleno === 'cuna'));
  const coloresCuerpo = usaCuerpo
    ? [
        `  \\definecolor{pzcuerpo}{HTML}{${paleta.cuerpo.slice(1).toUpperCase()}}`,
        `  \\definecolor{pzborde}{HTML}{${paleta.cuerpoBorde.slice(1).toUpperCase()}}`,
      ]
    : [];
  const colores = [...coloresCuerpo, ...usados.map(
    (c) => `  \\definecolor{${nombreColor(c)}}{HTML}{${colorDeTinta(paleta, c).slice(1).toUpperCase()}}`,
  )];

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
  ejesDe: (id: string) => Ejes | null,
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
    case 'vector':
      return vectorTikz(e, escala, P, grosorPt, ejesDe);
    case 'ejes':
      return ejesTikz(e, escala, P, grosorPt);
    case 'bloque':
      return bloqueTikz(e, escala, P, grosorPt);
    case 'esfera':
      return esferaTikz(e, escala, P, grosorPt);
    case 'superficie':
      return superficieTikz(e, P, grosorPt);
    case 'polea':
      return poleaTikz(e, escala, P, grosorPt);
    case 'cuerda':
      return [`  \\draw[${nombreColor(e.color)}, ${grosorPt(e.grosor)}, line cap=round] ${e.camino ? caminoTikz(e.camino, escala, P) : `${P(e.a)} -- ${P(e.b)}`};`];
    case 'resorte':
      return resorteTikz(e, P, grosorPt);
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

type Pt = { x: number; y: number };
const PT_CM = PT_POR_CM;

function nodoEtiqueta(a: AnclaEtiqueta | null, color: string, escala: number, P: (p: Punto) => string): string[] {
  if (!a) return [];
  const pt = a.tam * escala * PT_CM;
  const fuente = `font={\\fontsize{${num(pt, 2)}}{${num(pt * INTERLINEADO, 2)}}\\selectfont}`;
  return [`  \\node[text=${color}, inner sep=0pt, ${fuente}] at ${P(a.centro)} {$${a.fuente}$};`];
}

/** Cuerpo de la flecha hasta la base de la punta y la punta como triángulo relleno. */
function flechaDe(a: Pt, b: Pt, grosor: number, opciones: string, color: string, P: (p: Punto) => string, grosorPt: (g: number) => string): string[] {
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-4) return [];
  const g = geometriaPunta({ a, b, grosor });
  const relleno = /opacity=([\d.]+)/.exec(opciones);
  return [
    `  \\draw[${color}, ${grosorPt(grosor)}, line cap=round${opciones}] ${P(a)} -- ${P(g.base)};`,
    `  \\fill[${color}${relleno ? `, opacity=${relleno[1]}` : ''}] ${P(g.cola)} -- ${P(g.izq)} -- ${P(g.der)} -- cycle;`,
  ];
}

function vectorTikz(
  v: Vector,
  escala: number,
  P: (p: Punto) => string,
  grosorPt: (g: number) => string,
  ejesDe: (id: string) => Ejes | null,
): string[] {
  const clave = claveColor(v);
  const col = nombreColor(clave ?? 'tinta');
  const ejes = v.ref ? ejesDe(v.ref) : null;
  const out: string[] = [];
  if (v.componentes && !v.fantasma) {
    const g = geometriaComponentes(v, ejes);
    for (const p of [g.d.puntaX, g.d.puntaY]) {
      out.push(`  \\draw[${col}, ${grosorPt(v.grosor * 0.5)}, dotted, opacity=0.45] ${P(v.b)} -- ${P(p)};`);
      out.push(...flechaDe(v.a, p, v.grosor * 0.7, ', dash pattern=on 3.5pt off 2pt, opacity=0.85', col, P, grosorPt));
    }
    out.push(...nodoEtiqueta(g.etiquetaX, col, escala, P), ...nodoEtiqueta(g.etiquetaY, col, escala, P));
  }
  out.push(...flechaDe(v.a, v.b, v.grosor, v.fantasma ? ', dash pattern=on 3pt off 2pt, opacity=0.65' : '', col, P, grosorPt));
  if (v.angulo && !v.fantasma) {
    const arco = arcoAngulo(v, ejes);
    if (arco) {
      const inicio = { x: arco.centro.x + arco.radio * Math.cos(arco.desde), y: arco.centro.y + arco.radio * Math.sin(arco.desde) };
      out.push(
        `  \\draw[${col}, ${grosorPt(v.grosor * 0.5)}] ${P(inicio)} arc[start angle=${num(aGrados(arco.desde), 2)}, end angle=${num(aGrados(arco.hasta), 2)}, radius=${num(arco.radio * escala)}cm];`,
      );
      out.push(...nodoEtiqueta(arco.etiqueta, col, escala, P));
    }
  }
  out.push(...nodoEtiqueta(anclaEtiquetaVector(v), col, escala, P));
  return out;
}

function ejesTikz(e: Ejes, escala: number, P: (p: Punto) => string, grosorPt: (g: number) => string): string[] {
  const col = nombreColor(e.color);
  const [x, y] = extremosEjes(e);
  const a = anclasEjes(e);
  return [
    ...flechaDe(x.neg, x.pos, e.grosor, '', col, P, grosorPt),
    ...flechaDe(y.neg, y.pos, e.grosor, '', col, P, grosorPt),
    ...nodoEtiqueta(a.x, col, escala, P),
    ...nodoEtiqueta(a.y, col, escala, P),
  ];
}

const RELLENO_CUERPO = 'fill=pzcuerpo, draw=pzborde';

function bloqueTikz(b: Bloque, escala: number, P: (p: Punto) => string, grosorPt: (g: number) => string): string[] {
  const [a, c, d, e] = esquinasBloque(b);
  return [
    `  \\filldraw[${RELLENO_CUERPO}, ${grosorPt(0.025)}, line join=round] ${P(a)} -- ${P(c)} -- ${P(d)} -- ${P(e)} -- cycle;`,
    ...(b.etiqueta.trim() ? nodoEtiqueta(anclarCaja(b.etiqueta, b.centro), nombreColor(b.color), escala, P) : []),
  ];
}

function esferaTikz(s: Esfera, escala: number, P: (p: Punto) => string, grosorPt: (g: number) => string): string[] {
  return [
    `  \\filldraw[${RELLENO_CUERPO}, ${grosorPt(0.025)}] ${P(s.centro)} circle (${num(s.radio * escala)});`,
    ...(s.etiqueta.trim() ? nodoEtiqueta(anclarCaja(s.etiqueta, s.centro), nombreColor(s.color), escala, P) : []),
  ];
}

function superficieTikz(s: Superficie, P: (p: Punto) => string, grosorPt: (g: number) => string): string[] {
  const col = nombreColor(s.color);
  const out: string[] = [];
  if (s.relleno === 'cuna') {
    const [a, b, c] = trianguloCuna(s);
    out.push(`  \\fill[pzcuerpo, opacity=0.5] ${P(a)} -- ${P(b)} -- ${P(c)} -- cycle;`);
    out.push(`  \\draw[${col}, ${grosorPt(s.grosor * 0.6)}, line join=round] ${P(b)} -- ${P(c)} -- ${P(a)};`);
  } else if (s.relleno === 'achurado') {
    const rayas = achurado(s).map(([d, h]) => `${P(d)} -- ${P(h)}`).join(' ');
    if (rayas) out.push(`  \\draw[${col}, ${grosorPt(s.grosor * 0.5)}] ${rayas};`);
  }
  out.push(`  \\draw[${col}, ${grosorPt(s.grosor)}, line cap=round] ${P(s.a)} -- ${P(s.b)};`);
  return out;
}

/** Camino de una cuerda que pasa por poleas: rectas y `arc` (TikZ mide los ángulos como el mundo, antihorario). */
function caminoTikz(camino: readonly Tramo[], escala: number, P: (p: Punto) => string): string {
  const partes: string[] = [];
  let fin: Punto | null = null;
  for (const t of camino) {
    if (t.k === 'recta') {
      if (!fin || Math.hypot(fin.x - t.a.x, fin.y - t.a.y) > 1e-9) partes.push(P(t.a));
      partes.push(`-- ${P(t.b)}`);
      fin = t.b;
    } else {
      const g = 180 / Math.PI;
      partes.push(`arc[start angle=${num(t.desde * g, 2)}, end angle=${num((t.desde + t.barrido) * g, 2)}, radius=${num(t.r * escala)}]`);
      fin = { x: t.c.x + t.r * Math.cos(t.desde + t.barrido), y: t.c.y + t.r * Math.sin(t.desde + t.barrido) };
    }
  }
  return partes.join(' ');
}

function poleaTikz(p: Polea, escala: number, P: (p: Punto) => string, grosorPt: (g: number) => string): string[] {
  const col = nombreColor(p.color);
  return [
    `  \\filldraw[${RELLENO_CUERPO}, ${grosorPt(0.025)}] ${P(p.centro)} circle (${num(p.radio * escala)});`,
    `  \\draw[${col}, ${grosorPt(p.grosor * 0.6)}] ${P(p.centro)} circle (${num(p.radio * 0.72 * escala)});`,
    `  \\fill[${col}] ${P(p.centro)} circle (${num(Math.max(p.radio * 0.1, 0.02) * escala)});`,
  ];
}

function resorteTikz(r: Resorte, P: (p: Punto) => string, grosorPt: (g: number) => string): string[] {
  const pts = puntosResorte(r);
  const lineas = [`  \\draw[${nombreColor(r.color)}, ${grosorPt(r.grosor)}, line join=round, line cap=round] ${P(pts[0]!)}`];
  for (const p of pts.slice(1)) lineas.push(`    -- ${P(p)}`);
  lineas[lineas.length - 1] += ';';
  return lineas;
}
