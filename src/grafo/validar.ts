import type { Elemento } from '../core/elementos';
import { cajaDe, cajasSeCruzan } from '../core/elementos';
import { apoyoEn } from '../physics/dcl';
import { normalSuperficie } from '../physics/objetos';
import type { CuerpoG, ExtremoG } from './lector';
import { leerGrafo } from './lector';
import { geometriaRuta } from './ruta';

/**
 * Problemas de la escena: todo lo que la simulación no puede usar, o usa de una forma que conviene saber, dicho
 * con el elemento al que se refiere. Es puro y se puede llamar en cada cambio. «Lo que se ve es lo que se simula»:
 * nada se ignora en silencio.
 *
 * `arreglo` describe la corrección automática posible; la interfaz que la ofrece llega en la Fase 2.
 */

export type TipoProblema =
  | 'sin-cuerpos'
  | 'extremo-suelto'
  | 'extremo-huerfano'
  | 'sin-efecto'
  | 'ruta-imposible'
  | 'apoyo-lejano'
  | 'superpuestos'
  | 'masa-invalida'
  | 'polea-sin-cuerda'
  | 'fuerza-sin-cuerpo';

export type Arreglo = 'fijar-extremo' | 'quitar-apoyo' | 'apoyar' | 'separar';

export interface Problema {
  tipo: TipoProblema;
  /** `error`: la simulación no puede usar ese elemento; `aviso`: lo usa, pero conviene saberlo. */
  gravedad: 'error' | 'aviso';
  elementos: string[];
  texto: string;
  arreglo?: Arreglo;
}

/** Distancia máxima entre un cuerpo y la superficie de su apoyo (la misma que respeta el motor). */
const APOYO_MAXIMO = 0.3;

function nombre(e: Elemento, todos: readonly Elemento[]): string {
  const n = todos.filter((x) => x.tipo === e.tipo).indexOf(e) + 1;
  switch (e.tipo) {
    case 'bloque':
    case 'esfera':
      return e.etiqueta.trim() ? `el ${e.tipo} $${e.etiqueta.trim()}$` : `el ${e.tipo} ${n}`;
    case 'cuerda':
      return `la cuerda ${n}`;
    case 'resorte':
      return `el resorte ${n}`;
    case 'polea':
      return `la polea ${n}`;
    case 'vector':
      return e.etiqueta.trim() ? `la fuerza $${e.etiqueta.trim()}$` : `la fuerza ${n}`;
    default:
      return 'un elemento';
  }
}

const mayus = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
/** Terminación de género del nombre: «la cuerda unida», «el resorte unido». */
const o = (e: Elemento): string => (e.tipo === 'cuerda' || e.tipo === 'polea' || e.tipo === 'vector' ? 'a' : 'o');

