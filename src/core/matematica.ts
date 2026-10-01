/**
 * Compositor de etiquetas matemáticas (un subconjunto de LaTeX pensado para física).
 *
 * Se usa en pantalla, en PNG y en SVG con las MISMAS medidas, sin DOM ni fuentes especiales:
 * `componerMat` devuelve primitivas (texto y líneas) en unidades de "em" con el origen en la
 * línea base, y cada salida las dibuja a su manera. TikZ no pasa por aquí: lleva el LaTeX original.
 *
 * Soporta: letras (cursiva) y dígitos, `^` y `_` (anidables), letras griegas, `\vec \hat \bar \dot`,
 * `\frac{a}{b}`, `\sqrt{x}`, `\text{..}`, funciones (`\sin \cos \tan \ln \log`), símbolos
 * (`\cdot \times \pm \approx \neq \leq \geq \to \infty \circ`) y espacios (`\,` `\;` `\quad`).
 */

export type Prim =
  | { k: 't'; x: number; y: number; s: string; tam: number; cursiva: boolean }
  | { k: 'l'; x1: number; y1: number; x2: number; y2: number; grosor: number }
  | { k: 'p'; puntos: Array<[number, number]> };

export interface CajaMat {
  ancho: number;
  ascenso: number;
  descenso: number;
  prims: Prim[];
}

const GRIEGAS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
  vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ',
  tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};
const MAYUS_GRIEGAS = new Set(['Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega']);

const SIMBOLOS: Record<string, string> = {
  cdot: '·', times: '×', pm: '±', mp: '∓', approx: '≈', neq: '≠', ne: '≠', leq: '≤', le: '≤', geq: '≥', ge: '≥',
  to: '→', rightarrow: '→', infty: '∞', circ: '°', degree: '°', parallel: '∥', perp: '⊥', propto: '∝',
  sum: '∑', partial: '∂', nabla: '∇', ell: 'ℓ', hbar: 'ħ', ldots: '…', dots: '…',
};

const FUNCIONES = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'ln', 'log', 'exp', 'max', 'min', 'arcsin', 'arccos', 'arctan', 'sen']);
const ESPACIOS: Record<string, number> = { ',': 0.17, ';': 0.28, ' ': 0.28, quad: 1, qquad: 2, '!': -0.1 };

type Nodo =
  | { t: 'c'; c: string; cursiva: boolean }
  | { t: 'grupo'; n: Nodo[] }
  | { t: 'script'; base: Nodo; sub?: Nodo; sup?: Nodo }
  | { t: 'acento'; tipo: 'vec' | 'hat' | 'bar' | 'dot' | 'ddot'; arg: Nodo }
  | { t: 'frac'; num: Nodo; den: Nodo }
  | { t: 'raiz'; arg: Nodo }
  | { t: 'texto'; s: string }
  | { t: 'esp'; w: number };

// --- Análisis -----------------------------------------------------------------------------

class Lector {
  private i = 0;
  constructor(private readonly s: string) {}

  fin(): boolean {
    return this.i >= this.s.length;
  }
  mirar(): string {
    return this.s[this.i] ?? '';
  }

  secuencia(hastaLlave: boolean): Nodo[] {
    const out: Nodo[] = [];
    while (!this.fin()) {
      const ch = this.mirar();
      if (ch === '}' && hastaLlave) {
        this.i++;
        return out;
      }
      if (ch === '}') {
        this.i++; // llave sobrante: se ignora
        continue;
      }
      let atomo = this.atomo();
      if (!atomo) continue;
      // Subíndices y superíndices (en cualquier orden, una vez cada uno).
      let sub: Nodo | undefined;
      let sup: Nodo | undefined;
      while (this.mirar() === '_' || this.mirar() === '^') {
        const esSub = this.mirar() === '_';
        this.i++;
        const arg = this.argumento();
        if (esSub) sub = arg;
        else sup = arg;
      }
      if (sub || sup) atomo = { t: 'script', base: atomo, ...(sub ? { sub } : {}), ...(sup ? { sup } : {}) };
      out.push(atomo);
    }
    return out;
  }

