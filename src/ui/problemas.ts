import type { Elemento } from '../core/elementos';
import type { LotePayload } from '../core/escena';
import { arreglar } from '../grafo/arreglos';
import type { Problema } from '../grafo/validar';
import { validar } from '../grafo/validar';

/**
 * Menú «Problemas de la escena» (Nivel 2): un aviso en la barra con la cantidad, que se despliega en la lista de
 * problemas con su botón *Arreglar* (cuando hay un arreglo automático) y *Mostrar* (selecciona los elementos).
 * Se oculta cuando no hay problemas. «Sin cuerpos» y «polea sin cuerda» no se muestran aquí (aparecerían a cada
 * rato mientras se arma un montaje); siguen en el panel de simulación.
 */

export interface AnfitrionProblemas {
  elementos(): readonly Elemento[];
  editar(cambio: LotePayload): void;
  mostrar(ids: readonly string[]): void;
}

const ARREGLO: Record<NonNullable<Problema['arreglo']>, string> = {
  'fijar-extremo': 'Fijar el extremo',
  'quitar-apoyo': 'Quitar el apoyo',
  apoyar: 'Apoyar',
  separar: 'Separar',
  alinear: 'Alinear bajo la polea',
  'alinear-polea': 'Mover la polea',
};

/** Texto para la interfaz: sin las marcas de LaTeX de las etiquetas (`$m_1$` → `m_1`). */
export const sinMarcas = (s: string): string =>
  s
    .replace(/\$/g, '')
    .replace(/_\{?(\d+)\}?/g, (_, d: string) => [...d].map((c) => SUBINDICES[c] ?? c).join(''))
    .replace(/\\/g, '');

const SUBINDICES: Readonly<Record<string, string>> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };

export class MenuProblemas {
  readonly elemento = document.createElement('details');
  private readonly resumen = document.createElement('summary');
  private readonly cuenta = document.createElement('span');
  private readonly lista = document.createElement('ul');
  private huella = '';

  constructor(private readonly host: AnfitrionProblemas) {
    this.elemento.className = 'menu menu-problemas';
    const ico = document.createElement('span');
    ico.className = 'ico';
    ico.setAttribute('aria-hidden', 'true');
    ico.textContent = '⚠';
    this.cuenta.className = 'cuenta';
    this.resumen.append(ico, this.cuenta);
    const caja = document.createElement('div');
    caja.className = 'menu-caja';
    const titulo = document.createElement('h2');
    titulo.textContent = 'Problemas de la escena';
    this.lista.className = 'lista-problemas';
    caja.append(titulo, this.lista);
    this.elemento.append(this.resumen, caja);
    this.elemento.hidden = true;
  }

  /** Vuelve a validar la escena (llamar en cada cambio). */
  actualizar(): void {
    const ps = validar(this.host.elementos()).filter((p) => p.tipo !== 'sin-cuerpos' && p.tipo !== 'polea-sin-cuerda');
    const huella = JSON.stringify(ps);
    if (huella === this.huella) return;
    this.huella = huella;
    this.elemento.hidden = ps.length === 0;
    if (ps.length === 0) this.elemento.open = false;
    this.cuenta.textContent = String(ps.length);
    this.resumen.setAttribute('aria-label', `Problemas de la escena: ${ps.length}`);
    this.resumen.title = 'Problemas de la escena';
    this.lista.replaceChildren(
      ...ps.map((p) => {
        const li = document.createElement('li');
        li.className = p.gravedad;
        const t = document.createElement('p');
        t.textContent = sinMarcas(p.texto);
        li.append(t);
        const acciones = document.createElement('div');
        acciones.className = 'acciones-problema';
        if (p.arreglo) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = ARREGLO[p.arreglo];
          b.title = 'Arreglar';
          b.addEventListener('click', () => {
            const lote = arreglar(p, this.host.elementos());
            if (lote) this.host.editar(lote);
          });
          acciones.append(b);
        }
        const ver = document.createElement('button');
        ver.type = 'button';
        ver.textContent = 'Mostrar';
        ver.addEventListener('click', () => this.host.mostrar(p.elementos));
        acciones.append(ver);
        li.append(acciones);
        return li;
      }),
    );
  }
}
