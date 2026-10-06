import type { Elemento } from '../core/elementos';
import { numeroEs } from '../physics/vectores';
import { sinMarcas } from './problemas';

/**
 * Descripciones en texto de la escena y de lo seleccionado, para lectores de pantalla (Fase 5). Puras: se prueban sin DOM.
 */

const NOMBRES: Partial<Record<Elemento['tipo'], [string, string]>> = {
  bloque: ['bloque', 'bloques'],
  esfera: ['esfera', 'esferas'],
  polea: ['polea', 'poleas'],
  superficie: ['superficie', 'superficies'],
  cuerda: ['cuerda', 'cuerdas'],
  resorte: ['resorte', 'resortes'],
  vector: ['vector', 'vectores'],
  ejes: ['sistema de ejes', 'sistemas de ejes'],
  trazo: ['trazo', 'trazos'],
  texto: ['texto', 'textos'],
  imagen: ['imagen', 'imágenes'],
  linea: ['línea', 'líneas'],
  flecha: ['flecha', 'flechas'],
  rect: ['rectángulo', 'rectángulos'],
  elipse: ['elipse', 'elipses'],
};

/** «2 bloques, 1 polea y 1 cuerda», o «La pizarra está vacía». */
export function resumenEscena(escena: readonly Elemento[]): string {
  if (escena.length === 0) return 'La pizarra está vacía.';
  const cuenta = new Map<Elemento['tipo'], number>();
  for (const e of escena) cuenta.set(e.tipo, (cuenta.get(e.tipo) ?? 0) + 1);
  const partes = [...cuenta].map(([t, n]) => `${n} ${(NOMBRES[t] ?? [t, t])[n === 1 ? 0 : 1]}`);
  const lista = partes.length === 1 ? partes[0]! : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)!}`;
  return `En la pizarra: ${lista}.`;
}

const m = (n: number): string => `${numeroEs(Math.round(n * 100) / 100)} m`;

/** Una frase sobre un elemento: qué es, su etiqueta, sus datos principales y dónde está. */
export function describirElemento(e: Elemento): string {
  switch (e.tipo) {
    case 'bloque':
    case 'esfera': {
      const et = e.etiqueta.trim() ? ` ${sinMarcas(e.etiqueta)}` : '';
      const apoyado = (e.apoyo?.length ?? 0) > 0 ? ', apoyado' : '';
      return `${e.tipo === 'bloque' ? 'Bloque' : 'Esfera'}${et} de ${numeroEs(e.masa)} kg en x = ${m(e.centro.x)}, y = ${m(e.centro.y)}${apoyado}${e.gira ? ', gira' : ''}`;
    }
    case 'polea':
      return `Polea de radio ${m(e.radio)}${e.masa ? ` y ${numeroEs(e.masa)} kg` : ''}${e.montaje ? ', móvil' : ''} en x = ${m(e.centro.x)}, y = ${m(e.centro.y)}`;
    case 'superficie': {
      const ang = Math.round((Math.atan2(e.b.y - e.a.y, e.b.x - e.a.x) * 180) / Math.PI);
      const roce = e.muS > 0 || e.muK > 0 ? `, con roce (μs ${numeroEs(e.muS)}, μk ${numeroEs(e.muK)})` : ', sin roce';
      return `${e.relleno === 'cuna' ? 'Plano inclinado' : 'Superficie'} de ${m(Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y))} a ${ang}°${roce}`;
    }
    case 'cuerda': {
      const unidos = (e.union ?? []).filter((u) => u && 'el' in u).length;
      return `Cuerda${(e.ruta?.length ?? 0) > 0 ? ` que pasa por ${e.ruta!.length} ${e.ruta!.length === 1 ? 'polea' : 'poleas'}` : ''}, con ${unidos} ${unidos === 1 ? 'extremo unido' : 'extremos unidos'}`;
    }
    case 'resorte':
      return `Resorte de constante ${numeroEs(e.k)} N/m y largo natural ${m(e.largoNatural)}`;
    case 'vector':
      return `Vector ${sinMarcas(e.etiqueta)}`.trim();
    default:
      return (NOMBRES[e.tipo]?.[0] ?? e.tipo).replace(/^./, (c) => c.toUpperCase());
  }
}

/** Lo que anuncia el lector de pantalla al seleccionar con el teclado. */
export function anunciarSeleccion(sel: readonly Elemento[]): string {
  if (sel.length === 0) return 'Nada seleccionado.';
  const ayuda = 'Flechas para mover, coma y punto para girar, Enter para editar, Supr para borrar.';
  if (sel.length > 1) return `${sel.length} elementos seleccionados. ${ayuda}`;
  return `${describirElemento(sel[0]!)}. ${ayuda}`;
}
