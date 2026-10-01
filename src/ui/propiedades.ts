import type { Bloque, Ejes, Elemento, Esfera, Cuerda, Polea, Resorte, Superficie, Vector } from '../core/elementos';
import { cajaDe, unirCajas } from '../core/elementos';
import type { LotePayload } from '../core/escena';
import { temaActual } from '../core/tema';
import { colorDeRol } from './tokens';
import { PALETAS } from './tokens';
import {
  aGrados,
  anguloRespecto,
  conValores,
  ESTILO_ROL,
  modulo,
  numeroEs,
  ROLES_VECTOR,
  sumar,
  vectorPorValores,
} from '../physics/vectores';
import type { RolVector } from '../physics/vectores';
import type { ModoRoce } from '../physics/dcl';
import { construirDcl, G_POR_DEFECTO, resolverDcl } from '../physics/dcl';
import type { TipoObjeto } from '../physics/objetos';
import { anguloSuperficie, elongacion, largoSegmento, NOMBRE_OBJETO, TIPOS_OBJETO } from '../physics/objetos';

/** Lo que el panel necesita de la aplicación. */
export interface AnfitrionPropiedades {
  elementos(): readonly Elemento[];
  seleccion(): readonly Elemento[];
  seleccionar(ids: readonly string[]): void;
  editar(cambio: LotePayload): void;
  herramienta(): string;
  rolVector(): RolVector;
  ponerRolVector(r: RolVector): void;
  tipoObjeto(): TipoObjeto;
  ponerTipoObjeto(t: TipoObjeto): void;
  /** Cambia cada vez que cambia la escena (para refrescar la vista previa del diagrama). */
  version(): number;
  refActual(): string | null;
  /** Centro de la vista, donde se coloca un vector creado por valores si no hay ejes. */
  centroVista(): { x: number; y: number };
  avisar(texto: string): void;
}

const aNumero = (t: string): number => Number(t.trim().replace(',', '.'));

function campo(etiqueta: string, input: HTMLElement): HTMLLabelElement {
  const l = document.createElement('label');
  l.className = 'campo';
  const t = document.createElement('span');
  t.textContent = etiqueta;
  l.append(t, input);
  return l;
}

function numerico(valor: number, paso: string, alCambiar: (v: number) => void, etiquetaAria: string): HTMLInputElement {
  const i = document.createElement('input');
  i.type = 'text';
  i.inputMode = 'decimal';
  i.value = numeroEs(valor);
  i.setAttribute('aria-label', etiquetaAria);
  i.dataset['paso'] = paso;
  i.addEventListener('change', () => {
    const v = aNumero(i.value);
    if (Number.isFinite(v)) alCambiar(v);
    else i.value = numeroEs(valor);
  });
  return i;
}

function texto(valor: string, alCambiar: (v: string) => void, etiquetaAria: string): HTMLInputElement {
  const i = document.createElement('input');
  i.type = 'text';
  i.value = valor;
  i.setAttribute('aria-label', etiquetaAria);
  i.addEventListener('change', () => alCambiar(i.value));
  return i;
}

function interruptor(etiqueta: string, valor: boolean, alCambiar: (v: boolean) => void): HTMLLabelElement {
  const l = document.createElement('label');
  l.className = 'interruptor';
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.checked = valor;
  c.addEventListener('change', () => alCambiar(c.checked));
  l.append(c, ` ${etiqueta}`);
  return l;
}

function boton(t: string, titulo: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = t;
  b.title = titulo;
  b.addEventListener('click', onClick);
  return b;
}

export function nombreEjes(e: Ejes, todos: readonly Elemento[]): string {
  const lista = todos.filter((x): x is Ejes => x.tipo === 'ejes');
  const n = lista.findIndex((x) => x.id === e.id) + 1;
  return `Ejes ${n} (${e.etiquetaX}, ${e.etiquetaY}) ${numeroEs(aGrados(e.angulo))}°`;
}

/**
 * Panel de propiedades: edita el vector o los ejes seleccionados con números exactos,
 * suma vectores y permite crear un vector por su valor y su ángulo.
 */
export class PanelPropiedades {
  readonly elemento = document.createElement('section');
  private huella = '';

  constructor(private readonly host: AnfitrionPropiedades) {
    this.elemento.className = 'propiedades';
    this.elemento.setAttribute('aria-label', 'Propiedades');
  }