export function validar(entrada: readonly Elemento[]): Problema[] {
  const g = leerGrafo(entrada);
  const todos = g.elementos;
  const out: Problema[] = [];
  if (g.cuerpos.length === 0) out.push({ tipo: 'sin-cuerpos', gravedad: 'aviso', elementos: [], texto: 'No hay cuerpos (bloques o esferas) para simular.' });

  const piezas = [...g.cuerdas.map((c) => ({ el: c.el, ext: c.ext })), ...g.resortes.map((r) => ({ el: r.el, ext: r.ext }))];
  for (const { el, ext } of piezas) {
    const n = nombre(el, todos);
    const sueltos = ext.filter((x): x is Extract<ExtremoG, { k: 'suelto' }> => x.k === 'suelto');
    if (sueltos.some((x) => x.huerfano)) {
      out.push({ tipo: 'extremo-huerfano', gravedad: 'error', elementos: [el.id], texto: `${mayus(n)} estaba unid${o(el)} a algo que ya no existe: no ejerce fuerza.`, arreglo: 'fijar-extremo' });
      continue;
    }
    if (sueltos.length > 0) {
      out.push({ tipo: 'extremo-suelto', gravedad: 'error', elementos: [el.id], texto: `${mayus(n)} tiene un extremo suelto: no ejerce fuerza hasta que lo unas a algo o lo fijes.`, arreglo: 'fijar-extremo' });
      continue;
    }
    const [a, b] = ext;
    const conCuerpo = a.k === 'cuerpo' || b.k === 'cuerpo';
    const mismo = a.k === 'cuerpo' && b.k === 'cuerpo' && a.cuerpo.id === b.cuerpo.id;
    if (!conCuerpo || mismo) {
      out.push({
        tipo: 'sin-efecto',
        gravedad: 'aviso',
        elementos: [el.id],
        texto: mismo ? `${mayus(n)} ata un cuerpo consigo mismo: no hace nada.` : `${mayus(n)} no está unid${o(el)} a ningún cuerpo: no hace nada.`,
      });
    }
  }

  for (const c of g.cuerdas) {
    if (c.pasos.length === 0) continue;
    if (!geometriaRuta(c.el.a, c.pasos, c.el.b).valida) {
      out.push({ tipo: 'ruta-imposible', gravedad: 'error', elementos: [c.el.id], texto: `${mayus(nombre(c.el, todos))} no puede pasar por su polea así: un extremo queda dentro de ella, o dos poleas se tocan.` });
    }
  }

  for (const c of g.cuerpos) {
    const n = nombre(c, todos);
    if (!(c.masa > 0)) out.push({ tipo: 'masa-invalida', gravedad: 'error', elementos: [c.id], texto: `${mayus(n)} no tiene masa positiva.` });
    const id = c.apoyo?.[0];
    const s = id ? g.porId.get(id) : undefined;
    if (s?.tipo === 'superficie') {
      const nrm = normalSuperficie(s);
      const d = Math.abs((c.centro.x - s.a.x) * nrm.x + (c.centro.y - s.a.y) * nrm.y);
      if (Math.abs(d - apoyoEn(c, nrm)) > APOYO_MAXIMO) {
        out.push({ tipo: 'apoyo-lejano', gravedad: 'aviso', elementos: [c.id, s.id], texto: `${mayus(n)} figura apoyado en una superficie que quedó lejos: parte en el aire.`, arreglo: 'quitar-apoyo' });
      }
    }
  }

  // Cuerpos superpuestos: la simulación no los hace chocar (todavía), así que se atraviesan.
  const cajas = g.cuerpos.map((c) => ({ c, k: cajaInterior(c) }));
  for (let i = 0; i < cajas.length; i++) {
    for (let j = i + 1; j < cajas.length; j++) {
      if (cajasSeCruzan(cajas[i]!.k, cajas[j]!.k)) {
        const [p, q] = [cajas[i]!.c, cajas[j]!.c];
        out.push({ tipo: 'superpuestos', gravedad: 'aviso', elementos: [p.id, q.id], texto: `${mayus(nombre(p, todos))} y ${nombre(q, todos)} se superponen: en la simulación se atraviesan.`, arreglo: 'separar' });
      }
    }
  }

  const usadas = new Set(g.cuerdas.flatMap((c) => (c.el.ruta ?? []).map((p) => p.el)));
  const ejes = new Set(
    [...g.cuerdas.map((c) => c.el), ...g.resortes.map((r) => r.el)].flatMap((e) => (e.union ?? []).flatMap((u) => (u && 'el' in u ? [u.el] : []))),
  );
  for (const e of todos) {
    if (e.tipo === 'polea' && !usadas.has(e.id) && !ejes.has(e.id)) {
      out.push({ tipo: 'polea-sin-cuerda', gravedad: 'aviso', elementos: [e.id], texto: `Ninguna cuerda pasa por ${nombre(e, todos)}: no hace nada.` });
    }
    if (e.tipo === 'vector' && e.rol === 'aplicada' && !e.fantasma && e.cuerpo === null) {
      out.push({ tipo: 'fuerza-sin-cuerpo', gravedad: 'aviso', elementos: [e.id], texto: `${mayus(nombre(e, todos))} no sale de ningún cuerpo: no actúa sobre nada.` });
    }
  }
  return out;
}

/** Caja del cuerpo un poco menor que la real, para no contar como superposición dos cuerpos que solo se tocan. */
function cajaInterior(c: CuerpoG) {
  const k = cajaDe(c);
  const m = 0.03 + 0.01;
  return { x0: k.x0 + m, y0: k.y0 + m, x1: k.x1 - m, y1: k.y1 - m };
}