  /** Un argumento: `{...}`, `\cmd` o un solo carácter. */
  private argumento(): Nodo {
    if (this.mirar() === '{') {
      this.i++;
      return { t: 'grupo', n: this.secuencia(true) };
    }
    return this.atomo() ?? { t: 'grupo', n: [] };
  }

  private atomo(): Nodo | null {
    const ch = this.mirar();
    if (ch === '{') {
      this.i++;
      return { t: 'grupo', n: this.secuencia(true) };
    }
    if (ch === '\\') return this.comando();
    this.i++;
    if (ch === ' ' || ch === '\n') return null; // en modo matemático los espacios no cuentan
    if (ch === '_' || ch === '^') return null;
    return { t: 'c', c: ch, cursiva: /[A-Za-z]/.test(ch) };
  }

  private comando(): Nodo | null {
    this.i++; // la barra
    const siguiente = this.mirar();
    if (!/[A-Za-z]/.test(siguiente)) {
      this.i++;
      if (siguiente in ESPACIOS) return { t: 'esp', w: ESPACIOS[siguiente]! };
      return { t: 'c', c: siguiente, cursiva: false }; // \{ \} \% \& ...
    }
    let nombre = '';
    while (/[A-Za-z]/.test(this.mirar())) nombre += this.s[this.i++];
    if (nombre in ESPACIOS) return { t: 'esp', w: ESPACIOS[nombre]! };
    if (nombre in GRIEGAS) return { t: 'c', c: GRIEGAS[nombre]!, cursiva: !MAYUS_GRIEGAS.has(nombre) };
    if (nombre in SIMBOLOS) return { t: 'c', c: SIMBOLOS[nombre]!, cursiva: false };
    if (FUNCIONES.has(nombre)) return { t: 'texto', s: nombre === 'sen' ? 'sen' : nombre };
    switch (nombre) {
      case 'vec':
      case 'hat':
      case 'bar':
      case 'dot':
      case 'ddot':
        return { t: 'acento', tipo: nombre, arg: this.argumento() };
      case 'overline':
        return { t: 'acento', tipo: 'bar', arg: this.argumento() };
      case 'frac':
      case 'dfrac':
        return { t: 'frac', num: this.argumento(), den: this.argumento() };
      case 'sqrt':
        return { t: 'raiz', arg: this.argumento() };
      case 'text':
      case 'mathrm':
      case 'textrm': {
        const a = this.argumento();
        return { t: 'texto', s: textoPlano(a) };
      }
      case 'left':
      case 'right':
        return null; // los paréntesis se dibujan tal cual
      default:
        return { t: 'texto', s: nombre }; // comando desconocido: se muestra su nombre, sin romper
    }
  }
}

function textoPlano(n: Nodo): string {
  switch (n.t) {
    case 'c':
      return n.c;
    case 'texto':
      return n.s;
    case 'grupo':
      return n.n.map(textoPlano).join('');
    case 'esp':
      return ' ';
    default:
      return '';
  }
}

// --- Medidas (estimadas, iguales en todas las salidas) ------------------------------------------

const ANCHO_BASE = 0.55;
const ESTRECHOS = new Set([...'iljt;:!\'|()[]fI1']);
const PUNTUACION = new Set([...'.,']);
const ANCHOS = new Set([...'mwMWQ%@∑']);
const OPERADORES = new Set([...'=+−<>≈≠≤≥→±∓×']);

export function anchoGlifo(c: string): number {
  if (OPERADORES.has(c)) return 0.62;
  if (PUNTUACION.has(c)) return 0.24;
  if (ESTRECHOS.has(c)) return 0.34;
  if (ANCHOS.has(c)) return 0.85;
  if (c === '·' || c === '°') return 0.32;
  return ANCHO_BASE;
}

const CON_COLA = new Set([...'gjpqyμβγρφψζ']);
const ALTURA = 0.72;
const ALTURA_EJE = 0.28; // altura del signo "=" y de la barra de fracción

interface Cursor {
  prims: Prim[];
}

interface Medida {
  ancho: number;
  asc: number;
  desc: number;
}

