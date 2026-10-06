import type { Camara, Punto, Vista } from '../core/camara';
import { arcoDe, muestrasTramo } from '../physics/curvas';
import { pantallaAMundo } from '../core/camara';
import { colorDeElemento } from '../core/colores';
import type { Bloque, Caja2D, Ejes, Elemento, Esfera, Imagen, Polea, Resorte, Superficie, Trazo, Vector } from '../core/elementos';
import { ASCENSO, cajaCacheada, cajasSeCruzan, esquinasBloque, extremosEjes, geometriaPunta, INTERLINEADO, lineasDe, puntosDe } from '../core/elementos';
import { achurado, etiquetaRoce, puntosResorte, trianguloCuna } from '../physics/objetos';
import type { AnclaEtiqueta } from '../physics/vectores';
import { dibujarMat, componerLinea } from '../core/matematica';
import { anclarCaja, anclaEtiquetaVector, anclasEjes, arcoAngulo, geometriaComponentes } from '../physics/vectores';
import type { PaletaTema } from '../ui/tokens';
import { TIPOGRAFIA } from '../ui/tokens';
import { factorPresion } from './herramientas';

/** Opacidad del resaltador (se superpone sin tapar el texto de abajo). */
export const OPACIDAD_RESALTADOR = 0.5;
/** Sobre fondo oscuro el fluorescente se apaga: se compensa con más opacidad. */
export function opacidadResaltador(paleta: PaletaTema): number {
  return paleta.nombre === 'oscuro' ? 0.75 : OPACIDAD_RESALTADOR;
}

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
  /** Busca unos ejes por id (sistema de referencia de un vector). */
  ejesDe?: (id: string) => Ejes | null;
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
  const indice = op.ejesDe ? null : new Map(elementos.filter((e): e is Ejes => e.tipo === 'ejes').map((e) => [e.id, e]));
  const conEjes: OpcionesDibujo = indice ? { ...op, ejesDe: (id) => indice.get(id) ?? null } : op;
  for (const e of elementos) {
    if (op.ocultos?.has(e.id)) continue;
    if (visible && !cajasSeCruzan(cajaCacheada(e), visible)) continue;
    dibujarElemento(ctx, e, conEjes);
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
    const col = colorDeElemento(op.paleta, e);
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
      // Texto y matemática ($...$) con las mismas medidas en pantalla, PNG y SVG.
      lineasDe(e).forEach((linea, i) => {
        dibujarMat(ctx, componerLinea(linea), e.pos.x, e.pos.y - e.tam * (ASCENSO + i * INTERLINEADO), e.tam, TIPOGRAFIA.texto);
      });
      break;
    }
    case 'vector':
      dibujarVector(ctx, e, op);
      break;
    case 'ejes':
      dibujarEjes(ctx, e, op);
      break;
    case 'bloque':
      dibujarBloque(ctx, e, op);
      break;
    case 'esfera':
      dibujarEsfera(ctx, e, op);
      break;
    case 'superficie':
      dibujarSuperficie(ctx, e, op);
      break;
    case 'polea':
      dibujarPolea(ctx, e, op);
      break;
    case 'cuerda':
      ctx.lineWidth = Math.max(e.grosor, 1 / op.escala);
      ctx.beginPath();
      if (e.camino) {
        // Rectas tangentes y arcos de contacto con las poleas (la escena resuelta trae el camino).
        let fin: { x: number; y: number } | null = null;
        for (const t of e.camino) {
          if (t.k === 'recta') {
            if (!fin || Math.hypot(fin.x - t.a.x, fin.y - t.a.y) > 1e-9) ctx.moveTo(t.a.x, t.a.y);
            ctx.lineTo(t.b.x, t.b.y);
            fin = t.b;
          } else {
            // Ángulos del mundo (y hacia arriba): un barrido positivo es creciente, es decir, "no antihorario" para el canvas.
            ctx.arc(t.c.x, t.c.y, t.r, t.desde, t.desde + t.barrido, t.barrido < 0);
            fin = { x: t.c.x + t.r * Math.cos(t.desde + t.barrido), y: t.c.y + t.r * Math.sin(t.desde + t.barrido) };
          }
        }
      } else {
        ctx.moveTo(e.a.x, e.a.y);
        ctx.lineTo(e.b.x, e.b.y);
      }
      ctx.stroke();
      break;
    case 'resorte':
      dibujarResorte(ctx, e, op);
      break;
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
  if (t.resaltador) ctx.globalAlpha = opacidadResaltador(op.paleta);

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

const FLECHA_MIN = 1e-4;

