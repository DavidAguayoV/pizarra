import type { Punto } from '../core/camara';
import type { Bloque, Ejes, Elemento, Esfera, Superficie, Vector } from '../core/elementos';
import { nuevoIdElemento } from '../core/elementos';
import type { Grafo } from '../grafo/lector';
import { apoyosDe, esDe, leerGrafo } from '../grafo/lector';
import { crearEjes, crearVector, modulo, numeroEs, valorATex } from './vectores';
import type { RolVector } from './vectores';
import { anguloSuperficie, elongacion, largoSegmento, normalSuperficie } from './objetos';

/**
 * Diagrama de cuerpo libre automático.
 *
 * Dado un cuerpo (bloque o esfera) y la escena, detecta qué actúa sobre él:
 *   - peso (siempre);
 *   - normal y roce de la superficie en la que se apoya;
 *   - tensión de cada cuerda atada a él;
 *   - fuerza elástica de cada resorte atado a él;
 *   - fuerzas aplicadas (vectores dibujados con origen en el cuerpo).
 * y plantea ΣF = m a por componentes. Los contactos se infieren por cercanía geométrica.
 *
 * Valores: peso, resorte y fuerzas aplicadas se conocen. La normal sale del equilibrio
 * perpendicular a la superficie y el roce se resuelve (estático o cinético) si no hay fuerzas
 * desconocidas (por ejemplo, una tensión). Lo que no se puede determinar queda simbólico.
 */

export type Cuerpo = Bloque | Esfera;
export type ModoRoce = 'auto' | 'estatico' | 'cinetico' | 'ninguno';

/** Distancia máxima (m) para considerar que dos cosas se tocan. */
export const TOLERANCIA_CONTACTO = 0.09;
export const G_POR_DEFECTO = 9.8;

export interface FuerzaDcl {
  rol: RolVector;
  /** Símbolo escalar en LaTeX para las ecuaciones: `N`, `f_k`, `T`, `m g`. */
  simbolo: string;
  /** Etiqueta del vector en LaTeX: `\vec{N}`. */
  etiqueta: string;
  /** Dirección en el mundo, en radianes (antihorario). */
  angulo: number;
  /** Módulo en newton; `null` si no se puede determinar con lo dibujado. */
  valor: number | null;
}

export interface ResultadoDcl {
  cuerpo: Cuerpo;
  g: number;
  fuerzas: FuerzaDcl[];
  /** Ángulo del eje x del sistema de ejes del DCL (el eje y es la normal a la superficie, si hay). */
  anguloEjes: number;
  /** Inclinación de la superficie respecto del horizontal (rad, ≥ 0), o null si no hay contacto. */
  inclinacion: number | null;
  superficie: Superficie | null;
  /** Aceleración a lo largo de x (a lo largo de la superficie si hay contacto) y de y. */
  aceleracion: { x: number | null; y: number | null };
  estadoRoce: 'ninguno' | 'estatico' | 'cinetico' | null;
  avisos: string[];
}

// --- Geometría del cuerpo ----------------------------------------------------------------------------

const unitario = (angulo: number): Punto => ({ x: Math.cos(angulo), y: Math.sin(angulo) });
const dot = (a: Punto, b: Punto): number => a.x * b.x + a.y * b.y;

/** Medida del cuerpo en la dirección `d` (unitaria): cuánto se extiende desde el centro. */
export function apoyoEn(c: Cuerpo, d: Punto): number {
  if (c.tipo === 'esfera') return c.radio;
  const u = unitario(c.angulo);
  const v = { x: -u.y, y: u.x };
  return (Math.abs(dot(d, u)) * c.ancho) / 2 + (Math.abs(dot(d, v)) * c.alto) / 2;
}

/** Distancia de un punto al cuerpo (0 si está dentro). */
export function distanciaAlCuerpo(c: Cuerpo, p: Punto): number {
  if (c.tipo === 'esfera') return Math.max(0, Math.hypot(p.x - c.centro.x, p.y - c.centro.y) - c.radio);
  const dx = p.x - c.centro.x;
  const dy = p.y - c.centro.y;
  const co = Math.cos(-c.angulo);
  const si = Math.sin(-c.angulo);
  const lx = Math.abs(dx * co - dy * si) - c.ancho / 2;
  const ly = Math.abs(dx * si + dy * co) - c.alto / 2;
  return Math.hypot(Math.max(lx, 0), Math.max(ly, 0));
}

