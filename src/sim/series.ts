import type { ColorTinta } from '../core/elementos';
import { colorDeTinta, PALETA_EXPORTACION } from '../core/colores';
import type { PaletaTema } from '../ui/tokens';
import type { Analitica } from './analitico';
import type { Muestra, Simulacion } from './motor';

/** Series para los gráficos, la tabla, el CSV y la exportación a TikZ (pgfplots). */

export type CampoGrafico = 'posicion' | 'velocidad' | 'aceleracion' | 'energia';

export const CAMPOS_GRAFICO: ReadonlyArray<{ clave: CampoGrafico; nombre: string }> = [
  { clave: 'posicion', nombre: 'Posición' },
  { clave: 'velocidad', nombre: 'Velocidad' },
  { clave: 'aceleracion', nombre: 'Aceleración' },
  { clave: 'energia', nombre: 'Energía' },
];

export interface Serie {
  /** Nombre en LaTeX (matemática, sin `$`), para la leyenda. */
  nombre: string;
  color: ColorTinta;
  puntos: Array<[number, number]>;
  discontinua?: boolean;
}

export interface Grafico {
  campo: CampoGrafico;
  titulo: string;
  /** Eje vertical, con su unidad. */
  etiquetaY: string;
  series: Serie[];
}

/** Reduce una serie a como mucho `max` puntos conservando los extremos. */
export function decimar<T>(pts: readonly T[], max: number): T[] {
  if (pts.length <= max) return [...pts];
  const out: T[] = [];
  for (let k = 0; k < max; k++) out.push(pts[Math.round((k * (pts.length - 1)) / (max - 1))]!);
  return out;
}

const por = (hist: readonly Muestra[], f: (m: Muestra) => number): Array<[number, number]> => hist.map((m) => [m.t, f(m)]);

/** Gráfico de un cuerpo con sus series (y, si hay, la solución analítica punteada). */
export function graficoDe(sim: Simulacion, i: number, campo: CampoGrafico, an: Analitica | null = null): Grafico {
  const h = sim.historial;
  const c = (m: Muestra) => m.cuerpos[i]!;
  const analitica = (f: (t: number) => number, hasta: number): Array<[number, number]> =>
    h.filter((m) => m.t <= hasta).map((m) => [m.t, f(m.t)]);
  switch (campo) {
    case 'posicion': {
      const series: Serie[] = [
        { nombre: 'x', color: 'contacto', puntos: por(h, (m) => c(m).x) },
        { nombre: 'y', color: 'movimiento', puntos: por(h, (m) => c(m).y) },
      ];
      if (an) {
        series.push({ nombre: 'x\\ \\mathrm{(anal.)}', color: 'contacto', puntos: analitica((t) => an.pos(t).x, an.validoHasta), discontinua: true });
        series.push({ nombre: 'y\\ \\mathrm{(anal.)}', color: 'movimiento', puntos: analitica((t) => an.pos(t).y, an.validoHasta), discontinua: true });
      }
      return { campo, titulo: 'Posición', etiquetaY: 'Posición (m)', series };
    }
    case 'velocidad': {
      const series: Serie[] = [
        { nombre: 'v_x', color: 'contacto', puntos: por(h, (m) => c(m).vx) },
        { nombre: 'v_y', color: 'movimiento', puntos: por(h, (m) => c(m).vy) },
        { nombre: '|v|', color: 'neutro', puntos: por(h, (m) => Math.hypot(c(m).vx, c(m).vy)) },
      ];
      if (an) {
        series.push({ nombre: 'v_x\\ \\mathrm{(anal.)}', color: 'contacto', puntos: analitica((t) => an.vel(t).x, an.validoHasta), discontinua: true });
        series.push({ nombre: 'v_y\\ \\mathrm{(anal.)}', color: 'movimiento', puntos: analitica((t) => an.vel(t).y, an.validoHasta), discontinua: true });
      }
      return { campo, titulo: 'Velocidad', etiquetaY: 'Velocidad (m/s)', series };
    }
    case 'aceleracion':
      return {
        campo,
        titulo: 'Aceleración',
        etiquetaY: 'Aceleración (m/s²)',
        series: [
          { nombre: 'a_x', color: 'contacto', puntos: por(h, (m) => c(m).ax) },
          { nombre: 'a_y', color: 'movimiento', puntos: por(h, (m) => c(m).ay) },
          { nombre: '|a|', color: 'neutro', puntos: por(h, (m) => Math.hypot(c(m).ax, c(m).ay)) },
        ],
      };
    case 'energia':
      return {
        campo,
        titulo: 'Energía',
        etiquetaY: 'Energía (J)',
        series: [
          { nombre: 'K', color: 'movimiento', puntos: por(h, (m) => m.cuerpos.reduce((s, q) => s + q.K, 0)) },
          { nombre: 'U_g', color: 'campo', puntos: por(h, (m) => m.cuerpos.reduce((s, q) => s + q.Ug, 0)) },
          { nombre: 'U_e', color: 'contacto', puntos: por(h, (m) => m.Ue) },
          { nombre: 'E_{mec}', color: 'tinta', puntos: por(h, (m) => m.E) },
          { nombre: 'W_{roce}', color: 'disipacion', puntos: por(h, (m) => m.Wroce) },
        ],
      };
  }
}

// --- Tabla -------------------------------------------------------------------------------------------------

export interface FilaTabla {
  t: number;
  x: number;
  y: number;
  v: number;
  a: number;
  K: number;
  Ug: number;
  E: number;
}

