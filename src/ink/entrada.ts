import type { Camara, Punto, Vista } from '../core/camara';
import { acercarEn, desplazar, pantallaAMundo } from '../core/camara';
import type { ColorTinta, Elemento } from '../core/elementos';
import { cajaCacheada, nuevoIdElemento, tocaElemento, trasladar } from '../core/elementos';
import type { LotePayload } from '../core/escena';
import type { Paso, Union } from '../core/elementos';
import type { RegionPaso } from '../grafo/conectar';
import { pasoAlSalir } from '../grafo/conectar';
import type { NombreAsa } from '../physics/edicion';
import { ajustarAngulo, asasDe, moverAsa } from '../physics/edicion';
import type { TipoObjeto } from '../physics/objetos';
import { ALTO_BLOQUE, ANCHO_BLOQUE, crearBloque, crearCuerda, crearEsfera, crearPolea, crearResorte, crearSuperficie, RADIO_ESFERA, RADIO_POLEA } from '../physics/objetos';
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
  tipoObjeto(): TipoObjeto;
  /** Apoya un cuerpo suelto sobre la superficie que tenga cerca (y lo devuelve igual si no hay). */
  acomodar(e: Elemento): Elemento;
  refActual(): string | null;
  /** Selección (edición). */
  seleccion(): readonly Elemento[];
  seleccionar(ids: readonly string[]): void;
  /** Aplica varios cambios como una sola operación (un deshacer los revierte juntos). */
  editar(cambio: LotePayload): void;
  /** Imán para el extremo de una cuerda o un resorte en `p`: dónde se pegaría y a qué (o null). */
  iman(p: Punto, excluir?: ReadonlySet<string>): { p: Punto; union: Union } | null;
  /** Polea (o borde de superficie) que el gesto de una cuerda envuelve si pasa por `p`. */
  regionPaso(p: Punto): RegionPaso | null;
  /** Dónde está el puntero mientras se conecta (para resaltar puertos e imanes); null al terminar. */
  apuntar(p: Punto | null): void;
  /**
   * Un toque (sin arrastrar) con la herramienta Cuerda o Resorte: conexión **toque a toque** (primer extremo, poleas
   * por las que pasa, último extremo). Más fácil que el gesto continuo con el dedo.
   */
  toqueConexion(p: Punto): void;
  /** Se empezó a arrastrar con Cuerda o Resorte: se abandona la conexión toque a toque que hubiera. */
  cancelarToques(): void;
  /** El tipo del último puntero que tocó el lienzo (el imán es más grande para el dedo). */
  tipoPuntero(t: string): void;
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
  /** Cuerda o resorte en construcción (Fase 2): extremo inicial ya unido y poleas que el gesto fue envolviendo. */
  conexion?: {
    inicio: { p: Punto; union: Union };
    pasos: Paso[];
    dentro: { region: RegionPaso; entrada: Punto; ignorar: boolean } | null;
    ultimo: Punto;
  };
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

    this.host.tipoPuntero(e.pointerType);
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
    if (herramienta === 'objeto' && this.conecta()) {
      const region = this.host.regionPaso(w);
      this.activo.conexion = {
        inicio: this.host.iman(w) ?? { p: w, union: { fijo: true } },
        pasos: [],
        // Si el gesto empieza sobre una polea, salir de ella no cuenta como envolverla.
        dentro: region ? { region, entrada: w, ignorar: true } : null,
        ultimo: w,
      };
      this.host.apuntar(w);
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
    if (!a && this.host.herramienta() === 'objeto' && this.conecta()) this.host.apuntar(this.mundo(p));
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
      if (a.conexion) this.seguirConexion(a, w);
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
      case 'objeto': {
        let b = this.mundo(a.ultimaPantalla);
        if (shift) b = ajustarAngulo(a.inicio, b);
        // Cuerda y resorte: solo con arrastre (un toque suelto no crea nada: es la conexión toque a toque).
        a.vivo = a.conexion ? this.vivoConexion(a, b) : this.crearObjeto(this.host.tipoObjeto(), a.inicio, b, a.idVivo);
        if (a.conexion && a.vivo) this.host.cancelarToques();
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
    if (a.conexion) this.host.apuntar(null);
    if (a.conexion && !a.vivo) {
      this.host.toqueConexion(a.inicio);
      this.host.previsualizar(null, VACIO);
      return;
    }
    // Primero se confirma y después se retira la vista previa: así quien mira por la red
    // recibe el elemento definitivo antes de que desaparezca el trazo en construcción.
    if (a.herramienta === 'borrador') {
      if (a.ocultos.size > 0) this.host.borrar([...a.ocultos]);
    } else if (a.vivo && formaValida(a.vivo)) {
      this.host.confirmar(a.herramienta === 'objeto' ? this.host.acomodar(a.vivo) : a.vivo);
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
      let q = w;
      const extremo = (r.original.tipo === 'cuerda' || r.original.tipo === 'resorte') && (r.asa === 'a' || r.asa === 'b');
      if (extremo) {
        this.host.apuntar(w);
        q = this.host.iman(w, new Set([r.original.id]))?.p ?? w;
      }
      a.vivos = [moverAsa(r.original, r.asa, q, shift && !extremo)];
      a.ocultos = new Set([r.original.id]);
    }
    this.host.previsualizar(a.vivos, a.ocultos);
  }

  private terminarSeleccion(a: Activo): void {
    if (a.arrastre?.tipo === 'asa') this.host.apuntar(null);
    if (a.movido && a.vivos.length > 0) this.host.editar({ actualizar: a.vivos.map((v) => this.host.acomodar(v)) });
    this.host.previsualizar(null, VACIO);
  }

  private aPantalla(w: Punto): Punto {
    const c = this.host.camara();
    const v = this.host.vista();
    return { x: v.ancho / 2 + (w.x - c.cx) * c.escala, y: v.alto / 2 - (w.y - c.cy) * c.escala };
  }

  /**
   * Objeto físico según la herramienta. Bloque, esfera y polea son **piezas de tamaño fijo**: aparecen donde está
   * el puntero y arrastrar las lleva (el tamaño se cambia en su panel). Superficie, plano, cuerda y resorte se
   * dibujan de un extremo al otro.
   */
  private crearObjeto(tipo: TipoObjeto, a: Punto, b: Punto, id: string): Elemento {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const arrastro = dist > 0.12;
    switch (tipo) {
      case 'bloque':
        return crearBloque(b, ANCHO_BLOQUE, ALTO_BLOQUE, { id });
      case 'esfera':
        return crearEsfera(b, RADIO_ESFERA, { id });
      case 'polea':
        return crearPolea(b, RADIO_POLEA, { id });
      case 'superficie':
        return arrastro ? crearSuperficie(a, b, { id }) : crearSuperficie({ x: a.x - 1.5, y: a.y }, { x: a.x + 1.5, y: a.y }, { id });
      case 'plano':
        return arrastro
          ? crearSuperficie(a, b, { id, relleno: 'cuna' })
          : crearSuperficie({ x: a.x - 1.5, y: a.y - 0.87 }, { x: a.x + 1.5, y: a.y + 0.87 }, { id, relleno: 'cuna' });
      case 'cuerda':
        return arrastro ? crearCuerda(a, b, { id }) : crearCuerda({ x: a.x - 1, y: a.y }, { x: a.x + 1, y: a.y }, { id });
      case 'resorte':
        return arrastro ? crearResorte(a, b, { id }) : crearResorte({ x: a.x - 1, y: a.y }, { x: a.x + 1, y: a.y }, { id });
    }
  }

  /** ¿La herramienta activa es la de conectar (cuerda o resorte)? */
  private conecta(): boolean {
    const t = this.host.tipoObjeto();
    return t === 'cuerda' || t === 'resorte';
  }

  /** Lleva la cuenta de las poleas (y bordes) que el gesto de una cuerda va envolviendo. */
  private seguirConexion(a: Activo, w: Punto): void {
    const c = a.conexion!;
    this.host.apuntar(w);
    if (this.host.tipoObjeto() !== 'cuerda') return;
    const reg = this.host.regionPaso(w);
    const misma = (x: RegionPaso | null, y: RegionPaso): boolean => !!x && x.el === y.el && x.extremo === y.extremo;
    if (c.dentro && !misma(reg, c.dentro.region)) {
      if (!c.dentro.ignorar) {
        const paso = pasoAlSalir(c.dentro.region, c.dentro.entrada, w);
        const ultimo = c.pasos.at(-1);
        if (!ultimo || ultimo.el !== paso.el) c.pasos.push(paso);
      }
      c.dentro = null;
    }
    if (!c.dentro && reg) c.dentro = { region: reg, entrada: c.ultimo, ignorar: false };
    c.ultimo = w;
  }

  /** La cuerda o el resorte del gesto, con sus extremos pegados a los imanes; null si casi no se arrastró (un clic). */
  private vivoConexion(a: Activo, b: Punto): Elemento | null {
    const c = a.conexion!;
    const p0 = this.aPantalla(a.inicio);
    const p1 = this.aPantalla(b);
    if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 8) return null;
    const fin = this.host.iman(b) ?? { p: b, union: { fijo: true } as Union };
    const union: [Union, Union] = [c.inicio.union, fin.union];
    if (this.host.tipoObjeto() === 'resorte') return crearResorte(c.inicio.p, fin.p, { id: a.idVivo, union });
    return crearCuerda(c.inicio.p, fin.p, { id: a.idVivo, union, ...(c.pasos.length > 0 ? { ruta: [...c.pasos] } : {}) });
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
