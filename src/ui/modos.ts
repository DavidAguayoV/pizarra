import type { Herramienta } from '../ink/herramientas';
import type { TipoObjeto } from '../physics/objetos';

/**
 * La barra se organiza en **modos** (Nivel 2): cada uno muestra solo sus herramientas, así cabe en una fila y
 * en el celular. Simular no es un modo de edición: abre y cierra el panel de simulación.
 *
 *   Dibujar   tinta y formas (lo de la Etapa 1)
 *   Armar     piezas físicas de tamaño fijo, superficies, ejes y vectores
 *   Conectar  cuerdas y resortes, con imanes que muestran a qué se unen
 */

export type Modo = 'dibujar' | 'armar' | 'conectar';

export const MODOS: ReadonlyArray<{ clave: Modo; etiqueta: string; icono: string }> = [
  { clave: 'dibujar', etiqueta: 'Dibujar', icono: '✎' },
  { clave: 'armar', etiqueta: 'Armar', icono: '▣' },
  { clave: 'conectar', etiqueta: 'Conectar', icono: '⌇' },
];

export interface DefBoton {
  /** Clave única del botón (herramienta, u `objeto:<tipo>`). */
  clave: string;
  etiqueta: string;
  herramienta: Herramienta;
  objeto?: TipoObjeto;
  /** Atajo de teclado (una letra). */
  atajo?: string;
}

const h = (herramienta: Herramienta, etiqueta: string, atajo?: string): DefBoton => ({ clave: herramienta, etiqueta, herramienta, ...(atajo ? { atajo } : {}) });
const o = (objeto: TipoObjeto, etiqueta: string, atajo?: string): DefBoton => ({ clave: `objeto:${objeto}`, etiqueta, herramienta: 'objeto', objeto, ...(atajo ? { atajo } : {}) });

export const BOTONES_MODO: Readonly<Record<Modo, readonly DefBoton[]>> = {
  dibujar: [
    h('seleccionar', 'Seleccionar', 'S'),
    h('lapiz', 'Lápiz', 'P'),
    h('resaltador', 'Resaltador', 'H'),
    h('borrador', 'Borrador', 'B'),
    h('linea', 'Línea', 'L'),
    h('flecha', 'Flecha', 'F'),
    h('rect', 'Rectángulo', 'R'),
    h('elipse', 'Elipse', 'O'),
    h('texto', 'Texto', 'T'),
    h('mano', 'Mover vista', 'M'),
  ],
  armar: [
    h('seleccionar', 'Seleccionar', 'S'),
    o('bloque', 'Bloque', 'K'),
    o('esfera', 'Esfera', 'E'),
    o('polea', 'Polea', 'Y'),
    o('superficie', 'Superficie', 'U'),
    o('plano', 'Plano inclinado', 'I'),
    h('ejes', 'Ejes', 'X'),
    h('vector', 'Vector', 'V'),
    h('borrador', 'Borrador', 'B'),
    h('mano', 'Mover vista', 'M'),
  ],
  conectar: [
    h('seleccionar', 'Seleccionar', 'S'),
    o('cuerda', 'Cuerda', 'C'),
    o('resorte', 'Resorte', 'Z'),
    h('borrador', 'Borrador', 'B'),
    h('mano', 'Mover vista', 'M'),
  ],
};

/** Herramienta con la que empieza cada modo la primera vez. */
export const INICIAL_MODO: Readonly<Record<Modo, DefBoton>> = {
  dibujar: BOTONES_MODO.dibujar[1]!,
  armar: BOTONES_MODO.armar[1]!,
  conectar: BOTONES_MODO.conectar[1]!,
};

/** ¿El botón corresponde a la herramienta activa? */
export function botonActivo(d: DefBoton, herramienta: Herramienta, objeto: TipoObjeto): boolean {
  return d.herramienta === herramienta && (d.objeto === undefined || d.objeto === objeto);
}

/** Modo al que pertenece una herramienta (las comunes a varios modos no cambian el modo actual). */
export function modoDe(herramienta: Herramienta, objeto: TipoObjeto, actual: Modo): Modo {
  if (BOTONES_MODO[actual].some((d) => botonActivo(d, herramienta, objeto))) return actual;
  for (const m of MODOS) if (BOTONES_MODO[m.clave].some((d) => botonActivo(d, herramienta, objeto))) return m.clave;
  return actual;
}

/** Botón que corresponde a una tecla, buscando primero en el modo actual. */
export function botonDeAtajo(tecla: string, actual: Modo): { modo: Modo; def: DefBoton } | null {
  const t = tecla.toUpperCase();
  const orden: Modo[] = [actual, ...MODOS.map((m) => m.clave).filter((m) => m !== actual)];
  for (const m of orden) {
    const def = BOTONES_MODO[m].find((d) => d.atajo === t);
    if (def) return { modo: m, def };
  }
  return null;
}
