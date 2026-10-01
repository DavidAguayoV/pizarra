import type { Camara, Punto, Vista } from '../core/camara';
import { acercarEn, desplazar, pantallaAMundo } from '../core/camara';
import type { ColorTinta, Elemento } from '../core/elementos';
import { cajaCacheada, nuevoIdElemento, tocaElemento, trasladar } from '../core/elementos';
import type { LotePayload } from '../core/escena';
import type { NombreAsa } from '../physics/edicion';
import { ajustarAngulo, asasDe, moverAsa } from '../physics/edicion';
import type { RolVector } from '../physics/vectores';
import { crearEjes, crearVector } from '../physics/vectores';
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
  /** Lo que se está dibujando o arrastrando y los ids que se están "borrando" u ocultando en vivo. */
  previsualizar(vivos: Elemento | readonly Elemento[] | null, ocultos: ReadonlySet<string>): void;
  confirmar(e: Elemento): void;
  borrar(ids: string[]): void;
  pedirTexto(p: Punto): void;
  /** Rol físico con el que se crean los vectores y sistema de referencia que se les asigna. */
  rolVector(): RolVector;
  refActual(): string | null;
  /** Selección (edición). */
  seleccion(): readonly Elemento[];
  seleccionar(ids: readonly string[]): void;
  /** Aplica varios cambios como una sola operación (un deshacer los revierte juntos). */
  editar(cambio: LotePayload): void;
}

/** Distancia (px de pantalla) a la que se agarra un asa o se acierta a un elemento. */
const RADIO_ASA_PX = 12;
const RADIO_CLIC_PX = 8;

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
  /** Selección: arrastre de elementos enteros o de un asa. */
  arrastre: { tipo: 'mover'; originales: readonly Elemento[] } | { tipo: 'asa'; original: Elemento; asa: NombreAsa } | null;
  movido: boolean;
  vivos: readonly Elemento[];
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
      arrastre: null,
      movido: false,
      vivos: [],
      idVivo: nuevoIdElemento(),
    };
    if (herramienta === 'seleccionar') {
      this.empezarSeleccion(this.activo, p, w, e.shiftKey);
      return;
    }
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
    if (a.herramienta === 'seleccionar') {
      this.arrastrarSeleccion(a, this.pantalla(e), e.shiftKey);
      return;
    }
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
    if (a.herramienta === 'seleccionar') {
      this.arrastrarSeleccion(a, this.pantalla(e), e.shiftKey);
      this.activo = null;
      this.terminarSeleccion(a);
      return;
    }
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
      case 'vector': {
        let b = this.mundo(a.ultimaPantalla);
        if (shift) b = ajustarAngulo(a.inicio, b);
        a.vivo = crearVector(this.host.rolVector(), a.inicio, b, { id: a.idVivo, ref: this.host.refActual() });
        break;
      }
      case 'ejes': {
        let b = this.mundo(a.ultimaPantalla);
        if (shift) b = ajustarAngulo(a.inicio, b);
        const dx = b.x - a.inicio.x;
        const dy = b.y - a.inicio.y;
        const largo = Math.hypot(dx, dy);
        // Un clic sin arrastrar coloca unos ejes horizontales de tamaño estándar.
        a.vivo =
          largo < 0.12
            ? crearEjes(a.inicio, 0, 1.5, { id: a.idVivo })
            : crearEjes(a.inicio, Math.round(Math.atan2(dy, dx) * 1e4) / 1e4, Math.round(largo * 1e4) / 1e4, { id: a.idVivo });
        break;
      }
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

  // --- Selección y edición ------------------------------------------------------------------

  private empezarSeleccion(a: Activo, p: Punto, w: Punto, shift: boolean): void {
    const sel = this.host.seleccion();
    const escala = this.host.camara().escala;
    const unico = sel.length === 1 ? sel[0] : undefined;
    if (unico) {
      // ¿Se agarró un asa del elemento seleccionado?
      for (const asa of asasDe(unico)) {
        const q = this.aPantalla(asa.p);
        if (Math.hypot(q.x - p.x, q.y - p.y) <= RADIO_ASA_PX) {
          a.arrastre = { tipo: 'asa', original: unico, asa: asa.nombre };
          return;
        }
      }
    }
    // Si no, ¿se tocó algún elemento? (el de más arriba)
    const radio = RADIO_CLIC_PX / escala;
    const elementos = this.host.elementos();
    let tocado: Elemento | undefined;
    for (let i = elementos.length - 1; i >= 0; i--) {
      const el = elementos[i]!;
      if (tocaElemento(el, w, radio)) {
        tocado = el;
        break;
      }
    }
    if (!tocado) {
      if (!shift) this.host.seleccionar([]);
      return;
    }
    const yaEsta = sel.some((x) => x.id === tocado!.id);
    if (shift) {
      this.host.seleccionar(yaEsta ? sel.filter((x) => x.id !== tocado!.id).map((x) => x.id) : [...sel.map((x) => x.id), tocado.id]);
      if (yaEsta) return;
    } else if (!yaEsta) {
      this.host.seleccionar([tocado.id]);
    }
    a.arrastre = { tipo: 'mover', originales: this.host.seleccion() };
  }

  private arrastrarSeleccion(a: Activo, p: Punto, shift: boolean): void {
    const r = a.arrastre;
    if (!r) return;
    a.ultimaPantalla = p;
    const w = this.mundo(p);
    if (!a.movido && Math.hypot(p.x - this.aPantalla(a.inicio).x, p.y - this.aPantalla(a.inicio).y) < DISTANCIA_MIN_PX * 2) return;
    a.movido = true;
    if (r.tipo === 'mover') {
      const dx = w.x - a.inicio.x;
      const dy = w.y - a.inicio.y;
      a.vivos = r.originales.map((o) => trasladar(o, dx, dy));
      a.ocultos = new Set(r.originales.map((o) => o.id));
    } else {
      a.vivos = [moverAsa(r.original, r.asa, w, shift)];
      a.ocultos = new Set([r.original.id]);
    }
    this.host.previsualizar(a.vivos, a.ocultos);
  }

  private terminarSeleccion(a: Activo): void {
    if (a.movido && a.vivos.length > 0) this.host.editar({ actualizar: [...a.vivos] });
    this.host.previsualizar(null, VACIO);
  }

  private aPantalla(w: Punto): Punto {
    const c = this.host.camara();
    const v = this.host.vista();
    return { x: v.ancho / 2 + (w.x - c.cx) * c.escala, y: v.alto / 2 - (w.y - c.cy) * c.escala };
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