  /** Vuelve a dibujar el panel solo si cambió lo seleccionado, los ejes o la herramienta. */
  actualizar(): void {
    const sel = this.host.seleccion();
    const ejes = this.host.elementos().filter((e) => e.tipo === 'ejes');
    const huella = JSON.stringify([sel, ejes, this.host.herramienta(), this.host.rolVector(), this.host.tipoObjeto(), this.host.version()]);
    if (huella === this.huella) return;
    const ids = JSON.stringify(sel.map((e) => e.id));
    // Mientras se escribe en un campo de texto del panel no se le quita el foco; los
    // manejadores siempre parten del elemento actual, así que no se pierde ningún cambio.
    const activo = document.activeElement;
    const escribiendo = activo instanceof HTMLInputElement && activo.type === 'text' && this.elemento.contains(activo);
    if (escribiendo && ids === this.idsHuella && sel.length > 0) {
      this.refrescarPrevia();
      return;
    }
    this.huella = huella;
    this.idsHuella = ids;
    this.pintar(sel);
  }

  private idsHuella = '';

  private pintar(sel: readonly Elemento[]): void {
    const el = this.elemento;
    el.replaceChildren();
    const vectores = sel.filter((e): e is Vector => e.tipo === 'vector');
    const unico = sel.length === 1 ? sel[0] : undefined;

    if (unico?.tipo === 'vector') this.panelVector(unico);
    else if (unico?.tipo === 'ejes') this.panelEjes(unico);
    else if (unico?.tipo === 'bloque') this.panelBloque(unico);
    else if (unico?.tipo === 'esfera') this.panelEsfera(unico);
    else if (unico?.tipo === 'superficie') this.panelSuperficie(unico);
    else if (unico?.tipo === 'polea') this.panelPolea(unico);
    else if (unico?.tipo === 'cuerda') this.panelCuerda(unico);
    else if (unico?.tipo === 'resorte') this.panelResorte(unico);
    else if (vectores.length >= 2 && vectores.length === sel.length) this.panelSuma(vectores);
    else if (this.host.herramienta() === 'vector') this.panelCrear();
    else if (this.host.herramienta() === 'objeto') this.panelCrearObjeto();
    else {
      el.hidden = true;
      return;
    }
    el.hidden = false;
  }

  private titulo(t: string): void {
    const h = document.createElement('h2');
    h.textContent = t;
    this.elemento.append(h);
  }

  /** El vector tal como está ahora en la escena (los campos del panel pueden tener copias viejas). */
  private vectorActual(v: Vector): Vector {
    return (this.host.elementos().find((e): e is Vector => e.tipo === 'vector' && e.id === v.id) as Vector | undefined) ?? v;
  }

  private ejesActual(e: Ejes): Ejes {
    return (this.host.elementos().find((x): x is Ejes => x.tipo === 'ejes' && x.id === e.id) as Ejes | undefined) ?? e;
  }

  private ejesDe(v: Vector): Ejes | null {
    if (!v.ref) return null;
    return (this.host.elementos().find((e): e is Ejes => e.tipo === 'ejes' && e.id === v.ref) as Ejes | undefined) ?? null;
  }

