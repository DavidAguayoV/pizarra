import type { Punto } from '../core/camara';
import { camaraInicial } from '../core/camara';
import { OPCIONES_COLOR, OPCIONES_RESALTADOR, colorDeTinta } from '../core/colores';
import type { ColorTinta, Elemento } from '../core/elementos';
import { escenaInicial, OP_AGREGAR, OP_BORRAR, reductoresEscena } from '../core/escena';
import type { Escena } from '../core/escena';
import { Store } from '../core/store';
import type { Op } from '../core/ops';
import { alternarTema, temaActual } from '../core/tema';
import { aPng } from '../export/png';
import { dataUrlABlob, copiarTexto, descargarBlob, descargarTexto } from '../export/descarga';
import { leerProyecto, serializarProyecto } from '../export/json';
import { aSvg } from '../export/svg';
import { ANCHO_CM_POR_DEFECTO, aTikz } from '../export/tikz';
import { Entrada, esCampoDeTexto } from '../ink/entrada';
import type { Herramienta } from '../ink/herramientas';
import {
  crearImagen,
  crearTexto,
  DEFS_HERRAMIENTAS,
  grosorDePosicion,
  POSICIONES_ATAJO,
  RANGO_RESALTADOR,
  RANGO_TINTA,
  tamTextoDeGrosor,
} from '../ink/herramientas';
import { elegirTransport } from '../share';
import { crearCompartir } from './compartir';
import type { Transmision } from './compartir';
import { cargarImagen, primeraImagen } from './imagenes';
import { Lienzo } from './lienzo';
import { PALETAS } from './tokens';

const CURSORES: Record<Herramienta, string> = {
  lapiz: 'crosshair',
  resaltador: 'crosshair',
  borrador: 'cell',
  linea: 'crosshair',
  flecha: 'crosshair',
  rect: 'crosshair',
  elipse: 'crosshair',
  texto: 'text',
  mano: 'grab',
};

function boton(texto: string, titulo: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = texto;
  b.title = titulo;
  b.addEventListener('click', onClick);
  return b;
}

function grupo(etiqueta: string, ...hijos: HTMLElement[]): HTMLDivElement {
  const g = document.createElement('div');
  g.className = 'grupo';
  g.setAttribute('role', 'group');
  g.setAttribute('aria-label', etiqueta);
  g.append(...hijos);
  return g;
}

