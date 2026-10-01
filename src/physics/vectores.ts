import type { Punto } from '../core/camara';
import type { Caja2D, Ejes, Vector } from '../core/elementos';
import { cajaDe, nuevoIdElemento, unirCajas } from '../core/elementos';
import type { CajaMat } from '../core/matematica';
import { componerMat, etiquetaComponente } from '../core/matematica';
import type { RolFisico } from '../ui/tokens';

/**
 * Geometría y física de vectores y sistemas de referencia. Todo son funciones puras:
 * el dibujo y las exportaciones usan exactamente estos cálculos.
 */

// --- Roles ----------------------------------------------------------------------------------------

export const ROLES_VECTOR = ['peso', 'normal', 'tension', 'friccion', 'aplicada', 'velocidad', 'acel', 'momento', 'resultante'] as const;
export type RolVector = Extract<RolFisico, (typeof ROLES_VECTOR)[number]>;

export interface EstiloRol {
  nombre: string;
  /** Etiqueta por defecto, en LaTeX. */
  etiqueta: string;
  unidad: string;
  /** Unidades físicas por metro de flecha (así un peso de 50 N no sale de la pantalla). */
  porMetro: number;
  atajo: string;
}

/** Convención de los videos: el color sale del rol, y cada rol trae su letra y su unidad. */
export const ESTILO_ROL: Readonly<Record<RolVector, EstiloRol>> = {
  peso: { nombre: 'Peso', etiqueta: 'm\\vec{g}', unidad: 'N', porMetro: 10, atajo: 'W' },
  normal: { nombre: 'Normal', etiqueta: '\\vec{N}', unidad: 'N', porMetro: 10, atajo: 'N' },
  tension: { nombre: 'Tensión', etiqueta: '\\vec{T}', unidad: 'N', porMetro: 10, atajo: 'E' },
  friccion: { nombre: 'Roce', etiqueta: '\\vec{f}', unidad: 'N', porMetro: 10, atajo: 'C' },
  aplicada: { nombre: 'Fuerza aplicada', etiqueta: '\\vec{F}', unidad: 'N', porMetro: 10, atajo: 'U' },
  velocidad: { nombre: 'Velocidad', etiqueta: '\\vec{v}', unidad: 'm/s', porMetro: 2, atajo: 'Y' },
  acel: { nombre: 'Aceleración', etiqueta: '\\vec{a}', unidad: 'm/s²', porMetro: 2, atajo: 'A' },
  momento: { nombre: 'Momento lineal', etiqueta: '\\vec{p}', unidad: 'kg·m/s', porMetro: 5, atajo: 'Q' },
  resultante: { nombre: 'Resultante', etiqueta: '\\vec{R}', unidad: 'N', porMetro: 10, atajo: 'S' },
};

export const GROSOR_VECTOR = 0.03;
export const TAM_ETIQUETA = 0.2;

// --- Construcción ------------------------------------------------------------------------------------

export function crearVector(rol: RolVector, a: Punto, b: Punto, extra: Partial<Vector> = {}): Vector {
  const e = ESTILO_ROL[rol];
  return {
    id: nuevoIdElemento(),
    tipo: 'vector',
    rol,
    a,
    b,
    grosor: GROSOR_VECTOR,
    etiqueta: e.etiqueta,
    unidad: e.unidad,
    porMetro: e.porMetro,
    mostrarValor: false,
    componentes: false,
    angulo: false,
    etiquetaAngulo: '\\theta',
    ref: null,
    fantasma: false,
    ...extra,
  };
}

export function crearEjes(origen: Punto, angulo = 0, largo = 1.5, extra: Partial<Ejes> = {}): Ejes {
  return {
    id: nuevoIdElemento(),
    tipo: 'ejes',
    color: 'tinta',
    origen,
    angulo,
    largo,
    grosor: 0.014,
    etiquetaX: 'x',
    etiquetaY: 'y',
    ...extra,
  };
}

// --- Medidas y marcos de referencia --------------------------------------------------------------------

const redondear = (n: number, d = 4): number => Math.round(n * 10 ** d) / 10 ** d;

export interface Base {
  /** Ángulo del eje x en radianes. */
  fi: number;
  ex: Punto;
  ey: Punto;
}

/** Base ortonormal de un sistema de referencia (los ejes de la pizarra si no hay ninguno). */
export function baseDe(ejes: Ejes | null): Base {
  const fi = ejes?.angulo ?? 0;
  return { fi, ex: { x: Math.cos(fi), y: Math.sin(fi) }, ey: { x: -Math.sin(fi), y: Math.cos(fi) } };
}

