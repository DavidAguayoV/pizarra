import type { Camara, Vista } from '../core/camara';
import { pantallaAMundo } from '../core/camara';
import { colorDeTinta } from '../core/colores';
import type { Caja2D, Elemento, Imagen, Trazo } from '../core/elementos';
import { ASCENSO, cajaCacheada, cajasSeCruzan, geometriaPunta, INTERLINEADO, lineasDe, puntosDe } from '../core/elementos';
import type { PaletaTema } from '../ui/tokens';
import { TIPOGRAFIA } from '../ui/tokens';
import { factorPresion } from './herramientas';

/** Opacidad del resaltador (se superpone sin tapar el texto de abajo). */
export const OPACIDAD_RESALTADOR = 0.35;

/** Imágenes decodificadas, por id de elemento. `alCargar` pide un nuevo cuadro. */
export class CacheImagenes {
  private mapa = new Map<string, HTMLImageElement | 'cargando'>();

  constructor(private readonly alCargar: () => void = () => {}) {}

  obtener(img: Imagen): HTMLImageElement | null {
    const hit = this.mapa.get(img.id);
    if (hit && hit !== 'cargando') return hit;
    if (!hit) {
      this.mapa.set(img.id, 'cargando');
      const el = new Image();
      el.onload = () => {
        this.mapa.set(img.id, el);
        this.alCargar();
      };
      el.src = img.src;
    }
    return null;
  }

  /** Espera a que todas las imágenes dadas estén listas (para exportar PNG). */
  async precargar(imgs: readonly Imagen[]): Promise<void> {
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((res) => {
            if (this.obtener(img)) return res();
            const t = new Image();
            t.onload = t.onerror = () => {
              this.mapa.set(img.id, t);
              res();
            };
            t.src = img.src;
          }),
      ),
    );
  }
}

export interface OpcionesDibujo {
  paleta: PaletaTema;
  imagenes: CacheImagenes;
  /** Píxeles por metro (para que ninguna línea quede más fina que 1 px). */
  escala: number;
  /** Ids que no se dibujan (borrador en vivo). */
  ocultos?: ReadonlySet<string>;
}

/** Fija la transformación mundo → píxeles del canvas (incluye devicePixelRatio). */
export function aplicarCamara(ctx: CanvasRenderingContext2D, c: Camara, v: Vista, dpr: number): void {
  const s = c.escala * dpr;
  ctx.setTransform(s, 0, 0, -s, dpr * (v.ancho / 2) - c.cx * s, dpr * (v.alto / 2) + c.cy * s);
}

export function cajaVisible(c: Camara, v: Vista): Caja2D {
  const min = pantallaAMundo(c, v, { x: 0, y: v.alto });
  const max = pantallaAMundo(c, v, { x: v.ancho, y: 0 });
  return { x0: min.x, y0: min.y, x1: max.x, y1: max.y };
}

/** Dibuja los elementos que caen dentro de `visible`. Requiere `aplicarCamara` previo. */
export function dibujarElementos(
  ctx: CanvasRenderingContext2D,
  elementos: readonly Elemento[],
  op: OpcionesDibujo,
  visible?: Caja2D,
): void {
  for (const e of elementos) {
    if (op.ocultos?.has(e.id)) continue;
    if (visible && !cajasSeCruzan(cajaCacheada(e), visible)) continue;
    dibujarElemento(ctx, e, op);
  }
}

function anchoMin(op: OpcionesDibujo, grosor: number): number {
  return Math.max(grosor, 1 / op.escala);
}