/** Una fila cada `cada` segundos (la muestra más cercana por debajo), hasta `maxFilas`. */
export function filasTabla(sim: Simulacion, i: number, cada = 0.1, maxFilas = 400): FilaTabla[] {
  const filas: FilaTabla[] = [];
  let proxima = 0;
  for (const m of sim.historial) {
    if (m.t + 1e-9 < proxima) continue;
    const c = m.cuerpos[i]!;
    filas.push({ t: m.t, x: c.x, y: c.y, v: Math.hypot(c.vx, c.vy), a: Math.hypot(c.ax, c.ay), K: c.K, Ug: c.Ug, E: m.E });
    proxima += cada;
    if (filas.length >= maxFilas) break;
  }
  return filas;
}

// --- CSV ---------------------------------------------------------------------------------------------------

export interface OpcionesCsv {
  separador?: ';' | ',' | '\t';
  /** Coma decimal (Excel en español) o punto. */
  decimal?: ',' | '.';
}

/** Todas las muestras de la simulación, un cuerpo tras otro en las columnas. */
export function aCsv(sim: Simulacion, op: OpcionesCsv = {}): string {
  const sep = op.separador ?? ';';
  const dec = op.decimal ?? ',';
  const fmt = (n: number): string => {
    const t = Number.isFinite(n) ? String(Number(n.toPrecision(9))) : '';
    return dec === ',' ? t.replace('.', ',') : t;
  };
  const cuerpos = sim.modelo.cuerpos;
  const cab = ['t (s)'];
  cuerpos.forEach((_, i) => {
    const q = cuerpos.length > 1 ? ` ${i + 1}` : '';
    cab.push(`x${q} (m)`, `y${q} (m)`, `vx${q} (m/s)`, `vy${q} (m/s)`, `ax${q} (m/s²)`, `ay${q} (m/s²)`, `K${q} (J)`, `Ug${q} (J)`, `N${q} (N)`, `f${q} (N)`);
  });
  cab.push('Ue (J)', 'E_mec (J)', 'W_roce (J)', 'W_aplicadas (J)', 'W_impactos (J)');
  const filas = [cab.join(sep)];
  for (const m of sim.historial) {
    const f = [fmt(m.t)];
    for (const c of m.cuerpos) f.push(fmt(c.x), fmt(c.y), fmt(c.vx), fmt(c.vy), fmt(c.ax), fmt(c.ay), fmt(c.K), fmt(c.Ug), fmt(c.N), fmt(c.f));
    f.push(fmt(m.Ue), fmt(m.E), fmt(m.Wroce), fmt(m.Waplicadas), fmt(m.Wimpactos));
    filas.push(f.join(sep));
  }
  return filas.join('\r\n') + '\r\n';
}

// --- TikZ (pgfplots) -----------------------------------------------------------------------------------------

export interface OpcionesGraficoTikz {
  modo?: 'fragmento' | 'documento';
  anchoCm?: number;
  altoCm?: number;
  paleta?: PaletaTema;
  /** Máximo de puntos por curva. */
  puntos?: number;
}

const num = (n: number): string => {
  const t = Number(n.toPrecision(6)).toString();
  return t === '-0' ? '0' : t;
};

const nombreColor = (c: ColorTinta): string => `pz${c}`;

/** Código pgfplots del gráfico, listo para pegar en Beamer (requiere `\usepackage{pgfplots}`). */
export function graficoATikz(g: Grafico, op: OpcionesGraficoTikz = {}): string {
  const paleta = op.paleta ?? PALETA_EXPORTACION;
  const ancho = op.anchoCm ?? 12;
  const alto = op.altoCm ?? 7;
  const max = op.puntos ?? 160;
  const usados = [...new Set(g.series.map((s) => s.color))];
  const colores = usados.map((c) => `  \\definecolor{${nombreColor(c)}}{HTML}{${colorDeTinta(paleta, c).slice(1).toUpperCase()}}`);
  const trazos: string[] = [];
  for (const s of g.series) {
    const pts = decimar(s.puntos, max)
      .map(([x, y]) => `(${num(x)},${num(y)})`)
      .join(' ');
    const estilo = s.discontinua ? 'dashed, thick' : 'thick';
    trazos.push(`    \\addplot[${nombreColor(s.color)}, ${estilo}, no markers] coordinates {${pts}};`);
    trazos.push(`    \\addlegendentry{$${s.nombre}$}`);
  }
  const cuerpo = [
    '% Gráfico generado por Pizarra de Física (https://davidaguayov.github.io/pizarra/)',
    '% Requiere \\usepackage{pgfplots} y \\pgfplotsset{compat=1.17}',
    '\\begin{tikzpicture}',
    ...colores,
    `  \\begin{axis}[width=${num(ancho)}cm, height=${num(alto)}cm, xlabel={$t$ (s)}, ylabel={${g.etiquetaY}},`,
    '    grid=major, legend pos=north east, legend style={font=\\small}, every axis plot/.append style={line cap=round}]',
    ...trazos,
    '  \\end{axis}',
    '\\end{tikzpicture}',
  ].join('\n');
  if ((op.modo ?? 'fragmento') === 'fragmento') return cuerpo + '\n';
  return [
    '\\documentclass[tikz,border=4pt]{standalone}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage[T1]{fontenc}',
    '\\usepackage[spanish]{babel}',
    '\\usepackage{pgfplots}',
    '\\pgfplotsset{compat=1.17}',
    '\\begin{document}',
    cuerpo,
    '\\end{document}',
    '',
  ].join('\n');
}