export function desplazamiento(v: Vector): Punto {
  return { x: v.b.x - v.a.x, y: v.b.y - v.a.y };
}

/** Largo de la flecha, en metros de pizarra. */
export function longitud(v: Vector): number {
  const d = desplazamiento(v);
  return Math.hypot(d.x, d.y);
}

/** Valor físico del vector (largo × unidades por metro). */
export function modulo(v: Vector): number {
  return longitud(v) * v.porMetro;
}

/** Ángulo del vector medido desde el eje x del sistema, en radianes, en (−π, π]. */
export function anguloRespecto(v: Vector, ejes: Ejes | null): number {
  const base = baseDe(ejes);
  const d = desplazamiento(v);
  const a = Math.atan2(d.x * base.ey.x + d.y * base.ey.y, d.x * base.ex.x + d.y * base.ex.y);
  return a === -Math.PI ? Math.PI : a;
}

export const aGrados = (rad: number): number => (rad * 180) / Math.PI;
export const aRadianes = (deg: number): number => (deg * Math.PI) / 180;

export interface Descomposicion {
  /** Componentes físicas (con signo) a lo largo de x e y del sistema. */
  x: number;
  y: number;
  /** Extremos de las componentes dibujadas desde el origen del vector. */
  puntaX: Punto;
  puntaY: Punto;
}

export function descomponer(v: Vector, ejes: Ejes | null): Descomposicion {
  const base = baseDe(ejes);
  const d = desplazamiento(v);
  const dx = d.x * base.ex.x + d.y * base.ex.y;
  const dy = d.x * base.ey.x + d.y * base.ey.y;
  return {
    x: dx * v.porMetro,
    y: dy * v.porMetro,
    puntaX: { x: v.a.x + base.ex.x * dx, y: v.a.y + base.ex.y * dx },
    puntaY: { x: v.a.x + base.ey.x * dy, y: v.a.y + base.ey.y * dy },
  };
}

/** Vector a partir de su valor y su ángulo respecto del sistema de referencia. */
export function vectorPorValores(
  rol: RolVector,
  origen: Punto,
  valor: number,
  anguloDeg: number,
  ejes: Ejes | null,
  extra: Partial<Vector> = {},
): Vector {
  const porMetro = extra.porMetro ?? ESTILO_ROL[rol].porMetro;
  const largo = valor / porMetro;
  const ang = aRadianes(anguloDeg) + baseDe(ejes).fi;
  const b = { x: redondear(origen.x + largo * Math.cos(ang)), y: redondear(origen.y + largo * Math.sin(ang)) };
  return crearVector(rol, origen, b, { ref: ejes?.id ?? null, ...extra });
}

/** Mismo vector con otro valor físico y/o ángulo (la flecha cambia, el origen no). */
export function conValores(v: Vector, ejes: Ejes | null, valor: number, anguloDeg: number): Vector {
  const largo = valor / v.porMetro;
  const ang = aRadianes(anguloDeg) + baseDe(ejes).fi;
  return { ...v, b: { x: redondear(v.a.x + largo * Math.cos(ang)), y: redondear(v.a.y + largo * Math.sin(ang)) } };
}

// --- Suma punta con cola ----------------------------------------------------------------------------------

export interface ResultadoSuma {
  resultante: Vector;
  /** Copias punteadas de los vectores 2..n colocadas punta con cola a partir del primero. */
  fantasmas: Vector[];
}

/**
 * Suma gráfica (polígono): el segundo vector se coloca en la punta del primero, etc.
 * La resultante va desde el origen del primero hasta la última punta. Los valores se suman
 * en unidades físicas, así que vectores con distinta escala (porMetro) se combinan bien.
 * Devuelve null si hay menos de dos vectores o si sus unidades no coinciden.
 */
export function sumar(vs: readonly Vector[]): ResultadoSuma | null {
  const primero = vs[0];
  if (!primero || vs.length < 2) return null;
  if (vs.some((v) => v.unidad !== primero.unidad)) return null;

  const fantasmas: Vector[] = [];
  let cursor = primero.b;
  for (const v of vs.slice(1)) {
    const k = v.porMetro / primero.porMetro;
    const d = desplazamiento(v);
    const fin = { x: redondear(cursor.x + d.x * k), y: redondear(cursor.y + d.y * k) };
    fantasmas.push({ ...v, id: nuevoIdElemento(), a: cursor, b: fin, porMetro: primero.porMetro, fantasma: true, etiqueta: '', mostrarValor: false, componentes: false, angulo: false });
    cursor = fin;
  }
  const resultante = crearVector('resultante', primero.a, cursor, {
    unidad: primero.unidad,
    porMetro: primero.porMetro,
    mostrarValor: true,
    ref: primero.ref,
  });
  return { resultante, fantasmas };
}