  private panelVector(v0: Vector): void {
    const e = this.elemento;
    const ejesDe = (v: Vector) => this.ejesDe(v);
    /** Aplica un cambio sobre el vector VIGENTE (no sobre la copia con la que se pintó el panel). */
    const cambiar = (f: (v: Vector) => Vector) => this.host.editar({ actualizar: [f(this.vectorActual(v0))] });
    const v = v0;
    const ejes = ejesDe(v);
    this.titulo('Vector');

    const rol = document.createElement('select');
    rol.setAttribute('aria-label', 'Tipo de vector');
    for (const r of ROLES_VECTOR) rol.append(new Option(ESTILO_ROL[r].nombre, r, false, r === v.rol));
    rol.addEventListener('change', () =>
      cambiar((u) => {
        const nuevo = rol.value as RolVector;
        const viejo = ESTILO_ROL[u.rol as RolVector];
        const est = ESTILO_ROL[nuevo];
        // Si la etiqueta, la unidad y la escala eran las del tipo anterior, pasan a las del nuevo.
        const sigueEtiqueta = u.etiqueta === viejo.etiqueta;
        const sigueEscala = u.porMetro === viejo.porMetro && u.unidad === viejo.unidad;
        const base: Vector = {
          ...u,
          rol: nuevo,
          etiqueta: sigueEtiqueta ? est.etiqueta : u.etiqueta,
          unidad: sigueEscala ? est.unidad : u.unidad,
          porMetro: sigueEscala ? est.porMetro : u.porMetro,
        };
        // La flecha conserva su largo: cambia el valor físico si cambió la escala.
        return sigueEscala ? conValores(base, ejesDe(u), (modulo(u) / u.porMetro) * base.porMetro, aGrados(anguloRespecto(u, ejesDe(u)))) : base;
      }),
    );
    e.append(campo('Tipo', rol));

    e.append(campo('Etiqueta (LaTeX)', texto(v.etiqueta, (t) => cambiar((u) => ({ ...u, etiqueta: t })), 'Etiqueta del vector')));

    const ang = aGrados(anguloRespecto(v, ejes));
    const fila = document.createElement('div');
    fila.className = 'fila-campos';
    fila.append(
      campo(`Módulo (${v.unidad})`, numerico(modulo(v), '0.1', (x) => cambiar((u) => conValores(u, ejesDe(u), Math.max(0, x), aGrados(anguloRespecto(u, ejesDe(u))))), 'Módulo del vector')),
      campo('Ángulo (°)', numerico(ang, '1', (x) => cambiar((u) => conValores(u, ejesDe(u), modulo(u), x)), 'Ángulo del vector')),
    );
    e.append(fila);

    e.append(
      campo(
        `${v.unidad} por metro de flecha`,
        numerico(v.porMetro, '1', (x) => {
          if (x <= 0) return;
          cambiar((u) => conValores({ ...u, porMetro: x }, ejesDe(u), modulo(u), aGrados(anguloRespecto(u, ejesDe(u)))));
        }, 'Unidades por metro de flecha'),
      ),
    );

    const refs = document.createElement('select');
    refs.setAttribute('aria-label', 'Sistema de referencia');
    refs.append(new Option('Pizarra (horizontal y vertical)', '', false, v.ref === null));
    for (const x of this.host.elementos()) {
      if (x.tipo === 'ejes') refs.append(new Option(nombreEjes(x, this.host.elementos()), x.id, false, v.ref === x.id));
    }
    refs.addEventListener('change', () => cambiar((u) => ({ ...u, ref: refs.value === '' ? null : refs.value })));
    e.append(campo('Sistema de referencia', refs));

    e.append(
      interruptor('Mostrar valor en la etiqueta', v.mostrarValor, (c) => cambiar((u) => ({ ...u, mostrarValor: c }))),
      interruptor('Mostrar componentes', v.componentes, (c) => cambiar((u) => ({ ...u, componentes: c }))),
      interruptor('Marcar ángulo con el eje x', v.angulo, (c) => cambiar((u) => ({ ...u, angulo: c }))),
    );
    if (v.angulo) e.append(campo('Etiqueta del ángulo', texto(v.etiquetaAngulo, (t) => cambiar((u) => ({ ...u, etiquetaAngulo: t })), 'Etiqueta del ángulo')));
    e.append(boton('Borrar vector', 'Suprimir', () => this.host.editar({ borrar: [v.id] })));
  }

  private panelEjes(ej: Ejes): void {
    const e = this.elemento;
    const cambiar = (f: (x: Ejes) => Ejes) => this.host.editar({ actualizar: [f(this.ejesActual(ej))] });
    this.titulo('Sistema de referencia');
    const fila = document.createElement('div');
    fila.className = 'fila-campos';
    fila.append(
      campo('Eje horizontal', texto(ej.etiquetaX, (t) => cambiar((u) => ({ ...u, etiquetaX: t })), 'Etiqueta del eje x')),
      campo('Eje vertical', texto(ej.etiquetaY, (t) => cambiar((u) => ({ ...u, etiquetaY: t })), 'Etiqueta del eje y')),
    );
    e.append(fila);
    e.append(
      campo('Ángulo del eje x (°)', numerico(aGrados(ej.angulo), '1', (x) => cambiar((u) => ({ ...u, angulo: Math.round(((x * Math.PI) / 180) * 1e4) / 1e4 })), 'Ángulo de los ejes')),
      campo('Largo de cada eje (m)', numerico(ej.largo, '0.1', (x) => x > 0.2 && cambiar((u) => ({ ...u, largo: x })), 'Largo de los ejes')),
    );
    const p = document.createElement('p');
    p.className = 'nota';
    p.textContent = 'Arrastra el centro para mover y las puntas de los ejes para girar. Con Mayús el giro avanza de 15° en 15°.';
    e.append(p, boton('Borrar ejes', 'Suprimir', () => this.host.editar({ borrar: [ej.id] })));
  }