/** Compone `nodos` empezando en (x0, y0) a escala `s`; agrega primitivas a `c` y devuelve la medida. */
function componer(nodos: readonly Nodo[], x0: number, y0: number, s: number, c: Cursor): Medida {
  let x = x0;
  let asc = 0;
  let desc = 0;
  const abrazar = (m: Medida, dy: number): void => {
    asc = Math.max(asc, m.asc + dy);
    desc = Math.max(desc, m.desc - dy);
  };
  for (const n of nodos) {
    const m = nodo(n, x, y0, s, c);
    abrazar(m, 0);
    x += m.ancho;
  }
  return { ancho: x - x0, asc, desc };
}

function nodo(n: Nodo, x: number, y: number, s: number, c: Cursor): Medida {
  switch (n.t) {
    case 'c': {
      const car = n.c === '-' ? '−' : n.c;
      const w = anchoGlifo(car) * s;
      const op = OPERADORES.has(car);
      const pad = op ? 0.14 * s : 0;
      c.prims.push({ k: 't', x: x + pad, y, s: car, tam: s, cursiva: n.cursiva });
      return { ancho: w + (op ? 2 * pad : 0), asc: ALTURA * s, desc: CON_COLA.has(car) ? 0.22 * s : 0 };
    }
    case 'texto': {
      c.prims.push({ k: 't', x, y, s: n.s, tam: s, cursiva: false });
      const sufijo = FUNCIONES.has(n.s) ? 0.12 * s : 0;
      return { ancho: n.s.length * ANCHO_BASE * s + sufijo, asc: ALTURA * s, desc: /[gjpqy]/.test(n.s) ? 0.22 * s : 0 };
    }
    case 'esp':
      return { ancho: n.w * s, asc: 0, desc: 0 };
    case 'grupo':
      return componer(n.n, x, y, s, c);
    case 'script': {
      const base = nodo(n.base, x, y, s, c);
      const ss = s * 0.7;
      let ancho = base.ancho;
      let asc = base.asc;
      let desc = base.desc;
      const yBase = y;
      let wSub = 0;
      let wSup = 0;
      if (n.sup) {
        const dy = Math.max(0.42 * s, base.asc - 0.28 * s);
        const m = nodo(n.sup, x + base.ancho, yBase + dy, ss, c);
        wSup = m.ancho;
        asc = Math.max(asc, dy + m.asc);
      }
      if (n.sub) {
        const dy = -0.2 * s;
        const m = nodo(n.sub, x + base.ancho, yBase + dy, ss, c);
        wSub = m.ancho;
        desc = Math.max(desc, -dy + m.desc);
      }
      ancho += Math.max(wSup, wSub) + 0.03 * s;
      return { ancho, asc, desc };
    }
    case 'acento': {
      const sub: Cursor = { prims: [] };
      const m = nodo(n.arg, 0, 0, s, sub);
      c.prims.push(...desplazar(sub.prims, x, y));
      const w = Math.max(m.ancho, 0.3 * s);
      const yA = m.asc + 0.1 * s;
      const g = 0.06 * s;
      switch (n.tipo) {
        case 'vec': {
          // flecha de lado a lado, con la punta a la derecha
          const x1 = x + 0.04 * s;
          const x2 = x + w;
          c.prims.push({ k: 'l', x1, y1: y + yA, x2, y2: y + yA, grosor: g });
          c.prims.push({ k: 'p', puntos: [[x2, y + yA], [x2 - 0.15 * s, y + yA + 0.07 * s], [x2 - 0.15 * s, y + yA - 0.07 * s]] });
          break;
        }
        case 'bar':
          c.prims.push({ k: 'l', x1: x + 0.05 * s, y1: y + yA, x2: x + w, y2: y + yA, grosor: g });
          break;
        case 'hat':
          c.prims.push({ k: 'l', x1: x + w / 2 - 0.12 * s, y1: y + yA - 0.05 * s, x2: x + w / 2, y2: y + yA + 0.07 * s, grosor: g });
          c.prims.push({ k: 'l', x1: x + w / 2, y1: y + yA + 0.07 * s, x2: x + w / 2 + 0.12 * s, y2: y + yA - 0.05 * s, grosor: g });
          break;
        case 'dot':
        case 'ddot': {
          const puntos = n.tipo === 'dot' ? [w / 2] : [w / 2 - 0.1 * s, w / 2 + 0.1 * s];
          for (const px of puntos) c.prims.push({ k: 't', x: x + px - 0.05 * s, y: y + yA - 0.1 * s, s: '.', tam: s, cursiva: false });
          break;
        }
      }
      return { ancho: w, asc: yA + 0.12 * s, desc: m.desc };
    }
    case 'frac': {
      const sf = s * 0.8;
      const a: Cursor = { prims: [] };
      const b: Cursor = { prims: [] };
      const mn = nodo(n.num, 0, 0, sf, a);
      const md = nodo(n.den, 0, 0, sf, b);
      const w = Math.max(mn.ancho, md.ancho) + 0.2 * s;
      const eje = y + ALTURA_EJE * s;
      const yNum = eje + 0.12 * s + mn.desc;
      const yDen = eje - 0.12 * s - md.asc;
      c.prims.push(...desplazar(a.prims, x + (w - mn.ancho) / 2, yNum));
      c.prims.push(...desplazar(b.prims, x + (w - md.ancho) / 2, yDen));
      c.prims.push({ k: 'l', x1: x + 0.04 * s, y1: eje, x2: x + w - 0.04 * s, y2: eje, grosor: 0.05 * s });
      return { ancho: w, asc: yNum + mn.asc - y, desc: y - (yDen - md.desc) };
    }
    case 'raiz': {
      const sub: Cursor = { prims: [] };
      const m = nodo(n.arg, 0, 0, s, sub);
      const pre = 0.5 * s;
      c.prims.push({ k: 't', x, y, s: '√', tam: s, cursiva: false });
      c.prims.push(...desplazar(sub.prims, x + pre, y));
      const yT = y + m.asc + 0.08 * s;
      c.prims.push({ k: 'l', x1: x + pre - 0.04 * s, y1: yT, x2: x + pre + m.ancho + 0.04 * s, y2: yT, grosor: 0.05 * s });
      return { ancho: pre + m.ancho + 0.06 * s, asc: m.asc + 0.14 * s, desc: m.desc };
    }
  }
}

