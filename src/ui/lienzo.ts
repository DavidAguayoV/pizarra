import type { Camara, Vista } from '../core/camara';
import { camaraInicial } from '../core/camara';
import { temaActual } from '../core/tema';
import type { Ejes, Elemento } from '../core/elementos';
import { cajaDe } from '../core/elementos';
import { asasDe } from '../physics/edicion';
import { aplicarCamara, CacheImagenes, cajaVisible, dibujarElemento, dibujarElementos, dibujarGrilla } from '../ink/dibujo';
import type { Marca } from '../grafo/conectar';
import { PALETAS } from './tokens';

export interface OpcionesLienzo {
  /** Se llama después de cada cuadro (para refrescar barras y contadores). */
  alCuadro?: () => void;
  /** Se llama cuando cambia el tamaño del lienzo (giro del celular, ventana). */
  alTamano?: () => void;
  /** Marcas de las uniones de cuerdas y resortes (en píxeles de pantalla, encima de todo). */
  marcas?: () => readonly Marca[];
}

/**
 * Lienzo de la pizarra: cámara, caché de dibujo y elemento en construcción.
 * Lo usan el modo profesor y el modo espectador.
 *
 * Los elementos confirmados se pintan en un lienzo aparte que solo se rehace cuando
 * cambia la escena, la cámara, el tema o el tamaño. Mientras alguien traza, cada cuadro
 * copia ese lienzo y dibuja encima solo el elemento en construcción.
 */
export class Lienzo {
  camara: Camara = camaraInicial();
  ancho = 0;
  alto = 0;