  // --- Cuerpos y objetos físicos --------------------------------------------------------------------

  /** Elemento vigente de la escena (los campos pueden tener copias viejas). */
  private vigente<T extends Elemento>(e: T): T {
    return (this.host.elementos().find((x) => x.id === e.id) as T | undefined) ?? e;
  }

  private panelCrearObjeto(): void {
    const e = this.elemento;
    this.titulo('Cuerpos y superficies');
    const sel = document.createElement('div');
    sel.className = 'roles';
    sel.setAttribute('role', 'group');
    sel.setAttribute('aria-label', 'Tipo de objeto nuevo');
    for (const t of TIPOS_OBJETO) {
      const b = boton(NOMBRE_OBJETO[t], NOMBRE_OBJETO[t], () => this.host.ponerTipoObjeto(t));
      b.className = 'rol-vector';
      b.style.setProperty('--rol', 'var(--pz-fam-neutro)');
      b.setAttribute('aria-pressed', String(t === this.host.tipoObjeto()));
      sel.append(b);
    }
    const nota = document.createElement('p');
    nota.className = 'nota';
    nota.textContent =
      'Un clic lo coloca con tamaño estándar; arrastrar lo dimensiona (cuerda, resorte y superficie: de un extremo al otro; con Mayús, de 15° en 15°). Los cuerpos se apoyan solos en la superficie que tengan cerca. Para el diagrama de cuerpo libre, selecciona el cuerpo.';
    e.append(sel, nota);
  }

  private panelBloque(b0: Bloque): void {
    const e = this.elemento;
    const cambiar = (f: (b: Bloque) => Bloque) => this.host.editar({ actualizar: [f(this.vigente(b0))] });
    this.titulo('Bloque');
    e.append(campo('Etiqueta (LaTeX)', texto(b0.etiqueta, (t) => cambiar((b) => ({ ...b, etiqueta: t })), 'Etiqueta del bloque')));
    e.append(campo('Masa (kg)', numerico(b0.masa, '0.1', (x) => x > 0 && cambiar((b) => ({ ...b, masa: x })), 'Masa del bloque')));
    const fila = document.createElement('div');
    fila.className = 'fila-campos';
    fila.append(
      campo('Ancho (m)', numerico(b0.ancho, '0.1', (x) => x >= 0.1 && cambiar((b) => ({ ...b, ancho: x })), 'Ancho del bloque')),
      campo('Alto (m)', numerico(b0.alto, '0.1', (x) => x >= 0.1 && cambiar((b) => ({ ...b, alto: x })), 'Alto del bloque')),
    );
    e.append(fila);
    e.append(campo('Ángulo (°)', numerico(aGrados(b0.angulo), '1', (x) => cambiar((b) => ({ ...b, angulo: Math.round(((x * Math.PI) / 180) * 1e4) / 1e4 })), 'Ángulo del bloque')));
    this.seccionDcl(b0);
    e.append(boton('Borrar bloque', 'Suprimir', () => this.host.editar({ borrar: [b0.id] })));
  }

  private panelEsfera(s0: Esfera): void {
    const e = this.elemento;
    const cambiar = (f: (s: Esfera) => Esfera) => this.host.editar({ actualizar: [f(this.vigente(s0))] });
    this.titulo('Esfera');
    e.append(campo('Etiqueta (LaTeX)', texto(s0.etiqueta, (t) => cambiar((s) => ({ ...s, etiqueta: t })), 'Etiqueta de la esfera')));
    e.append(
      campo('Masa (kg)', numerico(s0.masa, '0.1', (x) => x > 0 && cambiar((s) => ({ ...s, masa: x })), 'Masa de la esfera')),
      campo('Radio (m)', numerico(s0.radio, '0.05', (x) => x >= 0.1 && cambiar((s) => ({ ...s, radio: x })), 'Radio de la esfera')),
    );
    this.seccionDcl(s0);
    e.append(boton('Borrar esfera', 'Suprimir', () => this.host.editar({ borrar: [s0.id] })));
  }