// --- Texto de valores y unidades ---------------------------------------------------------------------------

/** Número con coma decimal. `matematica` usa `{,}` para que LaTeX no meta un espacio. */
export function numeroEs(n: number, matematica = false): string {
  const a = Math.abs(n);
  const dec = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  let t = n.toFixed(dec);
  if (t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, '');
  if (t === '-0') t = '0';
  return matematica ? t.replace('.', '{,}') : t.replace('.', ',');
}

/** `m/s²` → `\mathrm{m/s}^{2}`; `kg·m/s` → `\mathrm{kg}\cdot\mathrm{m/s}`. */
export function unidadATex(u: string): string {
  return u
    .split('·')
    .map((p) => {
      const m = /^(.*?)([²³])$/.exec(p);
      const potencia = m ? (m[2] === '²' ? '^{2}' : '^{3}') : '';
      return `\\mathrm{${m ? m[1] : p}}${potencia}`;
    })
    .join('\\cdot ');
}

export function valorATex(valor: number, unidad: string): string {
  return `${numeroEs(valor, true)}\\,${unidadATex(unidad)}`;
}

/** Etiqueta del vector, con su valor si corresponde (en LaTeX, sin `$`). */
export function etiquetaCompleta(v: Vector): string {
  if (!v.mostrarValor) return v.etiqueta;
  const valor = valorATex(modulo(v), v.unidad);
  return v.etiqueta ? `${v.etiqueta}=${valor}` : valor;
}

// --- Posiciones de etiquetas y arcos ------------------------------------------------------------------------

export interface AnclaEtiqueta {
  /** Expresión en LaTeX (sin `$`). */
  fuente: string;
  /** Origen de la línea base, en metros. */
  origen: Punto;
  /** Centro de la caja (para TikZ). */
  centro: Punto;
  tam: number;
  caja: CajaMat;
}

/** Coloca una etiqueta con su caja centrada en `centro`. */
export function anclarCaja(fuente: string, centro: Punto, tam = TAM_ETIQUETA): AnclaEtiqueta {
  const caja = componerMat(fuente);
  const w = caja.ancho * tam;
  const media = ((caja.ascenso - caja.descenso) / 2) * tam;
  return { fuente, origen: { x: centro.x - w / 2, y: centro.y - media }, centro, tam, caja };
}

/** Etiqueta pasada la punta de un segmento a→b, en su misma dirección (para las componentes). */
export function anclaPunta(fuente: string, a: Punto, b: Punto, tam = TAM_ETIQUETA): AnclaEtiqueta {
  const caja = componerMat(fuente);
  const w = caja.ancho * tam;
  const h = (caja.ascenso + caja.descenso) * tam;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const dist = 0.1 + (Math.abs(ux) * w) / 2 + (Math.abs(uy) * h) / 2;
  return anclarCaja(fuente, { x: b.x + ux * dist, y: b.y + uy * dist }, tam);
}

/** Etiqueta al costado del vector, a media flecha y sin tocarla. */
export function anclaEtiquetaVector(v: Vector): AnclaEtiqueta | null {
  const fuente = etiquetaCompleta(v);
  if (fuente === '' || v.fantasma) return null;
  return v.etiquetaEn === 'punta' ? anclaPunta(fuente, v.a, v.b) : anclaLateral(fuente, v.a, v.b, v.grosor);
}