/** Contacto del cuerpo con una superficie: normal que sale de ella hacia el cuerpo, o null. */
export function contactoCon(c: Cuerpo, s: Superficie, tol = TOLERANCIA_CONTACTO): { normal: Punto } | null {
  const l = largoSegmento(s.a, s.b);
  if (l < 1e-6) return null;
  const n = normalSuperficie(s);
  const d = dot({ x: c.centro.x - s.a.x, y: c.centro.y - s.a.y }, n);
  const lado = d >= 0 ? 1 : -1;
  const nSale = { x: n.x * lado, y: n.y * lado };
  const holgura = Math.abs(d) - apoyoEn(c, n);
  if (Math.abs(holgura) > tol) return null;
  const t = { x: (s.b.x - s.a.x) / l, y: (s.b.y - s.a.y) / l };
  const u = dot({ x: c.centro.x - s.a.x, y: c.centro.y - s.a.y }, t);
  if (u < -0.25 || u > l + 0.25) return null;
  return { normal: nSale };
}

// --- Símbolos ---------------------------------------------------------------------------------------------

/** `\vec{F}_1` → `F_1`; una etiqueta sin `\vec` se deja igual. */
export function simboloEscalar(etiqueta: string): string {
  const m = /^\\vec\s*\{([^{}]*)\}(.*)$/.exec(etiqueta.trim());
  return m ? `${m[1]}${m[2]}` : etiqueta.trim() || 'F';
}

const masaSimbolo = (c: Cuerpo): string => (c.etiqueta.trim() === '' ? 'm' : c.etiqueta.trim());

// --- Detección y resolución ------------------------------------------------------------------------------------

interface Conocida {
  fuerza: FuerzaDcl;
}

/** Normal unitaria que sale de la superficie hacia el lado donde está el cuerpo. */
function normalHaciaCuerpo(c: Cuerpo, s: Superficie): Punto {
  const n = normalSuperficie(s);
  const lado = dot({ x: c.centro.x - s.a.x, y: c.centro.y - s.a.y }, n) >= 0 ? 1 : -1;
  return { x: n.x * lado, y: n.y * lado };
}

/**
 * Fuerzas que actúan sobre el cuerpo y dónde se apoya, leídas del grafo de la escena (`grafo/lector.ts`, el
 * mismo que usa la simulación). Sin resolver normal ni roce.
 */
