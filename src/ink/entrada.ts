import type { Camara, Punto, Vista } from '../core/camara';
import { acercarEn, desplazar, pantallaAMundo } from '../core/camara';
import type { ColorTinta, Elemento } from '../core/elementos';
import { cajaCacheada, nuevoIdElemento, tocaElemento } from '../core/elementos';
import type { Herramienta, TipoForma } from './herramientas';
import {
  crearForma,
  crearTrazo,
  formaValida,
  PRESION_NEUTRA,
  RADIO_BORRADOR_PX,
  restringir,
} from './herramientas';
import { RechazoPalma } from './rechazoPalma';

/** Lo que la entrada necesita de la aplicación (así se puede probar y reemplazar). */
export interface Anfitrion {
  camara(): Camara;
  ponerCamara(c: Camara): void;
  vista(): Vista;
  herramienta(): Herramienta;
  color(): ColorTinta;
  grosor(): number;
  tamTexto(): number;
  elementos(): readonly Elemento[];
  /** Elemento en construcción (null = nada) y los ids que el borrador está "borrando" en vivo. */
  previsualizar(vivo: Elemento | null, ocultos: ReadonlySet<string>): void;
  confirmar(e: Elemento): void;
  borrar(ids: string[]): void;
  pedirTexto(p: Punto): void;
}

const DISTANCIA_MIN_PX = 1.5;
const FORMAS: ReadonlySet<Herramienta> = new Set(['linea', 'flecha', 'rect', 'elipse']);
const VACIO: ReadonlySet<string> = new Set();

interface Activo {
  id: number;
  tipoPuntero: string;
  herramienta: Herramienta;
  /** Trazo: x, y, presión. */
  pts: number[];
  inicio: Punto;
  ultimaPantalla: Punto;
  ocultos: Set<string>;
  vivo: Elemento | null;
  /** Id del elemento en construcción: el mismo en la vista previa, en la transmisión y al confirmarlo. */
  idVivo: string;
}

/**
 * Entrada unificada con Pointer Events (mouse, lápiz y dedo):
 * - un puntero dibuja con la herramienta activa;
 * - dos dedos mueven y hacen zoom (y cancelan el trazo que se había empezado);
 * - rueda = zoom; botón central o barra espaciadora = mover la vista;
 * - rechazo de palma: con un lápiz cerca, los toques de dedo se ignoran;
 * - el botón borrador del lápiz borra mientras se mantiene apretado.
 */
export class Entrada {
  private readonly palma = new RechazoPalma();
  private readonly toques = new Map<number, Punto>();
  private gesto: { cx: number; cy: number; dist: number } | null = null;
  /** Tras un gesto de dos dedos, el dedo que queda no debe dibujar hasta que se levante. */
  private bloqueado = false;
  private activo: Activo | null = null;
  private mano: { id: number; ultimo: Punto } | null = null;
  private espacio = false;
  private textoPendiente: { id: number; p: Punto } | null = null;
  private readonly bajas: Array<() => void> = [];

  constructor(
    private readonly lienzo: HTMLCanvasElement,
    private readonly host: Anfitrion,
  ) {
    this.escuchar(lienzo, 'pointerdown', (e: PointerEvent) => this.alBajar(e));
    this.escuchar(lienzo, 'pointermove', (e: PointerEvent) => this.alMover(e));
    this.escuchar(lienzo, 'pointerup', (e: PointerEvent) => this.alSubir(e));
    this.escuchar(lienzo, 'pointercancel', (e: PointerEvent) => this.alCancelar(e));
    this.escuchar(lienzo, 'wheel', (e: WheelEvent) => this.alRueda(e), { passive: false });
    this.escuchar(lienzo, 'contextmenu', (e: Event) => e.preventDefault());
    this.escuchar(window, 'keydown', (e: KeyboardEvent) => {
      if (e.code === 'Space' && !esCampoDeTexto(e.target)) {
        this.espacio = true;
        e.preventDefault();
      }
    });
    this.escuchar(window, 'keyup', (e: KeyboardEvent) => {
      if (e.code === 'Space') this.espacio = false;
    });
  }

  destruir(): void {
    this.bajas.forEach((b) => b());
  }