/** Etiqueta centrada a un costado del segmento a→b, a una distancia que depende del tamaño de la caja. */
export function anclaLateral(fuente: string, a: Punto, b: Punto, grosor: number, tam = TAM_ETIQUETA): AnclaEtiqueta {
  const caja = componerMat(fuente);
  const w = caja.ancho * tam;
  const h = (caja.ascenso + caja.descenso) * tam;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  // Normal "a la izquierda"; si apunta hacia abajo se pasa al otro lado para que la etiqueta quede arriba.
  let nx = -dy / l;
  let ny = dx / l;
  if (ny < -1e-9 || (Math.abs(ny) < 1e-9 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const dist = 0.06 + grosor / 2 + (Math.abs(nx) * w) / 2 + (Math.abs(ny) * h) / 2;
  const centro = { x: (a.x + b.x) / 2 + nx * dist, y: (a.y + b.y) / 2 + ny * dist };
  return anclarCaja(fuente, centro, tam);
}

export interface ArcoAngulo {
  centro: Punto;
  radio: number;
  /** Ángulos del mundo (radianes, antihorario) de inicio y fin. */
  desde: number;
  hasta: number;
  etiqueta: AnclaEtiqueta;
}

/** Arco entre el eje x del sistema y el vector (por el camino corto), con su etiqueta. */
export function arcoAngulo(v: Vector, ejes: Ejes | null): ArcoAngulo | null {
  const ang = anguloRespecto(v, ejes);
  const largo = longitud(v);
  if (largo < 1e-6 || Math.abs(ang) < 1e-3) return null;
  const fi = baseDe(ejes).fi;
  const radio = Math.min(0.4, largo * 0.4);
  const medio = fi + ang / 2;
  const texto = v.mostrarValor ? `${v.etiquetaAngulo}=${numeroEs(Math.abs(aGrados(ang)), true)}^{\\circ}` : v.etiquetaAngulo;
  const caja = componerMat(texto);
  const rEt = radio + 0.07 + Math.max(caja.ancho, caja.ascenso + caja.descenso) * TAM_ETIQUETA * 0.45;
  const centro = { x: v.a.x + rEt * Math.cos(medio), y: v.a.y + rEt * Math.sin(medio) };
  return { centro: v.a, radio, desde: fi, hasta: fi + ang, etiqueta: anclarCaja(texto, centro) };
}

export interface GeometriaComponentes {
  d: Descomposicion;
  etiquetaX: AnclaEtiqueta | null;
  etiquetaY: AnclaEtiqueta | null;
  textoX: string;
  textoY: string;
}

/** Componentes con sus etiquetas (`F_x`, `F_y`, con valor si está activado). */
export function geometriaComponentes(v: Vector, ejes: Ejes | null): GeometriaComponentes {
  const d = descomponer(v, ejes);
  const texto = (eje: 'x' | 'y', valor: number): string => {
    const nombre = v.etiqueta ? etiquetaComponente(v.etiqueta, eje) : eje;
    return v.mostrarValor ? `${nombre}=${valorATex(valor, v.unidad)}` : nombre;
  };
  const textoX = texto('x', d.x);
  const textoY = texto('y', d.y);
  const ax = Math.hypot(d.puntaX.x - v.a.x, d.puntaX.y - v.a.y) > 0.05;
  const ay = Math.hypot(d.puntaY.x - v.a.x, d.puntaY.y - v.a.y) > 0.05;
  return {
    d,
    textoX,
    textoY,
    etiquetaX: ax ? anclaPunta(textoX, v.a, d.puntaX) : null,
    etiquetaY: ay ? anclaPunta(textoY, v.a, d.puntaY) : null,
  };
}

/** Etiquetas de los ejes, junto a la punta de cada uno. */
export function anclasEjes(e: Ejes): { x: AnclaEtiqueta; y: AnclaEtiqueta } {
  const c = Math.cos(e.angulo);
  const s = Math.sin(e.angulo);
  const m = 0.16;
  const x = anclarCaja(e.etiquetaX || ' ', { x: e.origen.x + c * (e.largo + m + 0.05), y: e.origen.y + s * (e.largo + m + 0.05) });
  const y = anclarCaja(e.etiquetaY || ' ', { x: e.origen.x - s * (e.largo + m), y: e.origen.y + c * (e.largo + m) });
  return { x, y };
}

// --- Recuadro con etiquetas ----------------------------------------------------------------------------

/** Caja que ocupa el texto de una etiqueta. */
export function cajaDeAncla(a: AnclaEtiqueta): Caja2D {
  return {
    x0: a.origen.x,
    x1: a.origen.x + a.caja.ancho * a.tam,
    y0: a.origen.y - a.caja.descenso * a.tam,
    y1: a.origen.y + a.caja.ascenso * a.tam,
  };
}

/** Recuadro del vector incluyendo sus etiquetas, componentes y arco (para exportar sin recortar). */
export function cajaConEtiquetas(v: Vector, ejes: Ejes | null): Caja2D {
  const cajas: Caja2D[] = [cajaDe(v)];
  const ancla = anclaEtiquetaVector(v);
  if (ancla) cajas.push(cajaDeAncla(ancla));
  if (v.componentes && !v.fantasma) {
    const g = geometriaComponentes(v, ejes);
    for (const a of [g.etiquetaX, g.etiquetaY]) if (a) cajas.push(cajaDeAncla(a));
  }
  if (v.angulo && !v.fantasma) {
    const arco = arcoAngulo(v, ejes);
    if (arco) cajas.push(cajaDeAncla(arco.etiqueta));
  }
  return unirCajas(cajas)!;
}

export function cajaConEtiquetasEjes(e: Ejes): Caja2D {
  const a = anclasEjes(e);
  return unirCajas([cajaDe(e), cajaDeAncla(a.x), cajaDeAncla(a.y)])!;
}
