import type { Elemento } from '../core/elementos';
import { nuevoIdElemento } from '../core/elementos';
import { temaActual } from '../core/tema';
import { G_POR_DEFECTO } from '../physics/dcl';
import { numeroEs } from '../physics/vectores';
import { copiarTexto, descargarTexto } from '../export/descarga';
import { elementosAnimados } from '../sim/animacion';
import type { Analitica } from '../sim/analitico';
import { errorMaximo, solucionAnalitica } from '../sim/analitico';
import { validar } from '../grafo/validar';
import { construirModelo } from '../sim/modelo';
import { Simulacion } from '../sim/motor';
import type { CampoGrafico } from '../sim/series';
import { aCsv, CAMPOS_GRAFICO, filasTabla, graficoATikz, graficoDe } from '../sim/series';
import { dibujarGrafico } from './grafico';
import { PALETAS } from './tokens';

/** Lo que el panel necesita de la aplicación. */
export interface AnfitrionSim {
  elementos(): readonly Elemento[];
  /** Cambia cada vez que cambia la escena (para reiniciar la simulación). */
  version(): number;
  /** Lo que se anima en esta pizarra, y qué originales se ocultan mientras tanto. */
  fijarVivo(locales: readonly Elemento[], ocultos: ReadonlySet<string>): void;
  /** Lo que se envía a los estudiantes (`null` = ya no hay simulación). */
  transmitir(red: readonly Elemento[] | null, ocultos: ReadonlySet<string>): void;
  agregarElementos(els: Elemento[]): void;
  avisar(texto: string): void;
  /** El panel cambió de tamaño (compacto / con detalles). */
  alCambiarTamano?(): void;
}

const VELOCIDADES = [0.1, 0.25, 0.5, 1, 2, 4] as const;
const T_MAX = 600;
const PERIODO_GRAFICOS_MS = 40;
const PERIODO_TABLA_MS = 250;
import { sinMarcas } from './problemas';

