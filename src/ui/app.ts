import type { Punto } from '../core/camara';
import { camaraInicial } from '../core/camara';
import { OPCIONES_COLOR, OPCIONES_RESALTADOR, colorDeTinta } from '../core/colores';
import type { ColorTinta, Elemento } from '../core/elementos';
import { cajaDe, unirCajas } from '../core/elementos';
import { escenaInicial, OP_AGREGAR, OP_LOTE, reductoresEscena } from '../core/escena';
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
  grosorDePosicion,
  POSICIONES_ATAJO,
  RANGO_RESALTADOR,
  RANGO_TINTA,
  tamTextoDeGrosor,
} from '../ink/herramientas';
import type { LotePayload } from '../core/escena';
import type { ConexionPendiente, Marca } from '../grafo/conectar';
import { apoyar, conectarNuevo, IMAN_PX, IMAN_TACTIL_PX, iman, marcasDeConexion, marcasDeUnion, PASO_PX, PASO_TACTIL_PX, regionDePaso, toque } from '../grafo/conectar';
import { crearCuerda, crearResorte, ROCE_POR_DEFECTO } from '../physics/objetos';
import { crearMontaje, MONTAJES } from '../grafo/montajes';
import { loteVacio, prepararLote } from '../grafo/integridad';
import { dependientes, resolverElemento, resolverEscena, sinDerivados } from '../grafo/resolver';
import type { TipoObjeto } from '../physics/objetos';
import type { RolVector } from '../physics/vectores';
import { elegirTransport } from '../share';
import { crearCompartir } from './compartir';
import type { Transmision } from './compartir';
import { cargarImagen, primeraImagen } from './imagenes';
import { Lienzo } from './lienzo';
import { PanelPropiedades } from './propiedades';
import { PanelSimulacion } from './simulacion';
import { PALETAS } from './tokens';
import { MenuProblemas } from './problemas';
import type { DefBoton, Modo } from './modos';
import { BOTONES_MODO, botonActivo, botonDeAtajo, INICIAL_MODO, modoDe, MODOS } from './modos';