  private panelSuperficie(s0: Superficie): void {
    const e = this.elemento;
    const cambiar = (f: (s: Superficie) => Superficie) => this.host.editar({ actualizar: [f(this.vigente(s0))] });
    this.titulo('Superficie');
    const fila = document.createElement('div');
    fila.className = 'fila-campos';
    fila.append(
      campo('μ estático', numerico(s0.muS, '0.05', (x) => x >= 0 && cambiar((s) => ({ ...s, muS: x })), 'Coeficiente de roce estático')),
      campo('μ cinético', numerico(s0.muK, '0.05', (x) => x >= 0 && cambiar((s) => ({ ...s, muK: x })), 'Coeficiente de roce cinético')),
    );
    e.append(fila);
    e.append(
      campo('Inclinación respecto del horizontal (°)', numerico(aGrados(anguloSuperficie(s0)), '1', (x) =>
        cambiar((s) => {
          const l = largoSegmento(s.a, s.b);
          const ang = (x * Math.PI) / 180;
          return { ...s, b: { x: Math.round((s.a.x + l * Math.cos(ang)) * 1e4) / 1e4, y: Math.round((s.a.y + l * Math.sin(ang)) * 1e4) / 1e4 } };
        }), 'Inclinación de la superficie')),
    );
    const rel = document.createElement('select');
    rel.setAttribute('aria-label', 'Relleno de la superficie');
    for (const [v, t] of [['achurado', 'Achurado'], ['cuna', 'Cuña (plano inclinado)'], ['ninguno', 'Sin relleno']] as const) rel.append(new Option(t, v, false, s0.relleno === v));
    rel.addEventListener('change', () => cambiar((s) => ({ ...s, relleno: rel.value as Superficie['relleno'] })));
    e.append(campo('Relleno', rel));
    const nota = document.createElement('p');
    nota.className = 'nota';
    nota.textContent = 'El lado sólido está a la derecha de a → b. Para pasarlo al otro lado, invierte la superficie.';
    e.append(nota, boton('Invertir lado', 'Intercambia los extremos', () => cambiar((s) => ({ ...s, a: s.b, b: s.a }))));
    e.append(boton('Borrar superficie', 'Suprimir', () => this.host.editar({ borrar: [s0.id] })));
  }

  private panelPolea(p0: Polea): void {
    const e = this.elemento;
    this.titulo('Polea ideal');
    e.append(campo('Radio (m)', numerico(p0.radio, '0.05', (x) => x >= 0.1 && this.host.editar({ actualizar: [{ ...this.vigente(p0), radio: x }] }), 'Radio de la polea')));
    const nota = document.createElement('p');
    nota.className = 'nota';
    nota.textContent = 'Sin masa ni roce: solo cambia la dirección de la cuerda. Dibuja una cuerda a cada lado (hasta el punto donde toca la polea).';
    e.append(nota, boton('Borrar polea', 'Suprimir', () => this.host.editar({ borrar: [p0.id] })));
  }

  private panelCuerda(c0: Cuerda): void {
    const e = this.elemento;
    this.titulo('Cuerda');
    e.append(
      campo('Largo (m)', numerico(largoSegmento(c0.a, c0.b), '0.1', (x) => {
        const c = this.vigente(c0);
        const l = largoSegmento(c.a, c.b) || 1;
        if (x < 0.1) return;
        this.host.editar({ actualizar: [{ ...c, b: { x: Math.round((c.a.x + ((c.b.x - c.a.x) / l) * x) * 1e4) / 1e4, y: Math.round((c.a.y + ((c.b.y - c.a.y) / l) * x) * 1e4) / 1e4 } }] });
      }, 'Largo de la cuerda')),
    );
    const nota = document.createElement('p');
    nota.className = 'nota';
    nota.textContent = 'Ideal: sin masa e inextensible. La tensión actúa sobre el cuerpo al que está atada, en la dirección de la cuerda.';
    e.append(nota, boton('Borrar cuerda', 'Suprimir', () => this.host.editar({ borrar: [c0.id] })));
  }

