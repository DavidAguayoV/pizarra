import { PALETA_EXPORTACION } from '../core/colores';
import type { Elemento, Imagen } from '../core/elementos';
import { aplicarCamara, CacheImagenes, dibujarElementos } from '../ink/dibujo';
import type { PaletaTema } from '../ui/tokens';
import { cajaEscena, MARGEN_EXPORTACION } from './svg';

export interface OpcionesPng {
  /** 1 = 100 px por metro (como la vista inicial); 2 y 4 para más resolución. */
  resolucion?: 1 | 2 | 4;
  transparente?: boolean;
  paleta?: PaletaTema;
}

const PX_POR_METRO_BASE = 100;
const LADO_MAX_PX = 8192;

/** Dimensiones del PNG: si se pasa del tope del navegador, baja la resolución. */
export function dimensionesPng(anchoM: number, altoM: number, resolucion: number): { ancho: number; alto: number; px: number } {
  let px = PX_POR_METRO_BASE * resolucion;
  const mayor = Math.max(anchoM, altoM) * px;
  if (mayor > LADO_MAX_PX) px *= LADO_MAX_PX / mayor;
  return { ancho: Math.max(1, Math.ceil(anchoM * px)), alto: Math.max(1, Math.ceil(altoM * px)), px };
}

export async function aPng(elementos: readonly Elemento[], op: OpcionesPng = {}): Promise<Blob> {
  const paleta = op.paleta ?? PALETA_EXPORTACION;
  const caja = cajaEscena(elementos) ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
  const m = MARGEN_EXPORTACION;
  const anchoM = caja.x1 - caja.x0 + 2 * m;
  const altoM = caja.y1 - caja.y0 + 2 * m;
  const { ancho, alto, px } = dimensionesPng(anchoM, altoM, op.resolucion ?? 1);

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');

  if (!op.transparente) {
    ctx.fillStyle = paleta.fondo;
    ctx.fillRect(0, 0, ancho, alto);
  }
  const imagenes = new CacheImagenes();
  await imagenes.precargar(elementos.filter((e): e is Imagen => e.tipo === 'imagen'));

  const cx = (caja.x0 + caja.x1) / 2;
  const cy = (caja.y0 + caja.y1) / 2;
  aplicarCamara(ctx, { cx, cy, escala: px }, { ancho, alto }, 1);
  dibujarElementos(ctx, elementos, { paleta, imagenes, escala: px });

  return new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo generar el PNG.'))), 'image/png'));
}