function reunir(c: Cuerpo, gr: Grafo, g: number) {
  const contactos = apoyosDe(gr, c)
    .filter((s) => largoSegmento(s.a, s.b) >= 1e-6)
    // En el orden de la escena (como la v1), no en el de la lista de apoyo.
    .sort((p, q) => gr.elementos.indexOf(p) - gr.elementos.indexOf(q))
    .map((s) => ({ s, c: { normal: normalHaciaCuerpo(c, s) } }));

  const otras: FuerzaDcl[] = [];
  // Tensión: cada cuerda con exactamente un extremo en este cuerpo tira hacia su siguiente punto (el otro extremo
  // o el primer contacto con una polea).
  const atadas = gr.cuerdas
    .map((q) => ({ q, en: esDe(q.ext[0], c) ? 0 : esDe(q.ext[1], c) ? 1 : -1, ambos: esDe(q.ext[0], c) && esDe(q.ext[1], c) }))
    .filter((x) => x.en >= 0 && !x.ambos);
  // Polea móvil montada en este cuerpo: la misma cuerda tira de ella por sus dos tramos.
  const enPolea: Array<{ desde: Punto; hacia: Punto }> = [];
  for (const q of gr.cuerdas) {
    q.pasos.forEach((p, j) => {
      if (p.k !== 'circulo' || p.cuerpo?.id !== c.id) return;
      const n = q.nodos[j]!;
      enPolea.push({ desde: n.llega, hacia: n.desde }, { desde: n.sale, hacia: n.hasta });
    });
  }
  const tiran = [...atadas.map(({ q, en }) => ({ desde: q.ext[en]!.p, hacia: q.hacia[en]! })), ...enPolea];
  tiran.forEach(({ desde, hacia }, i) => {
    // Los dos tramos de una polea móvil son la misma cuerda: la misma T (sin subíndice).
    const sub = tiran.length > 1 && enPolea.length === 0 ? `_${i + 1}` : '';
    otras.push({ rol: 'tension', simbolo: `T${sub}`, etiqueta: `\\vec{T}${sub}`, angulo: Math.atan2(hacia.y - desde.y, hacia.x - desde.x), valor: null });
  });

  const elast = gr.resortes
    .map((r) => ({ r, en: esDe(r.ext[0], c) ? 0 : esDe(r.ext[1], c) ? 1 : -1, ambos: esDe(r.ext[0], c) && esDe(r.ext[1], c) }))
    .filter((x) => x.en >= 0 && !x.ambos);
  elast.forEach(({ r, en }, i) => {
    const x = elongacion(r.el);
    if (Math.abs(x) < 1e-3) return;
    const propio = r.ext[en]!.p;
    const otro = r.ext[1 - en]!.p;
    // Estirado: tira hacia el otro extremo. Comprimido: empuja alejándose de él.
    const hacia = Math.atan2(otro.y - propio.y, otro.x - propio.x);
    const sub = elast.length > 1 ? `,${i + 1}` : '';
    otras.push({
      rol: 'aplicada',
      simbolo: `F_{el${sub}}`,
      etiqueta: `\\vec{F}_{el${sub}}`,
      angulo: x > 0 ? hacia : hacia + Math.PI,
      valor: Math.abs(r.el.k * x),
    });
  });

  // Cuerpos apilados (grafo: `apoyo` con el id de otro cuerpo): el de abajo empuja hacia arriba al de arriba, y este
  // empuja hacia abajo al de abajo (tercera ley). Su valor depende del movimiento de los dos: queda como incógnita.
  const num = (k: Cuerpo): string => /_\{?(\d+)\}?$/.exec(k.etiqueta.trim())?.[1] ?? '';
  const parN = (de: Cuerpo, sobre: Cuerpo): string => (num(de) && num(sobre) ? `_{${num(de)}${num(sobre)}}` : '');
  for (const otro of gr.cuerpos) {
    if (otro.id === c.id) continue;
    if (c.apoyo?.includes(otro.id)) {
      const sub = parN(otro, c);
      otras.push({ rol: 'normal', simbolo: `N${sub}`, etiqueta: `\\vec{N}${sub}`, angulo: Math.PI / 2, valor: null });
    }
    if (otro.apoyo?.includes(c.id)) {
      const sub = parN(otro, c);
      otras.push({ rol: 'normal', simbolo: `N${sub}`, etiqueta: `\\vec{N}${sub}`, angulo: -Math.PI / 2, valor: null });
    }
  }

  for (const { v, cuerpo } of gr.vectores) {
    if (cuerpo.id !== c.id) continue;
    const d = { x: v.b.x - v.a.x, y: v.b.y - v.a.y };
    if (Math.hypot(d.x, d.y) < 1e-6) continue;
    otras.push({ rol: v.rol === 'tension' ? 'tension' : 'aplicada', simbolo: simboloEscalar(v.etiqueta), etiqueta: v.etiqueta, angulo: Math.atan2(d.y, d.x), valor: modulo(v) });
  }
  const peso: FuerzaDcl = { rol: 'peso', simbolo: `${masaSimbolo(c)} g`, etiqueta: `${masaSimbolo(c)}\\vec{g}`, angulo: -Math.PI / 2, valor: c.masa * g };
  return { contactos, otras, peso };
}

const normalizar = (a: number): number => {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) x -= 2 * Math.PI;
  if (x <= -Math.PI) x += 2 * Math.PI;
  return x;
};