function desplazar(prims: readonly Prim[], dx: number, dy: number): Prim[] {
  return prims.map((p): Prim => {
    switch (p.k) {
      case 't':
        return { ...p, x: p.x + dx, y: p.y + dy };
      case 'l':
        return { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy };
      case 'p':
        return { k: 'p', puntos: p.puntos.map(([a, b]): [number, number] => [a + dx, b + dy]) };
    }
  });
}

// --- API pública ----------------------------------------------------------------------------------

const cacheMat = new Map<string, CajaMat>();

/** Compone una expresión en modo matemático (sin los `$`). Resultado en em, origen en la línea base. */
export function componerMat(fuente: string): CajaMat {
  const hit = cacheMat.get(fuente);
  if (hit) return hit;
  const nodos = new Lector(fuente).secuencia(false);
  const c: Cursor = { prims: [] };
  const m = componer(nodos, 0, 0, 1, c);
  const caja: CajaMat = { ancho: m.ancho, ascenso: Math.max(m.asc, ALTURA), descenso: m.desc, prims: c.prims };
  if (cacheMat.size > 500) cacheMat.clear();
  cacheMat.set(fuente, caja);
  return caja;
}

/**
 * Compone una línea de texto que mezcla texto normal y matemática entre `$...$`.
 * Con `$` sin cerrar, todo se trata como texto.
 */
export function componerLinea(linea: string): CajaMat {
  const trozos = linea.split('$');
  const balanceado = trozos.length % 2 === 1;
  const prims: Prim[] = [];
  let x = 0;
  let asc = ALTURA;
  let desc = 0;
  const partes = balanceado ? trozos : [linea];
  partes.forEach((t, i) => {
    if (balanceado && i % 2 === 1) {
      const m = componerMat(t);
      prims.push(...desplazar(m.prims, x, 0));
      x += m.ancho;
      asc = Math.max(asc, m.ascenso);
      desc = Math.max(desc, m.descenso);
    } else if (t.length > 0) {
      prims.push({ k: 't', x, y: 0, s: t, tam: 1, cursiva: false });
      x += t.length * ANCHO_BASE;
    }
  });
  return { ancho: x, ascenso: asc, descenso: desc, prims };
}

