import { temaActual } from '../core/tema';
import type { ResultadoDcl } from '../physics/dcl';
import { numeroEs } from '../physics/vectores';
import { colorDeRol, PALETAS } from './tokens';

/**
 * Diagrama de cuerpo libre en miniatura (Nivel 2): al seleccionar un cuerpo se ve su DCL de inmediato, en una tarjeta
 * del panel, sin agregar nada a la pizarra (para eso está *Generar diagrama de cuerpo libre*).
 *
 * Se dibuja **a medida del espacio** (en píxeles, no a escala de la pizarra): el cuerpo al centro con un tamaño fijo,
 * las fuerzas saliendo de su borde (no lo tapan), con largo proporcional a su valor, etiquetas legibles con el valor
 * en newton, y los ejes del diagrama (alineados con la superficie si hay) tenues, de fondo.
 */

const SUB: Readonly<Record<string, string>> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  k: 'ₖ', s: 'ₛ', e: 'ₑ', l: 'ₗ',
};

/** Símbolo LaTeX simple a texto plano con subíndices: `f_k` → fₖ, `F_{el}` → Fₑₗ, `m_1 g` → m₁ g. */
export function simboloPlano(s: string): string {
  return s
    .replace(/\\vec\s*\{([^{}]*)\}/g, '$1')
    .replace(/_\{([^{}]*)\}|_(.)/g, (_, a: string | undefined, b: string | undefined) => [...(a ?? b ?? '')].map((c) => SUB[c] ?? c).join(''))
    .replace(/[\\{}$]/g, '');
}

export function dibujarMiniDcl(lienzo: HTMLCanvasElement, r: ResultadoDcl): void {
  const W = lienzo.clientWidth || 260;
  const H = lienzo.clientHeight || 170;
  const dpr = window.devicePixelRatio || 1;
  if (lienzo.width !== Math.round(W * dpr) || lienzo.height !== Math.round(H * dpr)) {
    lienzo.width = Math.round(W * dpr);
    lienzo.height = Math.round(H * dpr);
  }
  const ctx = lienzo.getContext('2d');
  if (!ctx) return;
  const paleta = PALETAS[temaActual()];
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = paleta.fondo;
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H / 2;
  // Dirección del mundo (y hacia arriba) a la pantalla (y hacia abajo).
  const dir = (ang: number) => ({ x: Math.cos(ang), y: -Math.sin(ang) });

  // Ejes del diagrama, tenues.
  const ex = dir(r.anguloEjes);
  const ey = dir(r.anguloEjes + Math.PI / 2);
  // Ejes más cortos que el espacio disponible: sus letras no deben chocar con las etiquetas de las fuerzas.
  const L = (Math.min(W, H) / 2) * 0.62;
  ctx.save();
  ctx.strokeStyle = paleta.textoSuave;
  ctx.globalAlpha = 0.45;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  for (const e of [ex, ey]) {
    ctx.beginPath();
    ctx.moveTo(cx - e.x * L, cy - e.y * L);
    ctx.lineTo(cx + e.x * L, cy + e.y * L);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = paleta.textoSuave;
  ctx.font = 'italic 12px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('x', cx + ex.x * L + ey.x * 10, cy + ex.y * L + ey.y * 10);
  ctx.fillText('y', cx + ey.x * L - ex.x * 12, cy + ey.y * L - ex.y * 12);
  ctx.restore();

  // El cuerpo, con tamaño fijo en pantalla.
  const c = r.cuerpo;
  const angCuerpo = c.tipo === 'bloque' ? (r.superficie ? r.anguloEjes : c.angulo) : 0;
  const lado = 38;
  const w = c.tipo === 'bloque' ? (c.ancho >= c.alto ? lado : (lado * c.ancho) / c.alto) : lado * 0.9;
  const h = c.tipo === 'bloque' ? (c.alto >= c.ancho ? lado : (lado * c.alto) / c.ancho) : lado * 0.9;
  const u = dir(angCuerpo);
  const v = dir(angCuerpo + Math.PI / 2);
  /** Distancia del centro al borde del cuerpo en la dirección (de pantalla) d. */
  const borde = (d: { x: number; y: number }): number =>
    c.tipo === 'esfera' ? w / 2 : (Math.abs(d.x * u.x + d.y * u.y) * w) / 2 + (Math.abs(d.x * v.x + d.y * v.y) * h) / 2;
  ctx.save();
  ctx.fillStyle = paleta.cuerpo;
  ctx.strokeStyle = paleta.cuerpoBorde;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (c.tipo === 'esfera') ctx.arc(cx, cy, w / 2, 0, Math.PI * 2);
  else {
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(u.y, u.x));
    ctx.rect(-w / 2, -h / 2, w, h);
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = paleta.texto;
  ctx.font = 'italic 14px "Cambria Math", "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(simboloPlano(c.etiqueta || 'm'), cx, cy);

  // Fuerzas: desde el borde, con largo proporcional a su valor (las incógnitas, con un largo fijo). Cada flecha usa
  // el espacio que hay hasta el borde de la tarjeta en su dirección, descontando lo que ocupa su etiqueta.
  ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
  const datos = r.fuerzas.map((f) => {
    const d = dir(f.angulo);
    const texto = `${simboloPlano(f.simbolo)} = ${f.valor === null ? '?' : `${numeroEs(f.valor)} N`}`;
    const b0 = borde(d) + 3;
    const hasta = Math.min(Math.abs(d.x) > 1e-6 ? W / 2 / Math.abs(d.x) : Infinity, Math.abs(d.y) > 1e-6 ? H / 2 / Math.abs(d.y) : Infinity);
    const etiqueta = ctx.measureText(texto).width * Math.abs(d.x) + 16 * Math.abs(d.y) + 6;
    return { f, d, texto, b0, disponible: Math.max(16, hasta - b0 - etiqueta) };
  });
  // Escala común: la fuerza conocida mayor ocupa todo el espacio que tenga en su dirección.
  const escala = Math.min(...datos.filter((x) => (x.f.valor ?? 0) > 1e-9).map((x) => x.disponible / x.f.valor!), Infinity);
  for (const { f, d, texto, b0, disponible } of datos) {
    const largo = f.valor === null ? disponible * 0.8 : f.valor <= 1e-9 ? 0 : Math.max(14, Math.min(disponible, f.valor * (Number.isFinite(escala) ? escala : 0)));
    if (largo <= 0) continue;
    const ax = cx + d.x * b0;
    const ay = cy + d.y * b0;
    const bx = ax + d.x * largo;
    const by = ay + d.y * largo;
    const col = colorDeRol(paleta, f.rol);
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx - d.x * 8, by - d.y * 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - d.x * 10 - d.y * 5, by - d.y * 10 + d.x * 5);
    ctx.lineTo(bx - d.x * 10 + d.y * 5, by - d.y * 10 - d.x * 5);
    ctx.closePath();
    ctx.fill();
    // Etiqueta pasada la punta, del lado hacia donde apunta (las incógnitas, con «?»).
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = d.x > 0.35 ? 'left' : d.x < -0.35 ? 'right' : 'center';
    ctx.textBaseline = d.y > 0.35 ? 'top' : d.y < -0.35 ? 'bottom' : 'middle';
    ctx.fillText(texto, bx + d.x * 5, by + d.y * 5);
  }
}
