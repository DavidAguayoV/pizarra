import type { Ejes, Elemento, Vector } from '../core/elementos';
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

/** Lo que el panel necesita de la aplicación. */
export interface AnfitrionPropiedades {
  elementos(): readonly Elemento[];
  seleccion(): readonly Elemento[];
  seleccionar(ids: readonly string[]): void;
  editar(cambio: LotePayload): void;
  herramienta(): string;
  rolVector(): RolVector;
  ponerRolVector(r: RolVector): void;
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
    const huella = JSON.stringify([sel, ejes, this.host.herramienta(), this.host.rolVector()]);
    if (huella === this.huella) return;
    const ids = JSON.stringify(sel.map((e) => e.id));
    // Mientras se escribe en un campo de texto del panel no se le quita el foco; los
    // manejadores siempre parten del elemento actual, así que no se pierde ningún cambio.
    const activo = document.activeElement;
    const escribiendo = activo instanceof HTMLInputElement && activo.type === 'text' && this.elemento.contains(activo);
    if (escribiendo && ids === this.idsHuella && sel.length > 0) return;
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
    else if (vectores.length >= 2 && vectores.length === sel.length) this.panelSuma(vectores);
    else if (this.host.herramienta() === 'vector') this.panelCrear();
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
