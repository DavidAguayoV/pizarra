import { colorDeTinta } from '../core/colores';
import { numeroEs } from '../physics/vectores';
import type { Grafico } from '../sim/series';
import type { PaletaTema } from './tokens';
import { TIPOGRAFIA } from './tokens';

/** Marcas "redondas" para un eje: pasos de 1, 2 o 5 por potencia de 10. */
export function ticksBonitos(min: number, max: number, objetivo = 6): number[] {
  if (!(max > min)) max = min + 1;
  const bruto = (max - min) / objetivo;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const f = bruto / mag;
  const paso = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  const ticks: number[] = [];
  const inicio = Math.ceil(min / paso - 1e-9);
  for (let k = inicio; k * paso <= max + paso * 1e-9; k++) ticks.push(Number((k * paso).toPrecision(12)));
  return ticks;
}

export interface OpcionesGrafico {
  paleta: PaletaTema;
  /** Instante actual (línea vertical). */
  tActual?: number;
  /** Fin del eje horizontal; por defecto el último dato. */
  tMax?: number;
}

/** Rango del eje y con un margen; si todo es constante, un rango de ±1 alrededor. */
export function rangoY(g: Grafico): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of g.series) for (const [, y] of s.puntos) if (Number.isFinite(y)) {
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  if (!Number.isFinite(lo)) return [-1, 1];
  if (hi - lo < 1e-9) return [lo - 1, hi + 1];
  const m = (hi - lo) * 0.06;
  return [lo - m, hi + m];
}

/** Dibuja el gráfico en un canvas de `ancho` × `alto` píxeles CSS (el contexto ya trae el factor de pantalla). */
export function dibujarGrafico(ctx: CanvasRenderingContext2D, ancho: number, alto: number, g: Grafico, op: OpcionesGrafico): void {
  const { paleta } = op;
  ctx.clearRect(0, 0, ancho, alto);
  ctx.fillStyle = paleta.fondo;
  ctx.fillRect(0, 0, ancho, alto);
  const mi = { l: 52, r: 12, t: 12, b: 26 };
  const w = Math.max(10, ancho - mi.l - mi.r);
  const h = Math.max(10, alto - mi.t - mi.b);
  const ultimo = Math.max(0, ...g.series.map((s) => s.puntos.at(-1)?.[0] ?? 0));
  const tMax = Math.max(op.tMax ?? ultimo, ultimo, 0.1);
  const [y0, y1] = rangoY(g);
  const X = (t: number): number => mi.l + (t / tMax) * w;
  const Y = (y: number): number => mi.t + h - ((y - y0) / (y1 - y0)) * h;

  ctx.font = `11px ${TIPOGRAFIA.texto}`;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;
  // Rejilla y marcas
  ctx.textAlign = 'right';
  for (const ty of ticksBonitos(y0, y1, 5)) {
    ctx.strokeStyle = paleta.grilla;
    ctx.beginPath();
    ctx.moveTo(mi.l, Y(ty));
    ctx.lineTo(mi.l + w, Y(ty));
    ctx.stroke();
    ctx.fillStyle = paleta.textoSuave;
    ctx.fillText(numeroEs(ty), mi.l - 6, Y(ty));
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const tx of ticksBonitos(0, tMax, 6)) {
    ctx.strokeStyle = paleta.grilla;
    ctx.beginPath();
    ctx.moveTo(X(tx), mi.t);
    ctx.lineTo(X(tx), mi.t + h);
    ctx.stroke();
    ctx.fillStyle = paleta.textoSuave;
    ctx.fillText(numeroEs(tx), X(tx), mi.t + h + 5);
  }
  // Ejes
  ctx.strokeStyle = paleta.textoSuave;
  ctx.beginPath();
  ctx.moveTo(mi.l, mi.t);
  ctx.lineTo(mi.l, mi.t + h);
  ctx.lineTo(mi.l + w, mi.t + h);
  ctx.stroke();
  if (y0 < 0 && y1 > 0) {
    ctx.strokeStyle = paleta.grillaFuerte;
    ctx.beginPath();
    ctx.moveTo(mi.l, Y(0));
    ctx.lineTo(mi.l + w, Y(0));
    ctx.stroke();
  }
  // Etiquetas de los ejes
  ctx.fillStyle = paleta.texto;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('t (s)', ancho - 4, alto - 2);
  ctx.save();
  ctx.translate(11, mi.t + h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(g.etiquetaY, 0, -2);
  ctx.restore();

  // Curvas
  ctx.save();
  ctx.beginPath();
  ctx.rect(mi.l, mi.t, w, h);
  ctx.clip();
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  for (const s of g.series) {
    ctx.strokeStyle = colorDeTinta(paleta, s.color);
    ctx.setLineDash(s.discontinua ? [6, 4] : []);
    ctx.beginPath();
    s.puntos.forEach(([t, y], i) => (i === 0 ? ctx.moveTo(X(t), Y(y)) : ctx.lineTo(X(t), Y(y))));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  if (op.tActual !== undefined) {
    ctx.strokeStyle = paleta.activo;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(X(op.tActual), mi.t);
    ctx.lineTo(X(op.tActual), mi.t + h);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  // Leyenda (texto simple: sin subíndices; los nombres con LaTeX se aproximan)
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let lx = mi.l + 8;
  const ly = mi.t + 10;
  for (const s of g.series.filter((q) => !q.discontinua)) {
    const nombre = s.nombre.replace(/[\\{}]/g, '').replace(/_/g, '');
    ctx.fillStyle = colorDeTinta(paleta, s.color);
    ctx.fillRect(lx, ly - 2, 14, 4);
    ctx.fillStyle = paleta.texto;
    ctx.fillText(nombre, lx + 18, ly);
    lx += 26 + ctx.measureText(nombre).width;
  }
  if (g.series.some((q) => q.discontinua)) {
    ctx.fillStyle = paleta.textoSuave;
    ctx.fillText('- - analítica', lx, ly);
  }
}
