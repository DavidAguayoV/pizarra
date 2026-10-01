import type { Camara, Vista } from '../core/camara';
import { camaraInicial } from '../core/camara';
import { temaActual } from '../core/tema';
import type { Elemento } from '../core/elementos';
import { aplicarCamara, CacheImagenes, cajaVisible, dibujarElemento, dibujarElementos, dibujarGrilla } from '../ink/dibujo';
import { PALETAS } from './tokens';

export interface OpcionesLienzo {
  /** Se llama después de cada cuadro (para refrescar barras y contadores). */
  alCuadro?: () => void;
  /** Se llama cuando cambia el tamaño del lienzo (giro del celular, ventana). */
  alTamano?: () => void;
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

  private vivo: Elemento | null = null;
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
  fijarVivo(vivo: Elemento | null, ocultos: ReadonlySet<string>): void {
    const cambioOcultos = ocultos.size !== this.ocultos.size;
    this.vivo = vivo;
    this.ocultos = ocultos;
    if (cambioOcultos) this.baseSucia = true;
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
    if (this.vivo) {
      aplicarCamara(this.ctx, this.camara, vista, this.dpr);
      dibujarElemento(this.ctx, this.vivo, opciones);
    }
    this.canvas.dataset['escala'] = this.camara.escala.toFixed(1); // ayuda a las pruebas y a depurar
    this.opciones.alCuadro?.();
  }
}