function flecha(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }, grosor: number, op: OpcionesDibujo): void {
  if (Math.hypot(b.x - a.x, b.y - a.y) < FLECHA_MIN) return;
  const g = geometriaPunta({ a, b, grosor });
  ctx.lineWidth = Math.max(grosor, 1 / op.escala);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(g.base.x, g.base.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(g.cola.x, g.cola.y);
  ctx.lineTo(g.izq.x, g.izq.y);
  ctx.lineTo(g.der.x, g.der.y);
  ctx.closePath();
  ctx.fill();
}

function etiqueta(ctx: CanvasRenderingContext2D, a: AnclaEtiqueta | null): void {
  if (a) dibujarMat(ctx, a.caja, a.origen.x, a.origen.y, a.tam, TIPOGRAFIA.texto);
}

function dibujarVector(ctx: CanvasRenderingContext2D, v: Vector, op: OpcionesDibujo): void {
  const ejes = v.ref ? (op.ejesDe?.(v.ref) ?? null) : null;
  if (v.fantasma) {
    ctx.globalAlpha = 0.65;
    ctx.setLineDash([0.1, 0.07]);
  }
  if (v.componentes && !v.fantasma) {
    const c = geometriaComponentes(v, ejes);
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = Math.max(v.grosor * 0.5, 1 / op.escala);
    ctx.setLineDash([0.04, 0.06]);
    for (const p of [c.d.puntaX, c.d.puntaY]) {
      ctx.beginPath();
      ctx.moveTo(v.b.x, v.b.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([0.12, 0.06]);
    flecha(ctx, v.a, c.d.puntaX, v.grosor * 0.7, op);
    flecha(ctx, v.a, c.d.puntaY, v.grosor * 0.7, op);
    ctx.restore();
    etiqueta(ctx, c.etiquetaX);
    etiqueta(ctx, c.etiquetaY);
  }
  if (v.halo && !v.fantasma) {
    // Contorno del color del fondo, de grosor fijo y con la misma forma: la flecha se distingue sobre cuerdas,
    // bloques o planos que tenga detrás, sin tapar más de lo necesario.
    const borde = 3 / op.escala;
    const g = geometriaPunta(v);
    ctx.save();
    ctx.strokeStyle = op.paleta.fondo;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(v.grosor, 1 / op.escala) + 2 * borde;
    ctx.beginPath();
    ctx.moveTo(v.a.x, v.a.y);
    ctx.lineTo(g.base.x, g.base.y);
    ctx.stroke();
    ctx.lineWidth = 2 * borde;
    ctx.beginPath();
    ctx.moveTo(g.cola.x, g.cola.y);
    ctx.lineTo(g.izq.x, g.izq.y);
    ctx.lineTo(g.der.x, g.der.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  flecha(ctx, v.a, v.b, v.grosor, op);
  ctx.setLineDash([]);
  if (v.angulo && !v.fantasma) {
    const arco = arcoAngulo(v, ejes);
    if (arco) {
      ctx.lineWidth = Math.max(v.grosor * 0.5, 1 / op.escala);
      ctx.beginPath();
      ctx.arc(arco.centro.x, arco.centro.y, arco.radio, arco.desde, arco.hasta, arco.hasta < arco.desde);
      ctx.stroke();
      etiqueta(ctx, arco.etiqueta);
    }
  }
  const ancla = anclaEtiquetaVector(v);
  if (ancla && v.halo) {
    // Fondo suave detrás de la etiqueta (el valor cambia en vivo y puede caer sobre otra cosa).
    const w = ancla.caja.ancho * ancla.tam;
    const arriba = ancla.caja.ascenso * ancla.tam;
    const abajo = ancla.caja.descenso * ancla.tam;
    const m = 0.03;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = op.paleta.fondo;
    ctx.fillRect(ancla.origen.x - m, ancla.origen.y - abajo - m, w + 2 * m, arriba + abajo + 2 * m);
    ctx.restore();
  }
  etiqueta(ctx, ancla);
}

function dibujarEjes(ctx: CanvasRenderingContext2D, e: Ejes, op: OpcionesDibujo): void {
  const [x, y] = extremosEjes(e);
  ctx.lineWidth = Math.max(e.grosor, 1 / op.escala);
  for (const eje of [x, y]) {
    const g = geometriaPunta({ a: eje.neg, b: eje.pos, grosor: e.grosor });
    ctx.beginPath();
    ctx.moveTo(eje.neg.x, eje.neg.y);
    ctx.lineTo(g.base.x, g.base.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(g.cola.x, g.cola.y);
    ctx.lineTo(g.izq.x, g.izq.y);
    ctx.lineTo(g.der.x, g.der.y);
    ctx.closePath();
    ctx.fill();
  }
  const a = anclasEjes(e);
  etiqueta(ctx, a.x);
  etiqueta(ctx, a.y);
}

// --- Objetos físicos ---------------------------------------------------------------------------------

const GROSOR_CONTORNO = 0.025;

function rellenoCuerpo(ctx: CanvasRenderingContext2D, op: OpcionesDibujo, texto: string): void {
  ctx.fillStyle = op.paleta.cuerpo;
  ctx.fill();
  ctx.strokeStyle = op.paleta.cuerpoBorde;
  ctx.lineWidth = Math.max(GROSOR_CONTORNO, 1.5 / op.escala);
  ctx.stroke();
  ctx.fillStyle = texto;
}

function dibujarBloque(ctx: CanvasRenderingContext2D, b: Bloque, op: OpcionesDibujo): void {
  const texto = ctx.fillStyle as string;
  const [p0, ...resto] = esquinasBloque(b);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  for (const p of resto) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  rellenoCuerpo(ctx, op, texto);
  if (b.etiqueta.trim() !== '') etiqueta(ctx, anclarCaja(b.etiqueta, b.centro));
}

function dibujarEsfera(ctx: CanvasRenderingContext2D, e: Esfera, op: OpcionesDibujo): void {
  const texto = ctx.fillStyle as string;
  ctx.beginPath();
  ctx.arc(e.centro.x, e.centro.y, e.radio, 0, Math.PI * 2);
  rellenoCuerpo(ctx, op, texto);
  if (e.gira) radioGiro(ctx, e.centro, e.radio, e.giro ?? 0, op);
  if (e.etiqueta.trim() !== '') etiqueta(ctx, anclarCaja(e.etiqueta, e.centro));
}

/** Un radio marcado (de 0,45 r a r) que deja ver cuánto gira un cuerpo redondo; parte hacia arriba. */
function radioGiro(ctx: CanvasRenderingContext2D, c: Punto, r: number, giro: number, op: OpcionesDibujo): void {
  const u = { x: -Math.sin(giro), y: Math.cos(giro) };
  ctx.save();
  ctx.lineWidth = Math.max(r * 0.09, 1.5 / op.escala);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(c.x + u.x * r * 0.45, c.y + u.y * r * 0.45);
  ctx.lineTo(c.x + u.x * r * 0.95, c.y + u.y * r * 0.95);
  ctx.stroke();
  ctx.restore();
}

function dibujarSuperficie(ctx: CanvasRenderingContext2D, s: Superficie, op: OpcionesDibujo): void {
  const roce = etiquetaRoce(s);
  if (roce) etiqueta(ctx, anclarCaja(roce.fuente, roce.centro, 0.17));
  const curva = arcoDe(s) !== null;
  if (s.relleno === 'cuna' && !curva) {
    const [a, b, c] = trianguloCuna(s);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = op.paleta.cuerpo;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = Math.max(s.grosor * 0.6, 1 / op.escala);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(a.x, a.y);
    ctx.stroke();
  } else if (s.relleno === 'achurado' || (s.relleno === 'cuna' && curva)) {
    ctx.lineWidth = Math.max(s.grosor * 0.5, 1 / op.escala);
    ctx.beginPath();
    for (const [d, h] of achurado(s)) {
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(h.x, h.y);
    }
    ctx.stroke();
  }
  ctx.lineWidth = Math.max(s.grosor, 1.5 / op.escala);
  ctx.beginPath();
  const pts = muestrasTramo(s);
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (const q of pts.slice(1)) ctx.lineTo(q.x, q.y);
  ctx.stroke();
}

function dibujarPolea(ctx: CanvasRenderingContext2D, p: Polea, op: OpcionesDibujo): void {
  const texto = ctx.fillStyle as string;
  if (p.soporte) {
    // Polea móvil: la horquilla que la une al cuerpo (debajo de la polea).
    ctx.lineWidth = Math.max(p.grosor * 1.4, 1 / op.escala);
    ctx.beginPath();
    ctx.moveTo(p.centro.x, p.centro.y);
    ctx.lineTo(p.soporte.x, p.soporte.y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(p.centro.x, p.centro.y, p.radio, 0, Math.PI * 2);
  rellenoCuerpo(ctx, op, texto);
  ctx.lineWidth = Math.max(p.grosor * 0.6, 1 / op.escala);
  ctx.beginPath();
  ctx.arc(p.centro.x, p.centro.y, p.radio * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.centro.x, p.centro.y, Math.max(p.radio * 0.1, 0.02), 0, Math.PI * 2);
  ctx.fill();
  if (p.masa && p.masa > 0) radioGiro(ctx, p.centro, p.radio * 0.72, p.giro ?? 0, op);
}

function dibujarResorte(ctx: CanvasRenderingContext2D, r: Resorte, op: OpcionesDibujo): void {
  ctx.lineWidth = Math.max(r.grosor, 1 / op.escala);
  const pts = puntosResorte(r);
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
}