  private panelResorte(r0: Resorte): void {
    const e = this.elemento;
    const cambiar = (f: (r: Resorte) => Resorte) => this.host.editar({ actualizar: [f(this.vigente(r0))] });
    this.titulo('Resorte');
    const fila = document.createElement('div');
    fila.className = 'fila-campos';
    fila.append(
      campo('k (N/m)', numerico(r0.k, '10', (x) => x > 0 && cambiar((r) => ({ ...r, k: x })), 'Constante del resorte')),
      campo('Largo natural (m)', numerico(r0.largoNatural, '0.1', (x) => x > 0 && cambiar((r) => ({ ...r, largoNatural: x })), 'Largo natural del resorte')),
    );
    e.append(fila);
    e.append(campo('Espiras', numerico(r0.espiras, '1', (x) => x >= 2 && x <= 30 && cambiar((r) => ({ ...r, espiras: Math.round(x) })), 'Espiras del resorte')));
    const x = elongacion(r0);
    const p = document.createElement('p');
    p.className = 'nota';
    p.textContent = `Largo actual ${numeroEs(largoSegmento(r0.a, r0.b))} m · elongación ${numeroEs(x)} m · fuerza ${numeroEs(Math.abs(r0.k * x))} N ${Math.abs(x) < 1e-3 ? '' : x > 0 ? '(estirado)' : '(comprimido)'}`;
    e.append(p, boton('Largo natural = largo actual', 'Deja el resorte sin deformar', () => cambiar((r) => ({ ...r, largoNatural: Math.round(largoSegmento(r.a, r.b) * 1e4) / 1e4 }))));
    e.append(boton('Borrar resorte', 'Suprimir', () => this.host.editar({ borrar: [r0.id] })));
  }

  private previa: { el: HTMLElement; cuerpo: Bloque | Esfera } | null = null;

  /** Recalcula y muestra las fuerzas detectadas, la aceleración y los avisos del cuerpo seleccionado. */
  private refrescarPrevia(): void {
    const p = this.previa;
    if (!p || !p.el.isConnected) return;
    const cuerpo = this.vigente(p.cuerpo);
    const r = resolverDcl(cuerpo, this.host.elementos(), this.g, this.modoRoce);
    const lista = document.createElement('ul');
    lista.className = 'fuerzas';
    for (const f of r.fuerzas) {
      const li = document.createElement('li');
      const nombre = f.rol === 'aplicada' && f.simbolo.startsWith('F_{el') ? 'Fuerza elástica' : ESTILO_ROL[f.rol as RolVector].nombre;
      li.textContent = `${nombre}: ${f.valor === null ? 'incógnita' : `${numeroEs(f.valor)} N`}`;
      lista.append(li);
    }
    const acel = document.createElement('p');
    acel.className = 'nota';
    acel.textContent =
      r.aceleracion.x === null
        ? 'Aceleración: no se puede determinar con lo dibujado.'
        : `Aceleración: ${numeroEs(r.aceleracion.x)} m/s²${r.superficie ? ' a lo largo de la superficie' : ' en x'}${r.aceleracion.y !== null && !r.superficie ? `, ${numeroEs(r.aceleracion.y)} m/s² en y` : ''}${r.estadoRoce === 'estatico' ? ' (en reposo)' : ''}`;
    const avisos = r.avisos.map((a) => {
      const q = document.createElement('p');
      q.className = 'nota aviso-dcl';
      q.textContent = a;
      return q;
    });
    p.el.replaceChildren(lista, acel, ...avisos);
  }

  private g = G_POR_DEFECTO;
  private modoRoce: ModoRoce = 'auto';

  /** Diagrama de cuerpo libre: vista previa de lo que se detecta y botón para dibujarlo. */
  private seccionDcl(cuerpo: Bloque | Esfera): void {
    const e = this.elemento;
    const h = document.createElement('h3');
    h.textContent = 'Diagrama de cuerpo libre';
    e.append(h);
    const fila = document.createElement('div');
    fila.className = 'fila-campos';
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Tipo de roce');
    for (const [v, t] of [['auto', 'Roce: automático'], ['estatico', 'Roce estático'], ['cinetico', 'Roce cinético'], ['ninguno', 'Sin roce']] as const) sel.append(new Option(t, v, false, this.modoRoce === v));
    sel.addEventListener('change', () => {
      this.modoRoce = sel.value as ModoRoce;
      this.huella = '';
      this.actualizar();
    });
    fila.append(
      campo('g (m/s²)', numerico(this.g, '0.1', (x) => {
        if (x > 0) {
          this.g = x;
          this.huella = '';
          this.actualizar();
        }
      }, 'Aceleración de gravedad')),
      campo('Roce', sel),
    );
    e.append(fila);

    const previa = document.createElement('div');
    previa.className = 'dcl-previa';
    e.append(previa);
    this.previa = { el: previa, cuerpo };
    this.refrescarPrevia();
    e.append(
      boton('Generar diagrama de cuerpo libre', 'Dibuja el cuerpo aislado con sus fuerzas, los ejes y ΣF = m a por componente', () => {
        const res = resolverDcl(this.vigente(cuerpo), this.host.elementos(), this.g, this.modoRoce);
        const caja = unirCajas(this.host.elementos().map(cajaDe));
        const origen = { x: Math.round(((caja?.x1 ?? 0) + 3.4) * 1e4) / 1e4, y: res.cuerpo.centro.y };
        const nuevos = construirDcl(res, origen);
        this.host.editar({ agregar: nuevos });
        this.host.seleccionar([]);
        this.host.avisar('Diagrama de cuerpo libre dibujado a la derecha de la escena.');
      }),
    );
  }