/** Plantea y resuelve el DCL del cuerpo. */
export function resolverDcl(c0: Cuerpo, elementos: readonly Elemento[], g = G_POR_DEFECTO, roce: ModoRoce = 'auto'): ResultadoDcl {
  const gr = leerGrafo(elementos);
  // El cuerpo tal como lo ve el grafo (con su apoyo); si no está en la escena (vista previa), el recibido.
  const c = gr.cuerpos.find((x) => x.id === c0.id) ?? c0;
  const { contactos, otras, peso } = reunir(c, gr, g);
  const avisos: string[] = [];
  const unico = contactos.length === 1 ? contactos[0]! : null;
  if (contactos.length > 1) avisos.push('El cuerpo toca más de una superficie: se muestran las normales sin calcular su valor.');

  const conocidas: Conocida[] = [{ fuerza: peso }, ...otras.filter((f) => f.valor !== null).map((fuerza) => ({ fuerza }))];
  const desconocidas = otras.filter((f) => f.valor === null);
  const fuerzas: FuerzaDcl[] = [peso, ...otras];

  const base: Pick<ResultadoDcl, 'cuerpo' | 'g' | 'fuerzas' | 'avisos'> = { cuerpo: c, g, fuerzas, avisos };
  if (desconocidas.length > 0) {
    const entre = desconocidas.some((f) => f.rol === 'normal');
    avisos.push(`Hay fuerzas cuyo valor no se puede determinar solo con lo dibujado (${entre ? 'tensiones o fuerzas entre cuerpos' : 'tensiones'}): quedan como incógnitas.`);
  }

  // Sin superficie: ejes del mundo.
  if (!unico) {
    for (const k of contactos) fuerzas.push({ rol: 'normal', simbolo: `N_${fuerzas.filter((f) => f.rol === 'normal').length + 1}`, etiqueta: `\\vec{N}_${fuerzas.filter((f) => f.rol === 'normal').length + 1}`, angulo: Math.atan2(k.c.normal.y, k.c.normal.x), valor: null });
    let ax: number | null = null;
    let ay: number | null = null;
    if (desconocidas.length === 0 && contactos.length === 0) {
      const sx = conocidas.reduce((s, k) => s + (k.fuerza.valor ?? 0) * Math.cos(k.fuerza.angulo), 0);
      const sy = conocidas.reduce((s, k) => s + (k.fuerza.valor ?? 0) * Math.sin(k.fuerza.angulo), 0);
      ax = sx / c.masa;
      ay = sy / c.masa;
    }
    return { ...base, anguloEjes: 0, inclinacion: null, superficie: null, aceleracion: { x: ax, y: ay }, estadoRoce: null };
  }

  // Con una superficie: ejes alineados con ella (y = normal que sale de la superficie).
  const nSale = unico.c.normal;
  const anguloEjes = Math.atan2(nSale.y, nSale.x) - Math.PI / 2;
  const sup = unico.s;
  const inclinacion = Math.min(Math.abs(normalizar(anguloSuperficie(sup))), Math.PI - Math.abs(normalizar(anguloSuperficie(sup))));
  // Se descarta el ruido numérico (3e-15 N) para que "cero" sea cero.
  const limpio = (v: number): number => (Math.abs(v) < 1e-9 ? 0 : v);
  const compX = (f: FuerzaDcl) => limpio((f.valor ?? 0) * Math.cos(f.angulo - anguloEjes));
  const compY = (f: FuerzaDcl) => limpio((f.valor ?? 0) * Math.sin(f.angulo - anguloEjes));

  const normal: FuerzaDcl = { rol: 'normal', simbolo: 'N', etiqueta: '\\vec{N}', angulo: anguloEjes + Math.PI / 2, valor: null };
  const kx = limpio(conocidas.reduce((s, k) => s + compX(k.fuerza), 0));
  const ky = limpio(conocidas.reduce((s, k) => s + compY(k.fuerza), 0));
  fuerzas.push(normal);

  if (desconocidas.length > 0) {
    // Con una tensión desconocida no se puede cerrar el equilibrio: se plantea sin valores.
    if ((sup.muS > 0 || sup.muK > 0) && roce !== 'ninguno') fuerzas.push({ rol: 'friccion', simbolo: roce === 'estatico' ? 'f_s' : 'f_k', etiqueta: roce === 'estatico' ? '\\vec{f}_s' : '\\vec{f}_k', angulo: anguloEjes, valor: null });
    return { ...base, anguloEjes, inclinacion, superficie: sup, aceleracion: { x: null, y: 0 }, estadoRoce: null };
  }

  // Equilibrio perpendicular: N + Σ(Fy conocidas) = 0
  let n = -ky;
  if (n < 0) {
    n = 0;
    avisos.push('El cuerpo se despega de la superficie: la normal es cero.');
  }
  normal.valor = n;

  const hayRoce = (sup.muS > 0 || sup.muK > 0) && roce !== 'ninguno';
  if (!hayRoce) {
    return { ...base, anguloEjes, inclinacion, superficie: sup, aceleracion: { x: kx / c.masa, y: 0 }, estadoRoce: 'ninguno' };
  }

  const maxEstatico = sup.muS * n;
  const eps = 1e-9;
  let modo: 'estatico' | 'cinetico';
  if (roce === 'estatico') modo = 'estatico';
  else if (roce === 'cinetico') modo = 'cinetico';
  else modo = Math.abs(kx) <= maxEstatico + eps ? 'estatico' : 'cinetico';

  const roceF: FuerzaDcl = { rol: 'friccion', simbolo: modo === 'estatico' ? 'f_s' : 'f_k', etiqueta: modo === 'estatico' ? '\\vec{f}_s' : '\\vec{f}_k', angulo: anguloEjes, valor: 0 };
  let ax: number;
  if (modo === 'estatico') {
    // En reposo el roce iguala a la fuerza que tiende a moverlo (hacia el lado contrario).
    if (Math.abs(kx) > maxEstatico + eps) avisos.push('El roce estático necesario supera μs·N: el cuerpo se movería.');
    roceF.valor = Math.abs(kx);
    roceF.angulo = anguloEjes + (kx > 0 ? Math.PI : 0);
    ax = 0;
  } else {
    // Cinético: opuesto al movimiento (se supone que parte del reposo, hacia donde empuja kx).
    const sentido = kx === 0 ? 0 : Math.sign(kx);
    roceF.valor = sentido === 0 ? 0 : sup.muK * n;
    roceF.angulo = anguloEjes + (sentido > 0 ? Math.PI : 0);
    ax = (kx - sentido * sup.muK * n) / c.masa;
  }
  fuerzas.push(roceF);
  return { ...base, anguloEjes, inclinacion, superficie: sup, aceleracion: { x: ax, y: 0 }, estadoRoce: modo };
}