  private vivos: readonly Elemento[] = [];
  private seleccion: readonly Elemento[] = [];
  private ocultos: ReadonlySet<string> = new Set();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base = document.createElement('canvas');
  private readonly ctxBase: CanvasRenderingContext2D;
  private baseSucia = true;
  private dpr = 1;
  private cuadroPendiente = false;
  private readonly imagenes = new CacheImagenes(() => this.invalidar());

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly elementos: () => readonly Elemento[],
    private readonly opciones: OpcionesLienzo = {},
  ) {
    const ctx = canvas.getContext('2d');
    const ctxBase = this.base.getContext('2d');
    if (!ctx || !ctxBase) throw new Error('Canvas 2D no disponible');
    this.ctx = ctx;
    this.ctxBase = ctxBase;
    new ResizeObserver(() => this.ajustarTamano()).observe(canvas);
    this.ajustarTamano();
  }

  get vista(): Vista {
    return { ancho: this.ancho, alto: this.alto };
  }

  /** Cambia la cámara (el usuario o el modo "seguir al profesor"). */
  ponerCamara(c: Camara): void {
    this.camara = c;
    this.invalidar();
  }

  /** La escena, el tema o las imágenes cambiaron: hay que rehacer el caché. */
  invalidar(): void {
    this.baseSucia = true;
    this.pedirCuadro();
  }

  /** Elemento en construcción (de este usuario o recibido por la red) y los ids que se están borrando. */
  fijarVivo(vivos: Elemento | readonly Elemento[] | null, ocultos: ReadonlySet<string>): void {
    const cambioOcultos = ocultos.size !== this.ocultos.size;
    this.vivos = vivos === null ? [] : Array.isArray(vivos) ? (vivos as readonly Elemento[]) : [vivos as Elemento];
    this.ocultos = ocultos;
    if (cambioOcultos) this.baseSucia = true;
    this.pedirCuadro();
  }

  /** Elementos seleccionados: se marcan con un recuadro y, si es uno solo, con sus asas. */
  fijarSeleccion(sel: readonly Elemento[]): void {
    this.seleccion = sel;
    this.pedirCuadro();
  }

  pedirCuadro(): void {
    if (this.cuadroPendiente) return;
    this.cuadroPendiente = true;
    requestAnimationFrame(() => {
      this.cuadroPendiente = false;
      this.pintar();
    });
  }

  private ajustarTamano(): void {
    this.dpr = window.devicePixelRatio || 1;
    this.ancho = this.canvas.clientWidth;
    this.alto = this.canvas.clientHeight;
    for (const c of [this.canvas, this.base]) {
      c.width = Math.max(1, Math.round(this.ancho * this.dpr));
      c.height = Math.max(1, Math.round(this.alto * this.dpr));
    }
    this.opciones.alTamano?.();
    this.invalidar();
  }

  /** Recuadro punteado y asas, en píxeles de pantalla (no escalan con el zoom). */
  private dibujarSeleccion(color: string): void {
    if (this.seleccion.length === 0) return;
    const c = this.ctx;
    const { camara, ancho, alto, dpr } = this;
    const aPantalla = (x: number, y: number) => ({ x: ancho / 2 + (x - camara.cx) * camara.escala, y: alto / 2 - (y - camara.cy) * camara.escala });
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 1.5;
    c.setLineDash([5, 4]);
    for (const e of this.seleccion) {
      const b = cajaDe(e);
      const p0 = aPantalla(b.x0, b.y1);
      const p1 = aPantalla(b.x1, b.y0);
      c.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    }
    c.setLineDash([]);
    const unico = this.seleccion.length === 1 ? this.seleccion[0] : undefined;
    for (const asa of unico ? asasDe(unico) : []) {
      const p = aPantalla(asa.p.x, asa.p.y);
      c.beginPath();
      c.arc(p.x, p.y, 6, 0, Math.PI * 2);
      c.fillStyle = '#fff';
      c.fill();
      c.stroke();
    }
  }

  /**
   * Uniones: punto relleno = unido a un objeto; triángulo = fijo en el espacio; círculo vacío = suelto.
   * Tamaño fijo en pantalla (no escala con el zoom), como las asas. Mientras se arrastra no se muestran.
   */
  private dibujarMarcas(color: string, contorno: string): void {
    const marcas = this.opciones.marcas?.() ?? [];
    if (marcas.length === 0) return;
    const c = this.ctx;
    const { camara, ancho, alto, dpr } = this;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.lineWidth = 1.5;
    for (const m of marcas) {
      const x = ancho / 2 + (m.p.x - camara.cx) * camara.escala;
      const y = alto / 2 - (m.p.y - camara.cy) * camara.escala;
      c.beginPath();
      switch (m.tipo) {
        case 'fijo':
          c.moveTo(x, y - 5);
          c.lineTo(x + 5, y + 4);
          c.lineTo(x - 5, y + 4);
          c.closePath();
          c.fillStyle = contorno;
          c.fill();
          break;
        case 'unido':
          c.arc(x, y, 4, 0, Math.PI * 2);
          c.fillStyle = color;
          c.fill();
          c.strokeStyle = contorno;
          c.stroke();
          break;
        case 'suelto':
          c.arc(x, y, 5, 0, Math.PI * 2);
          c.strokeStyle = color;
          c.stroke();
          break;
        case 'puerto':
          // Puertos disponibles cerca del puntero: discretos.
          c.arc(x, y, 3.5, 0, Math.PI * 2);
          c.globalAlpha = 0.55;
          c.strokeStyle = color;
          c.stroke();
          c.globalAlpha = 1;
          break;
        case 'iman':
          // El imán que se usará al soltar: anillo grande y punto.
          c.lineWidth = 2.5;
          c.arc(x, y, 11, 0, Math.PI * 2);
          c.strokeStyle = color;
          c.stroke();
          c.beginPath();
          c.arc(x, y, 3.5, 0, Math.PI * 2);
          c.fillStyle = color;
          c.fill();
          c.lineWidth = 1.5;
          break;
        case 'paso': {
          // La polea (o el borde) que la cuerda va a envolver: anillo punteado alrededor.
          const r = (m.r ?? 0) * camara.escala + 8;
          c.setLineDash([5, 4]);
          c.lineWidth = 2;
          c.arc(x, y, r, 0, Math.PI * 2);
          c.strokeStyle = color;
          c.stroke();
          c.setLineDash([]);
          c.lineWidth = 1.5;
          break;
        }
      }
    }
  }


  private pintar(): void {
    const paleta = PALETAS[temaActual()];
    const vista = this.vista;
    const opciones = { paleta, imagenes: this.imagenes, escala: this.camara.escala, ocultos: this.ocultos };
    if (this.baseSucia) {
      const b = this.ctxBase;
      b.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      b.fillStyle = paleta.fondo;
      b.fillRect(0, 0, this.ancho, this.alto);
      dibujarGrilla(b, this.camara, vista, { grilla: paleta.grilla, fuerte: paleta.grillaFuerte });
      aplicarCamara(b, this.camara, vista, this.dpr);
      dibujarElementos(b, this.elementos(), opciones, cajaVisible(this.camara, vista));
      this.baseSucia = false;
    }
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(this.base, 0, 0);
    if (this.vivos.length > 0) {
      const ejes = new Map(this.elementos().filter((e): e is Ejes => e.tipo === 'ejes').map((e) => [e.id, e]));
      const conEjes = { ...opciones, ejesDe: (id: string) => ejes.get(id) ?? null };
      aplicarCamara(this.ctx, this.camara, vista, this.dpr);
      for (const v of this.vivos) dibujarElemento(this.ctx, v, conEjes);
    }
    this.dibujarMarcas(paleta.activo, paleta.texto);
    this.dibujarSeleccion(paleta.activo);
    this.canvas.dataset['escala'] = this.camara.escala.toFixed(1); // ayuda a las pruebas y a depurar
    this.opciones.alCuadro?.();
  }
}