const CURSORES: Record<Herramienta, string> = {
  objeto: 'crosshair',
  seleccionar: 'default',
  ejes: 'crosshair',
  vector: 'crosshair',
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

function icono(t: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'ico';
  s.setAttribute('aria-hidden', 'true');
  s.textContent = t;
  return s;
}
function textoBoton(t: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'txt';
  s.textContent = t;
  return s;
}
/** Botón con icono y texto; en el celular puede quedar solo el icono, y su nombre accesible es siempre el texto. */
function botonIcono(ico: string, texto: string, titulo: string, onClick: () => void): HTMLButtonElement {
  const b = boton('', titulo, onClick);
  b.classList.add('con-icono');
  b.setAttribute('aria-label', texto);
  b.append(icono(ico), textoBoton(texto));
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
  let seleccionIds: string[] = [];
  let rolVector: RolVector = 'aplicada';
  let tipoObjeto: TipoObjeto = 'bloque';
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

  // Modos (Nivel 2): cada uno muestra solo sus herramientas (ui/modos.ts).
  let modo: Modo = 'dibujar';
  const ultimaDeModo = new Map<Modo, DefBoton>(MODOS.map((m) => [m.clave, INICIAL_MODO[m.clave]]));
  const filasHerr = new Map<Modo, HTMLDivElement>();
  const botonesHerr: Array<{ def: DefBoton; b: HTMLButtonElement }> = [];
  for (const m of MODOS) {
    const botones = BOTONES_MODO[m.clave].map((def) => {
      const b = boton(def.etiqueta, def.atajo ? `${def.etiqueta} (${def.atajo})` : def.etiqueta, () => elegirBoton(m.clave, def));
      b.dataset['herramienta'] = def.clave;
      botonesHerr.push({ def, b });
      return b;
    });
    const g = grupo(`Herramientas de ${m.etiqueta}`, ...botones);
    g.classList.add('herramientas');
    g.hidden = m.clave !== modo; // desde el principio, solo la fila del modo activo
    filasHerr.set(m.clave, g);
  }
  // «Con roce» (Armar): las superficies y planos que se dibujen nacen con μs = 0,4 y μk = 0,3 (se editan en su panel).
  let conRoce = false;
  const bRoce = boton('Con roce', 'Las superficies y planos nuevos tienen roce (μs = 0,4; μk = 0,3)', () => {
    conRoce = !conRoce;
    actualizarBarra();
  });
  bRoce.classList.add('interruptor-roce');
  const filaArmar = filasHerr.get('armar')!;
  filaArmar.querySelector('[data-herramienta="objeto:plano"]')?.after(bRoce);
  // «Montajes» (Armar): escenas clásicas ya conectadas, listas para simular; se agregan en el centro de la vista.
  const menuMontajes = document.createElement('details');
  menuMontajes.className = 'menu menu-montajes';
  const resumenMontajes = document.createElement('summary');
  resumenMontajes.textContent = 'Montajes';
  resumenMontajes.title = 'Escenas clásicas listas para simular';
  const cajaMontajes = document.createElement('div');
  cajaMontajes.className = 'menu-caja';
  for (const m of MONTAJES) {
    const b = boton('', m.descripcion, () => {
      menuMontajes.open = false;
      const nuevos = crearMontaje(m.id, { x: L.camara.cx, y: L.camara.cy }, store.estado.elementos, { conRoce });
      emitirLote({ agregar: nuevos });
      avisar(`${m.nombre}: listo. Simular lo pone en movimiento.`);
    });
    b.classList.add('montaje');
    b.dataset['montaje'] = m.id;
    const nombre = document.createElement('strong');
    nombre.textContent = m.nombre;
    const desc = document.createElement('span');
    desc.textContent = m.descripcion;
    b.append(nombre, desc);
    cajaMontajes.append(b);
  }
  menuMontajes.append(resumenMontajes, cajaMontajes);
  filaArmar.querySelector('[data-herramienta="seleccionar"]')?.after(menuMontajes);
  const botonesModo = new Map<Modo, HTMLButtonElement>();
  for (const m of MODOS) {
    const b = botonIcono(m.icono, m.etiqueta, `Modo ${m.etiqueta}`, () => elegirModo(m.clave));
    b.classList.add('modo');
    botonesModo.set(m.clave, b);
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

  const bDeshacer = botonIcono('↶', 'Deshacer', 'Deshacer (Ctrl+Z)', () => store.deshacer());
  const bRehacer = botonIcono('↷', 'Rehacer', 'Rehacer (Ctrl+Y)', () => store.rehacer());
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
  const entradaEscala = document.createElement('input');
  entradaEscala.type = 'number';
  entradaEscala.min = '5';
  entradaEscala.max = '5000';
  entradaEscala.step = '10';
  entradaEscala.className = 'entrada-escala';
  entradaEscala.setAttribute('aria-label', 'Escala de la vista en píxeles por metro');
  entradaEscala.addEventListener('change', () => {
    const v = Number(entradaEscala.value);
    if (Number.isFinite(v)) L.ponerCamara({ ...L.camara, escala: Math.min(5000, Math.max(5, v)) });
  });
  const etiquetaEscala = document.createElement('label');
  etiquetaEscala.className = 'etiqueta-escala';
  etiquetaEscala.append('Escala ', entradaEscala, ' px/m');
  const bSim = botonIcono('▶', 'Simular', 'Simula el movimiento de la escena: gráficos, energía y comparación analítica', () => {
    if (simPanel.abierto) simPanel.cerrar();
    else {
      // Al simular se suelta la selección: su panel de propiedades no debe tapar lo que se mueve.
      if (seleccionIds.length > 0) seleccionar([]);
      simPanel.abrir();
      requestAnimationFrame(() => encuadrarLibre());
    }
    actualizarBarra();
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

  bSim.classList.add('modo');
  // Menú "Más": lo que se usa poco. En el celular también recibe Rehacer, Exportar y Compartir.
  const mas = document.createElement('details');
  mas.className = 'menu menu-mas';
  const resumenMas = document.createElement('summary');
  resumenMas.setAttribute('aria-label', 'Más opciones');
  resumenMas.append(icono('⋯'), textoBoton('Más'));
  const cajaMas = document.createElement('div');
  cajaMas.className = 'menu-caja';
  cajaMas.append(bAbrir, bVista, bTema, etiquetaEscala);
  mas.append(resumenMas, cajaMas);

  const modos = grupo('Modos', ...botonesModo.values(), bSim);
  modos.classList.add('modos');
  const problemas = new MenuProblemas({
    elementos: () => store.estado.elementos,
    editar: (c) => emitirLote(c),
    mostrar: (ids) => {
      elegirBoton(modo, BOTONES_MODO[modo][0]!); // Seleccionar
      seleccionar(ids.filter((id) => store.estado.elementos.some((e) => e.id === id)));
    },
  });
  const acciones = grupo('Acciones', problemas.elemento, bDeshacer, bRehacer, menu.elemento, compartir.boton, mas);
  acciones.classList.add('acciones');
  const fila1 = document.createElement('div');
  fila1.className = 'fila fila-modos';
  fila1.append(titulo, modos, acciones, estado);
  const fila2 = document.createElement('div');
  fila2.className = 'fila fila-herr';
  fila2.append(...filasHerr.values(), bImagen, grupoTinta, grupoLuz, grupoGrosor);
  barra.append(fila2, fila1, aviso, entradaArchivo, entradaImagen);

  // En el celular, Rehacer, Exportar y Compartir pasan al menú "Más" (la barra de abajo debe caber en una fila).
  const angosta = window.matchMedia('(max-width: 700px)');
  function reubicar(): void {
    if (angosta.matches) cajaMas.prepend(bRehacer, menu.elemento, compartir.boton);
    else bDeshacer.after(bRehacer, menu.elemento, compartir.boton);
  }
  angosta.addEventListener('change', reubicar);
  reubicar();

  const lienzo = document.createElement('canvas');
  lienzo.className = 'lienzo';
  lienzo.setAttribute('aria-label', 'Lienzo de la pizarra');
  const zona = document.createElement('div');
  zona.className = 'zona-lienzo';
  raiz.append(barra, zona);
  // --- Lienzo (cámara, caché de dibujo, elemento en construcción) --------------------------
  /** La escena resuelta (la geometría de lo unido derivada del grafo): es lo que se ve, se toca y se exporta. */
  const escena = (): Elemento[] => resolverEscena(store.estado.elementos);
  /** Toda edición pasa por la integridad del grafo: las consecuencias viajan en la misma op. */
  /** Radio del imán y margen del paso por poleas, en metros (fijos en pantalla). */
  // Con el dedo, el imán y el margen de las poleas son más grandes (un dedo cubre unos 40 px).
  let tactil = false;
  const radioIman = (): number => (tactil ? IMAN_TACTIL_PX : IMAN_PX) / L.camara.escala;
  const margenPaso = (): number => (tactil ? PASO_TACTIL_PX : PASO_PX) / L.camara.escala;
  /** Conexión toque a toque en curso (primer extremo y poleas tocadas). */
  let pendiente: ConexionPendiente | null = null;
  /** Dónde está el puntero mientras se conecta (marcas de puertos e imanes). */
  let puntero: Punto | null = null;
  let arrastrando = false;
  function emitirLote(c: LotePayload): void {
    const l = prepararLote(c, store.estado.elementos, { radioIman: radioIman() });
    if (!loteVacio(l)) store.emitir(OP_LOTE, l);
  }
  /** Un elemento recién dibujado, con sus uniones (puede fundirse con otra cuerda en una polea). */
  function confirmarElemento(e0: Elemento): void {
    const e = e0.tipo === 'superficie' && conRoce && e0.muS === 0 && e0.muK === 0 ? { ...e0, ...ROCE_POR_DEFECTO } : e0;
    const c = conectarNuevo(sinDerivados(e), store.estado.elementos, radioIman());
    if (c.agregar?.length === 1 && !c.actualizar?.length && !c.borrar?.length) store.emitir(OP_AGREGAR, c.agregar[0]!);
    else emitirLote(c);
  }
  const L = new Lienzo(lienzo, escena, {
    alCuadro: () => {
      actualizarBarra();
      publicarVista();
    },
    // Marcas de las uniones y, mientras se conecta, de los puertos e imanes (solo en la pantalla de quien edita,
    // nunca en las exportaciones ni en el celular del estudiante).
    marcas: () => {
      // Mientras se simula, los cuerpos se mueven: las marcas de la escena quieta confundirían.
      if (simPanel.abierto) return [];
      const conectando = herramienta === 'objeto' && (tipoObjeto === 'cuerda' || tipoObjeto === 'resorte');
      const base = (herramienta === 'seleccionar' || herramienta === 'objeto') && !arrastrando ? marcasDeUnion(escena()) : [];
      // Conexión toque a toque: el primer extremo y las poleas ya tocadas quedan marcados.
      const toques: Marca[] = pendiente
        ? [{ p: pendiente.inicio.p, tipo: 'iman' }, ...pendiente.pasos.map((r): Marca => ({ p: r.c, tipo: 'paso', r: r.r }))]
        : [];
      if (puntero && (conectando || herramienta === 'seleccionar')) return [...base, ...toques, ...marcasDeConexion(escena(), puntero, radioIman(), margenPaso())];
      return [...base, ...toques];
    },
  });
  const ponerCamara = L.ponerCamara.bind(L);
  zona.append(lienzo);

  // --- Selección y propiedades -----------------------------------------------------------------
  const seleccionEls = (): Elemento[] => escena().filter((e) => seleccionIds.includes(e.id));
  const refActual = (): string | null => [...store.estado.elementos].reverse().find((e) => e.tipo === 'ejes')?.id ?? null;
  const panel = new PanelPropiedades({
    elementos: escena,
    seleccion: seleccionEls,
    seleccionar: (ids) => seleccionar(ids),
    editar: emitirLote,
    herramienta: () => herramienta,
    rolVector: () => rolVector,
    ponerRolVector: (r) => {
      rolVector = r;
      panel.actualizar();
    },
    tipoObjeto: () => tipoObjeto,
    ponerTipoObjeto: (t) => {
      tipoObjeto = t;
      panel.actualizar();
    },
    version: () => store.ops.length,
    refActual,
    centroVista: () => ({ x: L.camara.cx, y: L.camara.cy }),
    avisar: (t) => avisar(t),
  });
  zona.append(panel.elemento);

  // --- Simulación -------------------------------------------------------------------------------------
  const simPanel = new PanelSimulacion({
    elementos: () => store.estado.elementos,
    version: () => store.ops.length,
    fijarVivo: (locales, ocultos) => L.fijarVivo(locales, ocultos),
    transmitir: (red, ocultos) => transmision?.difusor.vivo(red, ocultos),
    agregarElementos: (els) => emitirLote({ agregar: els }),
    alCambiarTamano: () => requestAnimationFrame(() => encuadrarLibre()),
    avisar: (t) => avisar(t),
  });
  zona.append(simPanel.elemento);

  /**
   * Si el panel de simulación tapa parte de la escena, la encuadra en el espacio libre de arriba (sin acercar más de lo
   * que estaba). Así lo que se mueve se ve, también en el celular.
   */
  function encuadrarLibre(): void {
    if (!simPanel.abierto) return;
    const caja = unirCajas(escena().map(cajaDe));
    if (!caja) return;
    const rl = lienzo.getBoundingClientRect();
    const rp = simPanel.elemento.getBoundingClientRect();
    const libre = Math.max(80, rp.top - rl.top);
    const c = L.camara;
    const arriba = L.alto / 2 - (caja.y1 - c.cy) * c.escala;
    const abajo = L.alto / 2 - (caja.y0 - c.cy) * c.escala;
    const izq = L.ancho / 2 + (caja.x0 - c.cx) * c.escala;
    const der = L.ancho / 2 + (caja.x1 - c.cx) * c.escala;
    if (arriba >= 0 && abajo <= libre && izq >= 0 && der <= L.ancho) return; // ya se ve entera
    const w = Math.max(caja.x1 - caja.x0, 0.5);
    const h = Math.max(caja.y1 - caja.y0, 0.5);
    const escala = Math.min(c.escala, (L.ancho * 0.9) / w, (libre * 0.85) / h);
    const yc = (caja.y0 + caja.y1) / 2;
    ponerCamara({ cx: (caja.x0 + caja.x1) / 2, cy: yc - (L.alto / 2 - libre / 2) / escala, escala });
  }

  function seleccionar(ids: readonly string[]): void {
    seleccionIds = [...ids];
    L.fijarSeleccion(seleccionEls());
    panel.actualizar();
  }
  function refrescarSeleccion(): void {
    const existentes = new Set(store.estado.elementos.map((e) => e.id));
    seleccionIds = seleccionIds.filter((i) => existentes.has(i));
    L.fijarSeleccion(seleccionEls());
    panel.actualizar();
  }

  // --- Barra --------------------------------------------------------------------
  function actualizarBarra(): void {
    const paleta = PALETAS[temaActual()];
    bDeshacer.disabled = !store.puedeDeshacer;
    bRehacer.disabled = !store.puedeRehacer;
    bTema.textContent = temaActual() === 'oscuro' ? 'Tema claro' : 'Tema oscuro';
    for (const [m, fila] of filasHerr) fila.hidden = m !== modo;
    for (const [m, b] of botonesModo) b.setAttribute('aria-pressed', String(m === modo));
    for (const { def, b } of botonesHerr) b.setAttribute('aria-pressed', String(botonActivo(def, herramienta, tipoObjeto)));
    bImagen.hidden = modo !== 'dibujar';
    bRoce.setAttribute('aria-pressed', String(conRoce));
    bSim.setAttribute('aria-pressed', String(simPanel.abierto));
    for (const [k, b] of botonesColor) {
      b.style.setProperty('--muestra', colorDeTinta(paleta, k));
      b.setAttribute('aria-pressed', String(k === colorTinta));
    }
    for (const [k, b] of botonesLuz) {
      b.style.setProperty('--muestra', colorDeTinta(paleta, k));
      b.setAttribute('aria-pressed', String(k === colorLuz));
    }
    const sinPincel = ['seleccionar', 'mano', 'borrador', 'vector', 'ejes', 'objeto'].includes(herramienta);
    grupoTinta.hidden = esLuz() || sinPincel || modo !== 'dibujar';
    grupoLuz.hidden = !esLuz() || modo !== 'dibujar';
    grupoGrosor.hidden = sinPincel || modo !== 'dibujar';
    if (document.activeElement !== entradaEscala) entradaEscala.value = String(Math.round(L.camara.escala));
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

  function elegirModo(m: Modo): void {
    elegirBoton(m, ultimaDeModo.get(m)!);
  }
  function elegirBoton(m: Modo, d: DefBoton): void {
    modo = m;
    ultimaDeModo.set(m, d);
    if (d.objeto) tipoObjeto = d.objeto;
    elegirHerramienta(d.herramienta);
  }
  function elegirHerramienta(h: Herramienta): void {
    cancelarToques();
    herramienta = h;
    modo = modoDe(h, tipoObjeto, modo);
    if (h !== 'seleccionar' && seleccionIds.length > 0) seleccionar([]);
    actualizarBarra();
    panel.actualizar();
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
    elementos: escena,
    previsualizar(v0, o0) {
      // Lo que está unido a lo que se arrastra (cuerdas, resortes) se redibuja siguiéndolo.
      // La cuerda en construcción se muestra con su camino por las poleas.
      const lista: readonly Elemento[] = (v0 === null ? [] : Array.isArray(v0) ? (v0 as readonly Elemento[]) : [v0 as Elemento]).map((x) =>
        resolverElemento(x, store.estado.elementos),
      );
      arrastrando = lista.length > 0;
      const deps = dependientes(store.estado.elementos, lista);
      const v = deps.length > 0 ? [...lista, ...deps] : lista;
      const o = deps.length > 0 ? new Set([...o0, ...deps.map((d) => d.id)]) : o0;
      L.fijarVivo(v, o);
      transmision?.difusor.vivo(v, o);
      // Al arrastrar una selección, el recuadro acompaña a lo que se mueve.
      const moviendo = herramienta === 'seleccionar' && lista.length > 0;
      L.fijarSeleccion(moviendo ? lista : seleccionEls());
      // Una vista previa que termina borra lo que había: si hay simulación, se vuelve a mostrar.
      if (lista.length === 0) simPanel.repintar();
    },
    confirmar: confirmarElemento,
    borrar: (ids) => emitirLote({ borrar: ids }),
    pedirTexto: (p) => editarTexto(p),
    rolVector: () => rolVector,
    tipoObjeto: () => tipoObjeto,
    acomodar: (e) => (e.tipo === 'bloque' || e.tipo === 'esfera' ? apoyar(e, store.estado.elementos) : e),
    refActual,
    seleccion: seleccionEls,
    seleccionar,
    editar: emitirLote,
    iman: (p, excluir) => iman(p, escena(), radioIman(), excluir),
    regionPaso: (p) => regionDePaso(p, escena(), margenPaso()),
    apuntar: (p) => {
      puntero = p;
      L.pedirCuadro();
    },
    tipoPuntero: (t) => (tactil = t === 'touch'),
    cancelarToques: () => cancelarToques(),
    toqueConexion: (p) => {
      const tipo = tipoObjeto === 'resorte' ? 'resorte' : 'cuerda';
      const r = toque(pendiente, tipo, p, escena(), radioIman(), margenPaso(), (a, b, extra) =>
        tipo === 'cuerda' ? crearCuerda(a, b, extra) : crearResorte(a, b, extra),
      );
      if (r.k === 'pendiente') {
        pendiente = r.c;
        guia.mostrar(
          tipo === 'resorte'
            ? 'Resorte: toca el otro extremo.'
            : r.c.pasos.length === 0
              ? 'Cuerda: toca la polea por donde pasa, o el otro extremo.'
              : 'Cuerda: toca otra polea, o el otro extremo.',
        );
      } else {
        pendiente = null;
        guia.ocultar();
        confirmarElemento(r.elemento);
      }
      L.pedirCuadro();
    },
  });

  /** Guía de la conexión toque a toque: qué tocar ahora, y cómo cancelar. */
  const guia = (() => {
    const el = document.createElement('div');
    el.className = 'guia-toques';
    el.setAttribute('role', 'status');
    el.hidden = true;
    const texto = document.createElement('span');
    const bCancelar = boton('Cancelar', 'Cancela la conexión empezada', () => cancelarToques());
    el.append(texto, bCancelar);
    zona.append(el);
    return {
      mostrar: (t: string) => {
        texto.textContent = t;
        el.hidden = false;
      },
      ocultar: () => (el.hidden = true),
    };
  })();
  function cancelarToques(): void {
    if (!pendiente) return;
    pendiente = null;
    guia.ocultar();
    L.pedirCuadro();
  }

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
    const elementos = (): readonly Elemento[] => escena();

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
    if ((k === 'delete' || k === 'backspace') && seleccionIds.length > 0) {
      e.preventDefault();
      emitirLote({ borrar: [...seleccionIds] });
    } else if (k === 'escape' && pendiente) {
      cancelarToques();
    } else if (k === 'escape' && seleccionIds.length > 0) {
      seleccionar([]);
    } else if (mod && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) store.rehacer();
      else store.deshacer();
    } else if (mod && k === 'y') {
      e.preventDefault();
      store.rehacer();
    } else if (!mod && !e.altKey) {
      const d = botonDeAtajo(k, modo);
      if (d) {
        elegirBoton(d.modo, d.def);
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

  problemas.actualizar();
  store.suscribir(() => {
    problemas.actualizar();
    L.invalidar();
    refrescarSeleccion();
    simPanel.alCambiarEscena();
  });
}