/** ¿La etiqueta tiene algo que componer más allá de texto plano? */
export function esMatematica(s: string): boolean {
  return /[\\^_{}]/.test(s);
}

/** Nombre de la componente de una etiqueta: `\vec{F}` → `F_x`, `\vec{F}_k` → `F_{k,x}`, `v` → `v_x`. */
export function etiquetaComponente(etiqueta: string, eje: 'x' | 'y'): string {
  const e = etiqueta.trim();
  const m = /^\\vec\s*\{([^{}]*)\}(?:_\{?([^{}]*)\}?)?$/.exec(e);
  if (m) return m[2] ? `${m[1]}_{${m[2]},${eje}}` : `${m[1]}_${eje}`;
  const llano = /^([A-Za-z\\]+[A-Za-z]*)(?:_\{?([^{}]*)\}?)?$/.exec(e);
  if (llano) return llano[2] ? `${llano[1]}_{${llano[2]},${eje}}` : `${llano[1]}_${eje}`;
  return `(${e})_${eje}`;
}

// --- Salidas ------------------------------------------------------------------------------------------------

export interface OpcionesSalidaMat {
  /** Tipografía para el texto. */
  familia: string;
}

/** Dibuja en un canvas con el mundo en y hacia arriba: (x, y) es el origen de la línea base. */
export function dibujarMat(ctx: CanvasRenderingContext2D, caja: CajaMat, x: number, y: number, tam: number, familia: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(tam, tam);
  ctx.textBaseline = 'alphabetic';
  for (const p of caja.prims) {
    if (p.k === 't') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(1, -1);
      ctx.font = `${p.cursiva ? 'italic ' : ''}${p.tam}px ${familia}`;
      ctx.fillText(p.s, 0, 0);
      ctx.restore();
    } else if (p.k === 'l') {
      ctx.lineWidth = Math.max(p.grosor, 0.02);
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(p.x1, p.y1);
      ctx.lineTo(p.x2, p.y2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      p.puntos.forEach(([a, b], i) => (i === 0 ? ctx.moveTo(a, b) : ctx.lineTo(a, b)));
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

const num = (v: number): string => {
  const r = (Math.round(v * 100) / 100).toString();
  return r === '-0' ? '0' : r;
};

function escaparXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * SVG de la caja. `X`, `Y`, `L` convierten metros del mundo a coordenadas y longitudes del SVG
 * (y hacia abajo); (x, y) es el origen de la línea base en el mundo.
 */
export function matASvg(
  caja: CajaMat,
  x: number,
  y: number,
  tam: number,
  conv: { X: (v: number) => string; Y: (v: number) => string; L: (v: number) => string },
  color: string,
  familia: string,
): string {
  const px = (v: number) => Number(conv.X(x + v * tam));
  const py = (v: number) => Number(conv.Y(y + v * tam));
  const largo = (v: number) => Number(conv.L(v * tam));
  const partes: string[] = [];
  for (const p of caja.prims) {
    if (p.k === 't') {
      const estilo = p.cursiva ? ' font-style="italic"' : '';
      partes.push(
        `<text x="${num(px(p.x))}" y="${num(py(p.y))}" font-family="${escaparXml(familia)}" font-size="${num(largo(p.tam))}"${estilo} fill="${color}" xml:space="preserve">${escaparXml(p.s)}</text>`,
      );
    } else if (p.k === 'l') {
      partes.push(
        `<line x1="${num(px(p.x1))}" y1="${num(py(p.y1))}" x2="${num(px(p.x2))}" y2="${num(py(p.y2))}" stroke="${color}" stroke-width="${num(Math.max(largo(p.grosor), 0.6))}"/>`,
      );
    } else {
      partes.push(`<polygon points="${p.puntos.map(([a, b]) => `${num(px(a))},${num(py(b))}`).join(' ')}" fill="${color}"/>`);
    }
  }
  return partes.join('\n');
}