function boton(texto: string, titulo: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = texto;
  b.title = titulo;
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Panel de simulación: corre el modelo dinámico de la escena (ver `src/sim`) y muestra el movimiento
 * sobre la pizarra, con vectores y trayectoria, gráficos, energía, tabla y comparación analítica.
 */
export class PanelSimulacion {
  readonly elemento = document.createElement('section');
  private sim: Simulacion | null = null;
  private analitica: Analitica | null = null;
  private g = G_POR_DEFECTO;
  private indice = 0;
  private campo: CampoGrafico = 'posicion';
  private velocidad = 1;
  private reproduciendo = false;
  private versionEscena = -1;
  private ultimoTs = 0;
  private ultimoGrafico = 0;
  private ultimaTabla = 0;
  private marco = 0;
  private eventosVistos = 0;

  private readonly lienzo = document.createElement('canvas');
  private readonly bPlay: HTMLButtonElement;
  private readonly tiempo = document.createElement('span');
  private readonly info = document.createElement('p');
  private readonly fuerzas = document.createElement('p');
  private readonly mensajes = document.createElement('p');
  private readonly eventos = document.createElement('ol');
  private readonly energia = document.createElement('p');
  private readonly compara = document.createElement('p');
  private readonly cuerpoSel = document.createElement('select');
  private readonly tabla = document.createElement('tbody');
  private readonly chkVectores = document.createElement('input');
  private readonly chkTrayectoria = document.createElement('input');
  private readonly chkAnalitica = document.createElement('input');
  private readonly botonesCampo = new Map<CampoGrafico, HTMLButtonElement>();

  constructor(private readonly host: AnfitrionSim) {
    const el = this.elemento;
    el.className = 'panel-sim';
    el.hidden = true;
    el.setAttribute('aria-label', 'Simulación');

    const cab = document.createElement('div');
    cab.className = 'sim-cab';
    const h = document.createElement('h2');
    h.textContent = 'Simulación';
    this.tiempo.className = 'sim-tiempo';
    this.tiempo.setAttribute('role', 'status');
    // En el celular el panel parte compacto (reproducir, tiempo y tensiones); «Detalles» muestra todo lo demás.
    const bDetalles = boton('Detalles', 'Muestra u oculta gráficos, tabla, opciones y exportación', () => {
      const compacto = !el.classList.contains('compacto');
      el.classList.toggle('compacto', compacto);
      bDetalles.setAttribute('aria-expanded', String(!compacto));
      this.host.alCambiarTamano?.();
    });
    bDetalles.classList.add('sim-detalles');
    const compactoInicial = window.matchMedia('(max-width: 700px)').matches;
    el.classList.toggle('compacto', compactoInicial);
    bDetalles.setAttribute('aria-expanded', String(!compactoInicial));
    cab.append(h, this.tiempo, bDetalles, boton('Cerrar', 'Cierra la simulación', () => this.cerrar()));

    this.bPlay = boton('▶ Reproducir', 'Reproduce o pausa la simulación', () => this.alternar());
    const controles = document.createElement('div');
    controles.className = 'sim-controles';
    const vel = document.createElement('select');
    vel.setAttribute('aria-label', 'Velocidad de reproducción');
    for (const v of VELOCIDADES) vel.append(new Option(`${numeroEs(v)}×`, String(v), false, v === this.velocidad));
    vel.addEventListener('change', () => (this.velocidad = Number(vel.value)));
    const gIn = document.createElement('input');
    gIn.type = 'text';
    gIn.inputMode = 'decimal';
    gIn.value = numeroEs(this.g);
    gIn.setAttribute('aria-label', 'Aceleración de gravedad de la simulación');
    gIn.addEventListener('change', () => {
      const v = Number(gIn.value.replace(',', '.'));
      if (Number.isFinite(v) && v > 0) {
        this.g = v;
        this.construir();
        this.pintar(true);
      } else gIn.value = numeroEs(this.g);
    });
    const etG = document.createElement('label');
    etG.className = 'sim-g';
    etG.append('g (m/s²) ', gIn);
    const bPaso = boton('Paso', 'Avanza 0,05 s', () => this.paso());
    bPaso.classList.add('sim-extra');
    etG.classList.add('sim-extra');
    controles.append(this.bPlay, bPaso, boton('Reiniciar', 'Vuelve al instante inicial', () => this.reiniciar()), vel, etG);

    const opciones = document.createElement('div');
    opciones.className = 'sim-opciones';
    const casilla = (inp: HTMLInputElement, texto: string, valor: boolean, alCambiar: () => void): HTMLLabelElement => {
      inp.type = 'checkbox';
      inp.checked = valor;
      inp.addEventListener('change', alCambiar);
      const l = document.createElement('label');
      l.append(inp, ` ${texto}`);
      return l;
    };
    this.cuerpoSel.setAttribute('aria-label', 'Cuerpo del gráfico y la tabla');
    this.cuerpoSel.addEventListener('change', () => {
      this.indice = Number(this.cuerpoSel.value);
      this.analitica = this.sim ? solucionAnalitica(this.sim, this.indice) : null;
      this.pintar(true);
    });
    opciones.append(
      casilla(this.chkVectores, 'Vectores v y a', true, () => this.pintar(true)),
      casilla(this.chkTrayectoria, 'Trayectoria', true, () => this.pintar(true)),
      casilla(this.chkAnalitica, 'Comparar con la solución analítica', true, () => this.pintar(true)),
      this.cuerpoSel,
    );

    this.info.className = 'sim-info';
    this.fuerzas.className = 'nota';
    this.fuerzas.setAttribute('aria-label', 'Normal, roce y tensiones');
    this.mensajes.className = 'nota';
    this.mensajes.style.whiteSpace = 'pre-line';
    this.mensajes.setAttribute('aria-label', 'Problemas de la escena');
    this.eventos.className = 'sim-eventos';
    this.eventos.setAttribute('aria-label', 'Eventos');
    this.energia.className = 'nota';
    this.compara.className = 'nota';

    const pestanas = document.createElement('div');
    pestanas.className = 'sim-pestanas';
    pestanas.setAttribute('role', 'group');
    pestanas.setAttribute('aria-label', 'Gráfico');
    for (const c of CAMPOS_GRAFICO) {
      const b = boton(c.nombre, `Gráfico de ${c.nombre.toLowerCase()}`, () => {
        this.campo = c.clave;
        this.pintar(true);
      });
      this.botonesCampo.set(c.clave, b);
      pestanas.append(b);
    }
    this.lienzo.className = 'sim-grafico';
    this.lienzo.setAttribute('aria-label', 'Gráfico de la simulación');

    const exportar = document.createElement('div');
    exportar.className = 'sim-exportar';
    exportar.append(
      boton('Descargar CSV', 'Todas las muestras, para Excel', () => this.csv()),
      boton('Copiar TikZ del gráfico', 'pgfplots, para Beamer', () => void this.tikzGrafico(false)),
      boton('Descargar .tex del gráfico', 'Documento standalone con pgfplots', () => void this.tikzGrafico(true)),
      boton('Dejar trayectoria en la pizarra', 'Convierte la trayectoria en un trazo de la pizarra', () => this.dejarTrayectoria()),
    );

    const det = document.createElement('details');
    det.className = 'sim-tabla';
    const sum = document.createElement('summary');
    sum.textContent = 'Tabla de valores';
    const tabla = document.createElement('table');
    const cabT = document.createElement('thead');
    cabT.innerHTML = '<tr><th>t (s)</th><th>x (m)</th><th>y (m)</th><th>v (m/s)</th><th>a (m/s²)</th><th>K (J)</th><th>U<sub>g</sub> (J)</th><th>E (J)</th></tr>';
    tabla.append(cabT, this.tabla);
    const caja = document.createElement('div');
    caja.className = 'sim-tabla-caja';
    caja.append(tabla);
    det.append(sum, caja);

    // Dos columnas: a la izquierda los controles y lo que pasa ahora; a la derecha el gráfico y los números.
    const izq = document.createElement('div');
    izq.className = 'sim-izq';
    izq.append(cab, controles, opciones, this.info, this.fuerzas, this.mensajes, this.eventos, exportar);
    const der = document.createElement('div');
    der.className = 'sim-der';
    der.append(pestanas, this.lienzo, this.compara, this.energia, det);
    el.append(izq, der);
    new ResizeObserver(() => this.pintar(true)).observe(this.lienzo);
  }

  get abierto(): boolean {
    return !this.elemento.hidden;
  }

  // -- ciclo de vida -----------------------------------------------------------------------------------------

  abrir(): void {
    this.elemento.hidden = false;
    this.construir();
    this.pintar(true);
  }

  cerrar(): void {
    this.pausar();
    this.elemento.hidden = true;
    this.host.fijarVivo([], new Set());
    this.host.transmitir(null, new Set());
    this.sim = null;
  }

  /** La escena cambió: se reconstruye el modelo y la simulación vuelve a t = 0. */
  alCambiarEscena(): void {
    if (!this.abierto || this.host.version() === this.versionEscena) return;
    this.pausar();
    this.construir();
    this.pintar(true);
  }

  /** Vuelve a mostrar la animación (por ejemplo, tras una vista previa que la tapó). */
  repintar(): void {
    if (this.abierto) this.pintar(true);
  }

  private construir(): void {
    const modelo = construirModelo(this.host.elementos(), this.g);
    this.versionEscena = this.host.version();
    this.sim = new Simulacion(modelo, { h: 0.001 });
    this.eventosVistos = 0;
    const n = modelo.cuerpos.length;
    this.indice = Math.min(this.indice, Math.max(0, n - 1));
    this.cuerpoSel.replaceChildren(
      ...modelo.cuerpos.map((c, i) => new Option(c.elemento.etiqueta.trim() ? sinMarcas(c.elemento.etiqueta) : `Cuerpo ${i + 1}`, String(i), false, i === this.indice)),
    );
    this.cuerpoSel.hidden = n < 2;
    this.analitica = n > 0 ? solucionAnalitica(this.sim, this.indice) : null;
    // Problemas de la escena (grafo/validar.ts): uno por línea, con el elemento al que se refieren.
    const problemas = validar(this.host.elementos());
    this.mensajes.textContent = problemas.map((p) => `${p.gravedad === 'error' ? '⚠ ' : ''}${sinMarcas(p.texto)}`).join('\n');
    this.bPlay.disabled = n === 0;
  }

  // -- reproducción ---------------------------------------------------------------------------------------------

  private alternar(): void {
    if (this.reproduciendo) this.pausar();
    else this.reproducir();
  }

  private reproducir(): void {
    if (!this.sim || this.reproduciendo) return;
    this.reproduciendo = true;
    this.bPlay.textContent = '⏸ Pausar';
    this.ultimoTs = performance.now();
    this.marco = requestAnimationFrame((t) => this.cuadro(t));
  }

  private pausar(): void {
    this.reproduciendo = false;
    cancelAnimationFrame(this.marco);
    this.bPlay.textContent = '▶ Reproducir';
  }

  private reiniciar(): void {
    if (!this.sim) return;
    this.pausar();
    this.sim.reiniciar();
    this.eventosVistos = 0;
    this.pintar(true);
  }

  private paso(): void {
    if (!this.sim) return;
    this.pausar();
    this.sim.avanzar(0.05);
    this.pintar(true);
  }

  private cuadro(ts: number): void {
    if (!this.reproduciendo || !this.sim) return;
    const dt = Math.min(0.1, (ts - this.ultimoTs) / 1000);
    this.ultimoTs = ts;
    this.sim.avanzar(dt * this.velocidad);
    if (this.sim.estado.t >= T_MAX) {
      this.pausar();
      this.host.avisar('La simulación llegó al límite de 10 minutos de tiempo simulado.');
    } else if (this.sim.detenida) {
      this.pausar();
      this.host.avisar(sinMarcas(this.sim.detenida) + '.');
    }
    this.pintar(false);
    if (this.reproduciendo) this.marco = requestAnimationFrame((t) => this.cuadro(t));
  }

  // -- dibujo ---------------------------------------------------------------------------------------------------------

  private pintar(forzar: boolean): void {
    const sim = this.sim;
    if (!sim || !this.abierto) return;
    const anim = elementosAnimados(sim, this.host.elementos(), { vectores: this.chkVectores.checked, trayectoria: this.chkTrayectoria.checked });
    this.host.fijarVivo(anim.locales, anim.ocultos);
    this.host.transmitir(anim.red, anim.ocultos);

    const e = sim.estado;
    this.tiempo.textContent = `t = ${numeroEs(e.t)} s`;
    const n = sim.modelo.cuerpos.length;
    if (n === 0) {
      this.info.textContent = 'Agrega un bloque o una esfera (herramienta Cuerpos) para simular.';
      return;
    }
    const i = this.indice;
    const c = sim.modelo.cuerpos[i]!;
    const v = Math.hypot(e.v[i]!.x, e.v[i]!.y);
    this.info.textContent = `${c.elemento.etiqueta.trim() ? sinMarcas(c.elemento.etiqueta) : `Cuerpo ${i + 1}`}: x = ${numeroEs(e.p[i]!.x)} m; y = ${numeroEs(e.p[i]!.y)} m; v = ${numeroEs(v)} m/s; ${sim.descripcion(i)}`;

    // Normal, roce y tensiones en este instante
    const partes: string[] = [];
    if (e.modo[i]!.k !== 'libre') partes.push(`N = ${numeroEs(e.N[i]!)} N`);
    if (Math.abs(e.fric[i]!) > 1e-9) partes.push(`f = ${numeroEs(Math.abs(e.fric[i]!))} N`);
    sim.modelo.cuerdas.forEach((_, k) => partes.push(e.cuerdaActiva[k] ? `T${sim.modelo.cuerdas.length > 1 ? k + 1 : ''} = ${numeroEs(e.T[k]!)} N` : `cuerda${sim.modelo.cuerdas.length > 1 ? ` ${k + 1}` : ''} floja`));
    this.fuerzas.textContent = partes.join(' · ');

    // Eventos nuevos
    if (sim.eventos.length !== this.eventosVistos) {
      this.eventosVistos = sim.eventos.length;
      this.eventos.replaceChildren(
        ...sim.eventos.slice(-6).map((ev) => {
          const li = document.createElement('li');
          li.textContent = `t = ${numeroEs(ev.t)} s · ${sinMarcas(ev.texto)}`;
          return li;
        }),
      );
    }

    const ahora = performance.now();
    if (forzar || ahora - this.ultimoGrafico >= PERIODO_GRAFICOS_MS) {
      this.ultimoGrafico = ahora;
      this.pintarGrafico();
      const en = sim.energiaActual();
      this.energia.textContent = `K = ${numeroEs(en.K)} J · U_g = ${numeroEs(en.Ug)} J · U_e = ${numeroEs(en.Ue)} J · E_mec = ${numeroEs(en.E)} J · W no conservativo = ${numeroEs(en.Wnc)} J · balance E − E₀ − W = ${en.residuo.toExponential(1).replace('.', ',')} J`;
      this.pintarComparacion();
      for (const [k, b] of this.botonesCampo) b.setAttribute('aria-pressed', String(k === this.campo));
    }
    if (forzar || ahora - this.ultimaTabla >= PERIODO_TABLA_MS) {
      this.ultimaTabla = ahora;
      const cada = Math.max(0.1, e.t / 150);
      this.tabla.replaceChildren(
        ...filasTabla(sim, i, cada, 200).map((f) => {
          const tr = document.createElement('tr');
          for (const x of [f.t, f.x, f.y, f.v, f.a, f.K, f.Ug, f.E]) {
            const td = document.createElement('td');
            td.textContent = numeroEs(x);
            tr.append(td);
          }
          return tr;
        }),
      );
    }
  }

  private pintarGrafico(): void {
    const sim = this.sim;
    if (!sim) return;
    const dpr = window.devicePixelRatio || 1;
    const w = this.lienzo.clientWidth;
    const h = this.lienzo.clientHeight;
    if (w < 10 || h < 10) return;
    if (this.lienzo.width !== Math.round(w * dpr) || this.lienzo.height !== Math.round(h * dpr)) {
      this.lienzo.width = Math.round(w * dpr);
      this.lienzo.height = Math.round(h * dpr);
    }
    const ctx = this.lienzo.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = graficoDe(sim, this.indice, this.campo, this.chkAnalitica.checked ? this.analitica : null);
    dibujarGrafico(ctx, w, h, g, { paleta: PALETAS[temaActual()], tActual: sim.estado.t });
  }

  private pintarComparacion(): void {
    const sim = this.sim;
    if (!sim) return;
    if (!this.analitica) {
      this.compara.textContent = 'No hay solución analítica para esta escena (con cuerdas, roce en resortes o varios resortes); la simulación sigue siendo válida.';
      return;
    }
    const err = errorMaximo(sim, this.indice, this.analitica);
    const hasta = Number.isFinite(this.analitica.validoHasta) ? ` (vale hasta t = ${numeroEs(this.analitica.validoHasta)} s)` : '';
    this.compara.textContent = `${this.analitica.descripcion}${hasta}. Diferencia máxima con la simulación: ${err.posicion.toExponential(1).replace('.', ',')} m en posición, ${err.velocidad.toExponential(1).replace('.', ',')} m/s en velocidad.`;
  }

  // -- exportación ------------------------------------------------------------------------------------------------------

  private marca(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  private csv(): void {
    if (!this.sim) return;
    descargarTexto(`simulacion-${this.marca()}.csv`, '﻿' + aCsv(this.sim), 'text/csv');
  }

  private async tikzGrafico(documento: boolean): Promise<void> {
    if (!this.sim) return;
    const g = graficoDe(this.sim, this.indice, this.campo, this.chkAnalitica.checked ? this.analitica : null);
    const codigo = graficoATikz(g, { modo: documento ? 'documento' : 'fragmento' });
    if (documento) descargarTexto(`grafico-${this.campo}-${this.marca()}.tex`, codigo, 'application/x-tex');
    else this.host.avisar((await copiarTexto(codigo)) ? 'TikZ del gráfico copiado (requiere pgfplots).' : 'No se pudo copiar; usa "Descargar .tex".');
  }

  private dejarTrayectoria(): void {
    if (!this.sim) return;
    const anim = elementosAnimados(this.sim, this.host.elementos(), { vectores: false, trayectoria: true });
    const trazos = anim.locales.filter((e) => e.id.startsWith('sim-tray-')).map((e) => ({ ...e, id: nuevoIdElemento() }));
    if (trazos.length === 0) {
      this.host.avisar('Todavía no hay trayectoria: reproduce o avanza la simulación.');
      return;
    }
    this.host.agregarElementos(trazos);
    this.host.avisar('Trayectoria agregada a la pizarra (la simulación vuelve a t = 0 porque la escena cambió).');
  }
}