  private panelSuma(vs: readonly Vector[]): void {
    const e = this.elemento;
    this.titulo(`${vs.length} vectores seleccionados`);
    const r = sumar(vs);
    const p = document.createElement('p');
    if (!r) {
      p.textContent = 'Para sumar, todos los vectores deben tener la misma unidad.';
      e.append(p);
      return;
    }
    const ejes = this.ejesDe(r.resultante);
    p.textContent = `Resultante: ${numeroEs(modulo(r.resultante))} ${r.resultante.unidad} a ${numeroEs(aGrados(anguloRespecto(r.resultante, ejes)))}°`;
    p.setAttribute('role', 'status');
    e.append(
      p,
      boton('Sumar (punta con cola)', 'Dibuja el polígono de vectores y la resultante', () => {
        this.host.editar({ agregar: [...r.fantasmas, r.resultante] });
        this.host.seleccionar([r.resultante.id]);
      }),
    );
    const nota = document.createElement('p');
    nota.className = 'nota';
    nota.textContent = 'Coloca copias punteadas de los demás vectores una tras otra y dibuja la resultante desde el origen del primero.';
    e.append(nota);
  }

  private panelCrear(): void {
    const e = this.elemento;
    this.titulo('Vector');
    const rolActual = this.host.rolVector();
    const sel = document.createElement('div');
    sel.className = 'roles';
    sel.setAttribute('role', 'group');
    sel.setAttribute('aria-label', 'Tipo de vector nuevo');
    const paleta = PALETAS[temaActual()];
    for (const r of ROLES_VECTOR) {
      const b = boton(ESTILO_ROL[r].nombre, `${ESTILO_ROL[r].nombre} (${ESTILO_ROL[r].unidad})`, () => this.host.ponerRolVector(r));
      b.className = 'rol-vector';
      b.style.setProperty('--rol', colorDeRol(paleta, r));
      b.setAttribute('aria-pressed', String(r === rolActual));
      sel.append(b);
    }
    e.append(sel);

    const est = ESTILO_ROL[rolActual];
    let valor = est.porMetro * 3;
    let ang = 0;
    const fila = document.createElement('div');
    fila.className = 'fila-campos';
    fila.append(
      campo(`Módulo (${est.unidad})`, numerico(valor, '1', (x) => (valor = x), 'Módulo del vector nuevo')),
      campo('Ángulo (°)', numerico(ang, '1', (x) => (ang = x), 'Ángulo del vector nuevo')),
    );
    e.append(fila);
    e.append(
      boton('Agregar por valores', 'Crea el vector con ese módulo y ese ángulo (respecto del sistema de referencia)', () => {
        const ref = this.host.refActual();
        const ejes = ref ? ((this.host.elementos().find((x) => x.id === ref && x.tipo === 'ejes') as Ejes | undefined) ?? null) : null;
        const origen = ejes?.origen ?? this.host.centroVista();
        const v = vectorPorValores(rolActual, origen, valor, ang, ejes, { mostrarValor: true });
        this.host.editar({ agregar: [v] });
        this.host.seleccionar([v.id]);
      }),
    );
    const nota = document.createElement('p');
    nota.className = 'nota';
    nota.textContent = 'O arrastra sobre la pizarra para dibujarlo. El ángulo se mide desde el eje x de los últimos ejes que dibujaste.';
    e.append(nota);
  }
}