// --- Planteamiento ΣF = ma ------------------------------------------------------------------------------------------

const DEG = 180 / Math.PI;
const cerca = (a: number, b: number, e = 1e-6): boolean => Math.abs(a - b) < e;

function gradosTex(rad: number): string {
  return `${numeroEs(normalizar(rad) * DEG, true)}^{\\circ}`;
}

interface Termino {
  signo: 1 | -1;
  cuerpo: string;
}

/** Término simbólico de una fuerza en el eje `eje` (x o y) de unos ejes girados `t` respecto del horizontal. */
function termino(f: FuerzaDcl, eje: 'x' | 'y', t: number, theta: boolean): Termino | null {
  const phi = normalizar(f.angulo - t);
  const v = eje === 'x' ? Math.cos(phi) : Math.sin(phi);
  if (Math.abs(v) < 1e-6) return null;
  if (cerca(Math.abs(v), 1, 1e-6)) return { signo: v > 0 ? 1 : -1, cuerpo: f.simbolo };
  // El peso en unos ejes inclinados un ángulo θ: componentes m g sen θ y m g cos θ.
  if (f.rol === 'peso' && theta && Math.abs(t) < Math.PI / 2 - 1e-6) {
    const coef = eje === 'x' ? -Math.sign(t) : -1;
    return { signo: coef > 0 ? 1 : -1, cuerpo: `${f.simbolo}\\${eje === 'x' ? 'sin' : 'cos'}\\theta` };
  }
  const fn = eje === 'x' ? 'cos' : 'sin';
  return { signo: 1, cuerpo: `${f.simbolo}\\${fn}\\left(${gradosTex(phi)}\\right)` };
}

function suma(ts: readonly Termino[]): string {
  if (ts.length === 0) return '0';
  return ts
    .map((t, i) => (i === 0 ? (t.signo < 0 ? '-' : '') : t.signo < 0 ? ' - ' : ' + ') + t.cuerpo)
    .join('');
}

export interface Planteamiento {
  /** Líneas de texto para la pizarra; lo que va entre `$...$` es matemática. */
  lineas: string[];
  x: string;
  y: string;
  numerica: string | null;
}