function marcaFecha(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Pizarra: herramientas de dibujo, cámara, temas y exportación (Etapa 1). */
export function montarApp(raiz: HTMLElement, opciones: { ops?: readonly Op[] } = {}): void {
  const store = new Store<Escena>(escenaInicial, reductoresEscena);
  if (opciones.ops) store.cargar(opciones.ops);

  let herramienta: Herramienta = 'lapiz';
  let colorTinta: ColorTinta = 'tinta';
  let colorLuz: ColorTinta = 'luzAmarillo';
  /** Posición (0 a 100) del deslizador de grosor, una por tipo de herramienta. */
  let posTinta: number = RANGO_TINTA.inicial;
  let posLuz: number = RANGO_RESALTADOR.inicial;
  const esLuz = (): boolean => herramienta === 'resaltador';
  const colorActual = (): ColorTinta => (esLuz() ? colorLuz : colorTinta);
  const grosorActual = (): number =>
    esLuz() ? grosorDePosicion(posLuz, RANGO_RESALTADOR) : grosorDePosicion(posTinta, RANGO_TINTA);
  const grosorTexto = (): number => tamTextoDeGrosor(grosorDePosicion(posTinta, RANGO_TINTA));

  // --- Estructura -------------------------------------------------------------
  const barra = document.createElement('header');
  barra.className = 'barra';
  const titulo = document.createElement('h1');
  titulo.textContent = 'Pizarra de Física';

  const botonesHerr = new Map<Herramienta, HTMLButtonElement>();
  for (const d of DEFS_HERRAMIENTAS) {
    const b = boton(d.etiqueta, `${d.etiqueta} (${d.atajo})`, () => elegirHerramienta(d.clave));
    b.dataset['herramienta'] = d.clave;
    botonesHerr.set(d.clave, b);
  }

  const muestras = (
    opciones: readonly { clave: ColorTinta; etiqueta: string }[],
    elegir: (c: ColorTinta) => void,
  ): Map<ColorTinta, HTMLButtonElement> => {
    const m = new Map<ColorTinta, HTMLButtonElement>();
    for (const o of opciones) {
      const b = boton('', o.etiqueta, () => {
        elegir(o.clave);
        actualizarBarra();
      });
      b.className = 'muestra';
      b.setAttribute('aria-label', o.etiqueta);
      m.set(o.clave, b);
    }
    return m;
  };
  const botonesColor = muestras(OPCIONES_COLOR, (c) => (colorTinta = c));
  const botonesLuz = muestras(OPCIONES_RESALTADOR, (c) => (colorLuz = c));
  const grupoTinta = grupo('Color de tinta', ...botonesColor.values());
  const grupoLuz = grupo('Color del resaltador', ...botonesLuz.values());

  // Deslizador de grosor: la vista previa muestra el trazo tal como se verá en pantalla.
  const deslizador = document.createElement('input');
  deslizador.type = 'range';
  deslizador.min = '0';
  deslizador.max = '100';
  deslizador.step = '1';
  deslizador.setAttribute('aria-label', 'Grosor del trazo');
  deslizador.addEventListener('input', () => {
    if (esLuz()) posLuz = Number(deslizador.value);
    else posTinta = Number(deslizador.value);
    actualizarBarra();
  });
  const vistaGrosor = document.createElement('span');
  vistaGrosor.className = 'vista-grosor';
  vistaGrosor.setAttribute('aria-hidden', 'true');
  const valorGrosor = document.createElement('span');
  valorGrosor.className = 'valor-grosor';
  const grupoGrosor = grupo('Grosor', deslizador, vistaGrosor, valorGrosor);
  grupoGrosor.classList.add('grosor');

  const bDeshacer = boton('Deshacer', 'Deshacer (Ctrl+Z)', () => store.deshacer());
  const bRehacer = boton('Rehacer', 'Rehacer (Ctrl+Y)', () => store.rehacer());
  const bVista = boton('Centrar', 'Volver a la vista inicial (0)', () => L.ponerCamara(camaraInicial()));
  const bTema = boton('', 'Alternar tema claro / oscuro', () => {
    alternarTema();
    L.invalidar();
    actualizarBarra();
  });

  const entradaArchivo = document.createElement('input');
  entradaArchivo.type = 'file';
  entradaArchivo.accept = 'application/json,.json';
  entradaArchivo.hidden = true;
  entradaArchivo.addEventListener('change', () => void abrirProyecto(entradaArchivo));
  const entradaImagen = document.createElement('input');
  entradaImagen.type = 'file';
  entradaImagen.accept = 'image/*';
  entradaImagen.hidden = true;
  entradaImagen.addEventListener('change', () => {
    const f = entradaImagen.files?.[0];
    entradaImagen.value = '';
    if (f) void colocarImagen(f);
  });
  const bAbrir = boton('Abrir', 'Abrir un proyecto (.json)', () => entradaArchivo.click());
  const bImagen = boton('Imagen', 'Insertar una imagen (también se puede pegar o arrastrar)', () => entradaImagen.click());

  const menu = construirMenuExportar();
  let transmision: Transmision | null = null;
  const compartir = crearCompartir({
    store,
    transport: elegirTransport(),
    alCambiar: (t) => {
      transmision = t;
      ultimaVistaEnviada = '';
    },
    avisar: (t) => avisar(t),
  });
  let ultimaVistaEnviada = '';
  /** El encuadre del profesor viaja a los estudiantes que lo siguen. */
  function publicarVista(): void {
    if (!transmision) return;
    const { camara, ancho, alto } = L;
    const clave = `${camara.cx}|${camara.cy}|${camara.escala}|${ancho}|${alto}`;
    if (clave === ultimaVistaEnviada) return;
    ultimaVistaEnviada = clave;
    transmision.difusor.vista({ cx: camara.cx, cy: camara.cy, escala: camara.escala, ancho, alto });
  }

  const estado = document.createElement('span');
  estado.className = 'estado';
  estado.setAttribute('role', 'status');
  const aviso = document.createElement('span');
  aviso.className = 'aviso';
  aviso.setAttribute('role', 'alert');

  const fila1 = document.createElement('div');
  fila1.className = 'fila';
  fila1.append(
    titulo,
    grupo('Herramientas', ...botonesHerr.values()),
    grupoTinta,
    grupoLuz,
    grupoGrosor,
  );
  const fila2 = document.createElement('div');
  fila2.className = 'fila';
  fila2.append(bDeshacer, bRehacer, bVista, bImagen, bAbrir, menu.elemento, compartir.boton, bTema, estado, aviso, entradaArchivo, entradaImagen);
  barra.append(fila1, fila2);

  const lienzo = document.createElement('canvas');
  lienzo.className = 'lienzo';
  lienzo.setAttribute('aria-label', 'Lienzo de la pizarra');
  raiz.append(barra, lienzo);
  // --- Lienzo (cámara, caché de dibujo, elemento en construcción) --------------------------
  const L = new Lienzo(lienzo, () => store.estado.elementos, { alCuadro: () => { actualizarBarra(); publicarVista(); } });
  const ponerCamara = L.ponerCamara.bind(L);

  // --- Barra --------------------------------------------------------------------
  function actualizarBarra(): void {
    const paleta = PALETAS[temaActual()];
    bDeshacer.disabled = !store.puedeDeshacer;
    bRehacer.disabled = !store.puedeRehacer;
    bTema.textContent = temaActual() === 'oscuro' ? 'Tema claro' : 'Tema oscuro';
    for (const [k, b] of botonesHerr) b.setAttribute('aria-pressed', String(k === herramienta));
    for (const [k, b] of botonesColor) {
      b.style.setProperty('--muestra', colorDeTinta(paleta, k));
      b.setAttribute('aria-pressed', String(k === colorTinta));
    }
    for (const [k, b] of botonesLuz) {
      b.style.setProperty('--muestra', colorDeTinta(paleta, k));
      b.setAttribute('aria-pressed', String(k === colorLuz));
    }
    grupoTinta.hidden = esLuz();
    grupoLuz.hidden = !esLuz();
    grupoGrosor.hidden = herramienta === 'mano' || herramienta === 'borrador';
    deslizador.value = String(esLuz() ? posLuz : posTinta);
    const g = grosorActual();
    const alto = Math.min(30, Math.max(1.5, g * L.camara.escala));
    vistaGrosor.style.height = `${alto}px`;
    vistaGrosor.style.background = colorDeTinta(paleta, colorActual());
    vistaGrosor.style.opacity = esLuz() ? '0.6' : '1';
    valorGrosor.textContent = `${(g * 100).toFixed(g < 0.1 ? 1 : 0).replace('.', ',')} cm`;
    lienzo.style.cursor = CURSORES[herramienta];
    const n = store.estado.elementos.length;
    menu.habilitar(n > 0);
    estado.textContent = `${n} elemento${n === 1 ? '' : 's'} · ${store.ops.length} ops · ${L.camara.escala.toFixed(0)} px/m`;
  }

  function elegirHerramienta(h: Herramienta): void {
    herramienta = h;
    actualizarBarra();
  }

  let temporizadorAviso = 0;
  function avisar(texto: string): void {
    aviso.textContent = texto;
    window.clearTimeout(temporizadorAviso);
    temporizadorAviso = window.setTimeout(() => (aviso.textContent = ''), 6000);
  }

  // --- Entrada ------------------------------------------------------------------
  new Entrada(lienzo, {
    camara: () => L.camara,
    ponerCamara,
    vista: () => L.vista,
    herramienta: () => herramienta,
    color: colorActual,
    grosor: grosorActual,
    tamTexto: grosorTexto,
    elementos: () => store.estado.elementos,
    previsualizar(v, o) {
      L.fijarVivo(v, o);
      transmision?.difusor.vivo(v, o);
    },
    confirmar: (e) => store.emitir(OP_AGREGAR, e),
    borrar: (ids) => store.emitir(OP_BORRAR, { ids }),
    pedirTexto: (p) => editarTexto(p),
  });

  // --- Texto ----------------------------------------------------------------------
  let editor: HTMLTextAreaElement | null = null;
  function editarTexto(p: Punto): void {
    cerrarEditor(true);
    const tam = grosorTexto();
    const r = lienzo.getBoundingClientRect();
    const { camara } = L;
    const sx = L.ancho / 2 + (p.x - camara.cx) * camara.escala;
    const sy = L.alto / 2 - (p.y - camara.cy) * camara.escala;
    const ta = document.createElement('textarea');
    ta.className = 'editor-texto';
    ta.setAttribute('aria-label', 'Texto nuevo (Enter para colocar, Mayús+Enter para otra línea, Esc para cancelar)');
    ta.rows = 1;
    ta.style.left = `${r.left + sx}px`;
    ta.style.top = `${r.top + sy}px`;
    ta.style.fontSize = `${Math.max(12, tam * L.camara.escala)}px`;
    ta.style.color = colorDeTinta(PALETAS[temaActual()], colorTinta);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        cerrarEditor(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cerrarEditor(false);
      }
    });
    ta.addEventListener('input', () => {
      ta.rows = ta.value.split('\n').length;
    });
    ta.addEventListener('blur', () => cerrarEditor(true));
    ta.dataset['x'] = String(p.x);
    ta.dataset['y'] = String(p.y);
    ta.dataset['tam'] = String(tam);
    ta.dataset['color'] = colorTinta;
    document.body.append(ta);
    editor = ta;
    ta.focus();
    // Tras soltar el clic el navegador puede devolver el foco al lienzo: se reafirma.
    window.setTimeout(() => {
      if (editor === ta && document.activeElement !== ta) ta.focus();
    }, 30);
  }

  function cerrarEditor(colocar: boolean): void {
    const ta = editor;
    if (!ta) return;
    editor = null;
    const texto = ta.value.replace(/\s+$/, '');
    if (colocar && texto.trim() !== '') {
      const pos = { x: Number(ta.dataset['x']), y: Number(ta.dataset['y']) };
      store.emitir(OP_AGREGAR, crearTexto(pos, texto, ta.dataset['color'] as ColorTinta, Number(ta.dataset['tam'])));
    }
    ta.remove();
  }

  // --- Imágenes ---------------------------------------------------------------------
  async function colocarImagen(archivo: Blob): Promise<void> {
    try {
      const img = await cargarImagen(archivo);
      const camara = L.camara;
      const maxAncho = (0.6 * L.ancho) / camara.escala;
      const maxAlto = (0.6 * L.alto) / camara.escala;
      const proporcion = img.ancho / img.alto;
      const anchoM = Math.min(maxAncho, maxAlto * proporcion);
      const altoM = anchoM / proporcion;
      store.emitir(OP_AGREGAR, crearImagen({ x: camara.cx - anchoM / 2, y: camara.cy + altoM / 2 }, anchoM, altoM, img.src));
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'No se pudo insertar la imagen.');
    }
  }

  window.addEventListener('paste', (e) => {
    if (esCampoDeTexto(e.target)) return;
    const f = primeraImagen(e.clipboardData);
    if (f) {
      e.preventDefault();
      void colocarImagen(f);
    }
  });
  lienzo.addEventListener('dragover', (e) => e.preventDefault());
  lienzo.addEventListener('drop', (e) => {
    const f = primeraImagen(e.dataTransfer);
    if (f) {
      e.preventDefault();
      void colocarImagen(f);
    }
  });

  // --- Proyectos y exportación -----------------------------------------------------------
  async function abrirProyecto(input: HTMLInputElement): Promise<void> {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const ops = leerProyecto(await f.text());
      if (store.ops.length > 0 && !window.confirm('Se reemplazará la pizarra actual por el proyecto abierto. ¿Continuar?')) return;
      store.cargar(ops);
      ponerCamara(camaraInicial());
      avisar(`Proyecto abierto: ${f.name}`);
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'No se pudo abrir el proyecto.');
    }
  }

  function construirMenuExportar(): { elemento: HTMLDetailsElement; habilitar: (v: boolean) => void } {
    const det = document.createElement('details');
    det.className = 'menu';
    const resumen = document.createElement('summary');
    resumen.textContent = 'Exportar';
    const caja = document.createElement('div');
    caja.className = 'menu-caja';

    const selRes = document.createElement('select');
    selRes.setAttribute('aria-label', 'Resolución del PNG');
    for (const [v, t] of [['1', 'PNG 1×'], ['2', 'PNG 2×'], ['4', 'PNG 4×']] as const) selRes.append(new Option(t, v));
    const chkTransp = document.createElement('input');
    chkTransp.type = 'checkbox';
    const etTransp = document.createElement('label');
    etTransp.append(chkTransp, ' Fondo transparente');
    const inpAncho = document.createElement('input');
    inpAncho.type = 'number';
    inpAncho.min = '1';
    inpAncho.max = '60';
    inpAncho.step = '0.5';
    inpAncho.value = String(ANCHO_CM_POR_DEFECTO);
    inpAncho.setAttribute('aria-label', 'Ancho de la figura TikZ en centímetros');
    const etAncho = document.createElement('label');
    etAncho.append('Ancho TikZ (cm) ', inpAncho);

    const anchoCm = (): number => {
      const v = Number(inpAncho.value);
      return Number.isFinite(v) && v > 0 ? v : ANCHO_CM_POR_DEFECTO;
    };
    const elementos = (): readonly Elemento[] => store.estado.elementos;

    const acciones: HTMLButtonElement[] = [
      boton('Descargar PNG', 'Imagen PNG con la resolución elegida', () => {
        void aPng(elementos(), { resolucion: Number(selRes.value) as 1 | 2 | 4, transparente: chkTransp.checked })
          .then((b) => descargarBlob(`pizarra-${marcaFecha()}.png`, b))
          .catch((err: unknown) => avisar(err instanceof Error ? err.message : 'No se pudo generar el PNG.'));
      }),
      boton('Descargar SVG', 'Imagen vectorial', () => {
        descargarTexto(`pizarra-${marcaFecha()}.svg`, aSvg(elementos()), 'image/svg+xml');
      }),
      boton('Descargar proyecto (.json)', 'Proyecto completo, con historial; se puede abrir de nuevo', () => {
        descargarTexto(`pizarra-${marcaFecha()}.json`, serializarProyecto(store.ops), 'application/json');
      }),
      boton('Copiar TikZ (fragmento)', 'Para pegar en Beamer o apuntes', () => {
        const r = aTikz(elementos(), { modo: 'fragmento', anchoCm: anchoCm() });
        void copiarTexto(r.codigo).then((ok) =>
          avisar(ok ? 'TikZ copiado al portapapeles.' : 'No se pudo copiar; usa "Descargar .tex".'),
        );
        entregarImagenes(r.imagenes);
      }),
      boton('Descargar .tex (fragmento)', 'Solo el entorno tikzpicture', () => {
        const r = aTikz(elementos(), { modo: 'fragmento', anchoCm: anchoCm() });
        descargarTexto(`pizarra-${marcaFecha()}.tikz.tex`, r.codigo, 'application/x-tex');
        entregarImagenes(r.imagenes);
      }),
      boton('Descargar .tex (documento)', 'Documento standalone que compila solo', () => {
        const r = aTikz(elementos(), { modo: 'documento', anchoCm: anchoCm() });
        descargarTexto(`pizarra-${marcaFecha()}.tex`, r.codigo, 'application/x-tex');
        entregarImagenes(r.imagenes);
      }),
    ];

    function entregarImagenes(imgs: readonly { nombre: string; src: string }[]): void {
      for (const i of imgs) descargarBlob(i.nombre, dataUrlABlob(i.src));
      if (imgs.length > 0) avisar('Las imágenes se descargaron aparte: déjalas junto al .tex.');
    }

    caja.append(selRes, etTransp, etAncho, ...acciones);
    det.append(resumen, caja);
    return {
      elemento: det,
      habilitar: (v) => acciones.forEach((a) => (a.disabled = !v)),
    };
  }

  // --- Teclado ------------------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (esCampoDeTexto(e.target)) return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) store.rehacer();
      else store.deshacer();
    } else if (mod && k === 'y') {
      e.preventDefault();
      store.rehacer();
    } else if (!mod && !e.altKey) {
      const d = DEFS_HERRAMIENTAS.find((x) => x.atajo.toLowerCase() === k);
      if (d) {
        elegirHerramienta(d.clave);
      } else if (k >= '1' && k <= '3') {
        const pos = POSICIONES_ATAJO[Number(k) - 1]!;
        if (esLuz()) posLuz = pos;
        else posTinta = pos;
        actualizarBarra();
      } else if (k === '[' || k === ']') {
        const paso = k === ']' ? 5 : -5;
        const ajustar = (v: number): number => Math.min(100, Math.max(0, v + paso));
        if (esLuz()) posLuz = ajustar(posLuz);
        else posTinta = ajustar(posTinta);
        actualizarBarra();
      } else if (k === '0') {
        ponerCamara(camaraInicial());
      }
    }
  });

  store.suscribir(() => L.invalidar());
}