  private escuchar<T extends Event>(
    el: EventTarget,
    tipo: string,
    fn: (e: T) => void,
    opciones?: AddEventListenerOptions,
  ): void {
    el.addEventListener(tipo, fn as EventListener, opciones);
    this.bajas.push(() => el.removeEventListener(tipo, fn as EventListener, opciones));
  }

  // --- Conversión de coordenadas -------------------------------------------

  private pantalla(e: { clientX: number; clientY: number }): Punto {
    const r = this.lienzo.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private mundo(p: Punto): Punto {
    return pantallaAMundo(this.host.camara(), this.host.vista(), p);
  }

  // --- Eventos de puntero ---------------------------------------------------

  private alBajar(e: PointerEvent): void {
    this.palma.registrar(e.pointerType, e.timeStamp);
    if (this.palma.ignorar(e.pointerType, e.timeStamp)) return;
    try {
      this.lienzo.setPointerCapture(e.pointerId);
    } catch {
      /* puntero sintético o ya liberado: se sigue sin captura */
    }
    const p = this.pantalla(e);

    if (e.pointerType === 'touch') {
      this.toques.set(e.pointerId, p);
      if (this.toques.size >= 2) {
        this.cancelarActivo();
        this.iniciarGesto();
        return;
      }
      if (this.bloqueado) return;
    }
    if (this.gesto) return;

    const usaMano = e.pointerType === 'mouse' && e.button === 1;
    if (usaMano || this.espacio || this.host.herramienta() === 'mano') {
      this.mano = { id: e.pointerId, ultimo: p };
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    let herramienta = this.host.herramienta();
    if (e.pointerType === 'pen' && (e.buttons & 32) !== 0) herramienta = 'borrador';
    const w = this.mundo(p);

    if (herramienta === 'texto') {
      // El editor se abre al soltar: si se abriera ahora, el foco por defecto del clic lo cerraría.
      this.textoPendiente = { id: e.pointerId, p: w };
      return;
    }
    this.activo = {
      id: e.pointerId,
      tipoPuntero: e.pointerType,
      herramienta,
      pts: [],
      inicio: w,
      ultimaPantalla: p,
      ocultos: new Set(),
      vivo: null,
      idVivo: nuevoIdElemento(),
    };
    this.agregarPunto(this.activo, e, p, w, true);
    this.actualizarVivo(this.activo, e.shiftKey);
  }

  private alMover(e: PointerEvent): void {
    this.palma.registrar(e.pointerType, e.timeStamp); // también el lápiz flotando
    // Un lápiz que aparece mientras un dedo dibujaba: era la palma.
    if (e.pointerType === 'pen' && this.activo?.tipoPuntero === 'touch') this.cancelarActivo();

    const p = this.pantalla(e);
    if (e.pointerType === 'touch' && this.toques.has(e.pointerId)) {
      this.toques.set(e.pointerId, p);
      if (this.gesto) {
        this.moverGesto();
        return;
      }
    }
    if (this.mano && this.mano.id === e.pointerId) {
      const c = desplazar(this.host.camara(), p.x - this.mano.ultimo.x, p.y - this.mano.ultimo.y);
      this.mano.ultimo = p;
      this.host.ponerCamara(c);
      return;
    }
    const a = this.activo;
    if (!a || a.id !== e.pointerId) return;
    const eventos = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ev of eventos.length > 0 ? eventos : [e]) {
      const pp = this.pantalla(ev);
      this.agregarPunto(a, ev, pp, this.mundo(pp), false);
    }
    this.actualizarVivo(a, e.shiftKey);
  }

  private alSubir(e: PointerEvent): void {
    this.soltarToque(e);
    if (this.mano?.id === e.pointerId) {
      this.mano = null;
      return;
    }
    if (this.textoPendiente?.id === e.pointerId) {
      const { p } = this.textoPendiente;
      this.textoPendiente = null;
      this.host.pedirTexto(p);
      return;
    }
    const a = this.activo;
    if (!a || a.id !== e.pointerId) return;
    this.actualizarVivo(a, e.shiftKey);
    this.activo = null;
    this.terminar(a);
  }

  private alCancelar(e: PointerEvent): void {
    this.soltarToque(e);
    if (this.mano?.id === e.pointerId) this.mano = null;
    if (this.textoPendiente?.id === e.pointerId) this.textoPendiente = null;
    if (this.activo?.id === e.pointerId) this.cancelarActivo();
  }

  private alRueda(e: WheelEvent): void {
    e.preventDefault();
    const p = this.pantalla(e);
    this.host.ponerCamara(acercarEn(this.host.camara(), this.host.vista(), p, Math.exp(-e.deltaY * 0.0015)));
  }

  // --- Gestos de dos dedos --------------------------------------------------

  private iniciarGesto(): void {
    this.gesto = this.medirToques();
    this.bloqueado = true;
  }

  private medirToques(): { cx: number; cy: number; dist: number } {
    const [a, b] = [...this.toques.values()] as [Punto, Punto];
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  }

  private moverGesto(): void {
    if (!this.gesto || this.toques.size < 2) return;
    const nuevo = this.medirToques();
    let c = desplazar(this.host.camara(), nuevo.cx - this.gesto.cx, nuevo.cy - this.gesto.cy);
    c = acercarEn(c, this.host.vista(), { x: nuevo.cx, y: nuevo.cy }, nuevo.dist / this.gesto.dist);
    this.gesto = nuevo;
    this.host.ponerCamara(c);
  }

  private soltarToque(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    this.toques.delete(e.pointerId);
    if (this.toques.size < 2) this.gesto = null;
    if (this.toques.size === 0) this.bloqueado = false;
  }

  // --- Trazos y formas ------------------------------------------------------

  private agregarPunto(a: Activo, e: PointerEvent, p: Punto, w: Punto, primero: boolean): void {
    if (a.herramienta === 'borrador') {
      this.borrarEn(a, w);
      a.ultimaPantalla = p;
      return;
    }
    if (a.herramienta !== 'lapiz' && a.herramienta !== 'resaltador') {
      a.ultimaPantalla = p; // formas: solo importa dónde está el puntero ahora
      return;
    }
    const lejos = Math.hypot(p.x - a.ultimaPantalla.x, p.y - a.ultimaPantalla.y) >= DISTANCIA_MIN_PX;
    if (!primero && !lejos) return;
    const presion = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : PRESION_NEUTRA;
    a.pts.push(w.x, w.y, presion);
    a.ultimaPantalla = p;
  }

  private borrarEn(a: Activo, w: Punto): void {
    const radio = RADIO_BORRADOR_PX / this.host.camara().escala;
    for (const el of this.host.elementos()) {
      if (a.ocultos.has(el.id)) continue;
      const c = cajaCacheada(el);
      if (w.x < c.x0 - radio || w.x > c.x1 + radio || w.y < c.y0 - radio || w.y > c.y1 + radio) continue;
      if (tocaElemento(el, w, radio)) a.ocultos.add(el.id);
    }
  }

  private actualizarVivo(a: Activo, shift: boolean): void {
    switch (a.herramienta) {
      case 'lapiz':
      case 'resaltador':
        a.vivo = crearTrazo(duplicarSiUno(a.pts), this.host.color(), this.host.grosor(), a.herramienta === 'resaltador', a.idVivo);
        break;
      case 'borrador':
        a.vivo = null;
        break;
      default: {
        if (!FORMAS.has(a.herramienta)) return;
        const tipo = a.herramienta as TipoForma;
        const fin = a.ultimaPantalla;
        let b = this.mundo(fin);
        if (shift) b = restringir(tipo, a.inicio, b);
        a.vivo = crearForma(tipo, a.inicio, b, this.host.color(), this.host.grosor(), a.idVivo);
      }
    }
    this.host.previsualizar(a.vivo, a.ocultos);
  }

  private terminar(a: Activo): void {
    // Primero se confirma y después se retira la vista previa: así quien mira por la red
    // recibe el elemento definitivo antes de que desaparezca el trazo en construcción.
    if (a.herramienta === 'borrador') {
      if (a.ocultos.size > 0) this.host.borrar([...a.ocultos]);
    } else if (a.vivo && formaValida(a.vivo)) {
      this.host.confirmar(a.vivo);
    }
    this.host.previsualizar(null, VACIO);
  }

  private cancelarActivo(): void {
    if (!this.activo) return;
    this.activo = null;
    this.host.previsualizar(null, VACIO);
  }
}

function duplicarSiUno(pts: number[]): number[] {
  return pts.length === 3 ? [...pts, ...pts] : pts;
}

export function esCampoDeTexto(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
}