export function dibujarElemento(ctx: CanvasRenderingContext2D, e: Elemento, op: OpcionesDibujo): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (e.tipo !== 'imagen') {
    const col = colorDeTinta(op.paleta, e.color);
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
  }
  switch (e.tipo) {
    case 'trazo':
      dibujarTrazo(ctx, e, op);
      break;
    case 'linea':
    case 'flecha': {
      ctx.lineWidth = anchoMin(op, e.grosor);
      if (e.tipo === 'linea') {
        ctx.beginPath();
        ctx.moveTo(e.a.x, e.a.y);
        ctx.lineTo(e.b.x, e.b.y);
        ctx.stroke();
      } else {
        const g = geometriaPunta(e);
        ctx.beginPath();
        ctx.moveTo(e.a.x, e.a.y);
        ctx.lineTo(g.base.x, g.base.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(g.cola.x, g.cola.y);
        ctx.lineTo(g.izq.x, g.izq.y);
        ctx.lineTo(g.der.x, g.der.y);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'rect': {
      ctx.lineWidth = anchoMin(op, e.grosor);
      ctx.strokeRect(Math.min(e.a.x, e.b.x), Math.min(e.a.y, e.b.y), Math.abs(e.b.x - e.a.x), Math.abs(e.b.y - e.a.y));
      break;
    }
    case 'elipse': {
      ctx.lineWidth = anchoMin(op, e.grosor);
      const rx = Math.abs(e.b.x - e.a.x) / 2;
      const ry = Math.abs(e.b.y - e.a.y) / 2;
      ctx.beginPath();
      ctx.ellipse((e.a.x + e.b.x) / 2, (e.a.y + e.b.y) / 2, Math.max(rx, 1e-6), Math.max(ry, 1e-6), 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'texto': {
      // El mundo tiene y hacia arriba: se voltea de nuevo para que el texto salga derecho.
      ctx.font = `${e.tam}px ${TIPOGRAFIA.texto}`;
      ctx.textBaseline = 'alphabetic';
      lineasDe(e).forEach((linea, i) => {
        ctx.save();
        ctx.translate(e.pos.x, e.pos.y - e.tam * (ASCENSO + i * INTERLINEADO));
        ctx.scale(1, -1);
        ctx.fillText(linea, 0, 0);
        ctx.restore();
      });
      break;
    }
    case 'imagen': {
      const img = op.imagenes.obtener(e);
      if (img) {
        ctx.save();
        ctx.translate(e.pos.x, e.pos.y);
        ctx.scale(1, -1);
        ctx.drawImage(img, 0, 0, e.ancho, e.alto);
        ctx.restore();
      } else {
        ctx.strokeStyle = op.paleta.textoSuave;
        ctx.lineWidth = 1 / op.escala;
        ctx.strokeRect(e.pos.x, e.pos.y - e.alto, e.ancho, e.alto);
      }
      break;
    }
  }
  ctx.restore();
}

function dibujarTrazo(ctx: CanvasRenderingContext2D, t: Trazo, op: OpcionesDibujo): void {
  const pts = puntosDe(t);
  const base = anchoMin(op, t.grosor);
  if (pts.length === 0) return;
  if (t.resaltador) ctx.globalAlpha = OPACIDAD_RESALTADOR;

  if (pts.length === 1 || (pts.length === 2 && pts[0]!.x === pts[1]!.x && pts[0]!.y === pts[1]!.y)) {
    ctx.beginPath();
    ctx.arc(pts[0]!.x, pts[0]!.y, base / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const presiones: number[] = [];
  for (let i = 2; i < t.puntos.length; i += 3) presiones.push(t.puntos[i]!);
  const variable = !t.resaltador && presiones.some((p) => Math.abs(p - presiones[0]!) > 0.02);

  if (!variable) {
    ctx.lineWidth = t.resaltador ? base : base * factorPresion(presiones[0] ?? 0.5);
    ctx.beginPath();
    trazarSuave(ctx, pts);
    ctx.stroke();
    return;
  }
  // Presión variable: un tramo por segmento, con el grosor del punto medio.
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const p = ((presiones[i] ?? 0.5) + (presiones[i + 1] ?? 0.5)) / 2;
    ctx.lineWidth = Math.max(base * factorPresion(p), 1 / op.escala);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

/** Curva cuadrática por los puntos medios: suave y barata. */
function trazarSuave(ctx: CanvasRenderingContext2D, pts: readonly { x: number; y: number }[]): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const q = pts[i + 1]!;
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  const ult = pts[pts.length - 1]!;
  ctx.lineTo(ult.x, ult.y);
}

/** Grilla en metros: una línea por metro, más marcada cada 5 m; se omite si quedaría muy densa. */
export function dibujarGrilla(
  ctx: CanvasRenderingContext2D,
  c: Camara,
  v: Vista,
  colores: { grilla: string; fuerte: string },
): void {
  if (c.escala < 12) return;
  const vis = cajaVisible(c, v);
  const linea = (x0: number, y0: number, x1: number, y1: number, col: string, ancho: number) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = ancho;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };
  for (let x = Math.floor(vis.x0); x <= Math.ceil(vis.x1); x++) {
    const px = v.ancho / 2 + (x - c.cx) * c.escala;
    linea(px, 0, px, v.alto, x % 5 === 0 ? colores.fuerte : colores.grilla, x === 0 ? 2 : 1);
  }
  for (let y = Math.floor(vis.y0); y <= Math.ceil(vis.y1); y++) {
    const py = v.alto / 2 - (y - c.cy) * c.escala;
    linea(0, py, v.ancho, py, y % 5 === 0 ? colores.fuerte : colores.grilla, y === 0 ? 2 : 1);
  }
}