/** ΣF = m a por componente, con los símbolos y, si se pudieron calcular, los valores. */
export function planteamiento(r: ResultadoDcl): Planteamiento {
  const inclinado = r.inclinacion !== null && r.inclinacion > 1e-3 && r.inclinacion < Math.PI / 2 - 1e-3;
  const t = r.anguloEjes;
  const porEje = (eje: 'x' | 'y') =>
    r.fuerzas.map((f) => termino(f, eje, t, inclinado)).filter((x): x is Termino => x !== null);
  const conSuperficie = r.superficie !== null;
  const sumaX = suma(porEje('x'));
  const sumaY = suma(porEje('y'));
  const m = masaSimbolo(r.cuerpo);

  const aX = r.aceleracion.x;
  const aY = r.aceleracion.y;
  const nombreA = conSuperficie ? 'a' : 'a_x';
  const derX = aX !== null && cerca(aX, 0, 1e-9) && conSuperficie ? '0' : `${m}\\,${nombreA}`;
  const derY = conSuperficie ? '0' : aY !== null && cerca(aY, 0, 1e-9) ? '0' : `${m}\\,a_y`;
  const x = `\\sum F_x = ${sumaX} = ${derX}`;
  const y = `\\sum F_y = ${sumaY} = ${derY}`;

  const lineas: string[] = [];
  if (conSuperficie) {
    lineas.push(
      inclinado
        ? `Ejes: x a lo largo de la superficie, y perpendicular ($\\theta=${numeroEs((r.inclinacion ?? 0) * DEG, true)}^{\\circ}$)`
        : 'Ejes: x a lo largo de la superficie, y perpendicular',
    );
  } else {
    lineas.push('Ejes: x horizontal, y vertical');
  }
  lineas.push(`$${x}$`, `$${y}$`);

  const partes: string[] = [];
  for (const f of r.fuerzas) {
    if (f.valor === null) continue;
    if (f.rol === 'peso') partes.push(`${f.simbolo}=${valorATex(f.valor, 'N')}`);
    else partes.push(`${f.simbolo}=${valorATex(f.valor, 'N')}`);
  }
  if (aX !== null) partes.push(`${nombreA}=${valorATex(aX, 'm/s²')}`);
  if (aY !== null && !conSuperficie) partes.push(`a_y=${valorATex(aY, 'm/s²')}`);
  const numerica = partes.length > 0 ? partes.join(';\\ ') : null;
  if (numerica) lineas.push(`$${numerica}$`);
  for (const a of r.avisos) lineas.push(a);
  return { lineas, x, y, numerica };
}

// --- Construcción del diagrama --------------------------------------------------------------------------------

const BASES_ESCALA = [1, 2, 5, 10];

/** Newton por metro de flecha tal que la fuerza mayor mida entre ~0,9 y ~2,2 m. */
export function escalaFlechas(valores: readonly number[]): number {
  const mayor = Math.max(0, ...valores);
  if (mayor <= 0) return 10;
  const objetivo = mayor / 2.2;
  const decada = 10 ** Math.floor(Math.log10(objetivo));
  const base = BASES_ESCALA.find((b) => b * decada >= objetivo) ?? 10;
  return base * decada;
}

/**
 * Elementos que forman el diagrama de cuerpo libre, centrado en `origen`: el cuerpo aislado,
 * los ejes del sistema de referencia, las fuerzas desde su centro y el planteamiento.
 */
export function construirDcl(r: ResultadoDcl, origen: Punto): Elemento[] {
  const porMetro = escalaFlechas(r.fuerzas.map((f) => f.valor ?? 0));
  const mayorFlecha = Math.max(1.1, ...r.fuerzas.map((f) => (f.valor === null ? 1.1 : f.valor / porMetro)));
  // Los ejes sobresalen de la flecha más larga, para que su letra no tape una etiqueta.
  const ejes: Ejes = crearEjes(origen, r.anguloEjes, Math.max(1.5, mayorFlecha + 0.8), { id: nuevoIdElemento(), grosor: 0.012 });
  // El cuerpo aislado no se apoya en nada ni actúa en la simulación: es un dibujo.
  const cuerpo: Cuerpo =
    r.cuerpo.tipo === 'bloque'
      ? { ...r.cuerpo, id: nuevoIdElemento(), centro: origen, angulo: r.superficie ? r.anguloEjes : r.cuerpo.angulo, apoyo: [] }
      : { ...r.cuerpo, id: nuevoIdElemento(), centro: origen, apoyo: [] };

  const r4 = (n: number): number => Math.round(n * 1e4) / 1e4;
  const vectores = r.fuerzas.map((f): Vector => {
    const largo = f.valor === null ? 1.1 : f.valor / porMetro;
    const u = unitario(f.angulo);
    // Cada fuerza sale del borde del cuerpo (no lo tapa ni tapa su etiqueta).
    const d = apoyoEn(cuerpo, u) + 0.04;
    const a = { x: r4(origen.x + u.x * d), y: r4(origen.y + u.y * d) };
    return crearVector(f.rol, a, { x: r4(a.x + u.x * largo), y: r4(a.y + u.y * largo) }, {
      etiqueta: f.etiqueta,
      porMetro,
      mostrarValor: f.valor !== null,
      ref: ejes.id,
      etiquetaEn: 'punta',
    });
  });
  const p = planteamiento(r);
  const texto: Elemento = {
    id: nuevoIdElemento(),
    tipo: 'texto',
    color: 'tinta',
    pos: { x: origen.x - 1.8, y: origen.y - 2.7 },
    texto: p.lineas.join('\n'),
    tam: 0.2,
  };
  return [cuerpo, ejes, ...vectores, texto];
}
