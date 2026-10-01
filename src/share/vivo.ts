import type { Elemento, Trazo } from '../core/elementos';
import type { LoteVivo } from './protocolo';

type Vivos = Elemento | readonly Elemento[] | null;

export function comoLista(v: Vivos): readonly Elemento[] {
  if (!v) return [];
  return Array.isArray(v) ? (v as readonly Elemento[]) : [v as Elemento];
}

/** Emisor: convierte lo que se está dibujando o arrastrando en lotes pequeños (solo lo nuevo). */
export class ProductorVivo {
  private idActual: string | null = null;
  private enviados = 0;

  lote(vivos: Vivos, ocultos: ReadonlySet<string>): LoteVivo {
    const oc = [...ocultos];
    const lista = comoLista(vivos);
    const primero = lista[0];
    if (!primero) return { id: '', ocultos: oc };
    if (lista.length > 1 || primero.tipo !== 'trazo') {
      this.idActual = null;
      return { id: primero.id, ocultos: oc, els: [...lista] };
    }
    const el = primero;
    if (this.idActual !== el.id) {
      this.idActual = el.id;
      this.enviados = 0;
    }
    const desde = this.enviados;
    this.enviados = el.puntos.length;
    return {
      id: el.id,
      ocultos: oc,
      base: { color: el.color, grosor: el.grosor, resaltador: el.resaltador },
      desde,
      pts: el.puntos.slice(desde),
    };
  }

  reiniciar(): void {
    this.idActual = null;
    this.enviados = 0;
  }
}

/** Receptor: rearma lo que se está dibujando a partir de los lotes. */
export class ReconstructorVivo {
  private id: string | null = null;
  private puntos: number[] = [];
  private base: LoteVivo['base'] | null = null;
  private formas: Elemento[] = [];
  private oc = new Set<string>();

  /** Aplica un lote; devuelve los elementos actuales y los ids que se están borrando u ocultando. */
  aplicar(l: LoteVivo): { elemento: Elemento | null; elementos: Elemento[]; ocultos: ReadonlySet<string> } {
    this.oc = new Set(l.ocultos);
    if (l.els) {
      this.formas = l.els;
      this.id = null;
      this.puntos = [];
      this.base = null;
    } else if (l.pts && l.base) {
      if (this.id !== l.id) {
        this.id = l.id;
        this.puntos = [];
      }
      this.formas = [];
      this.base = l.base;
      const desde = l.desde ?? this.puntos.length;
      this.puntos = this.puntos.slice(0, desde).concat(l.pts);
    } else if (l.id === '') {
      this.formas = [];
      this.id = null;
      this.puntos = [];
      this.base = null;
    }
    const elementos = this.actuales();
    return { elemento: elementos[0] ?? null, elementos, ocultos: this.oc };
  }

  limpiar(): void {
    this.aplicar({ id: '', ocultos: [] });
  }

  private actuales(): Elemento[] {
    if (this.formas.length > 0) return this.formas;
    if (this.id && this.base && this.puntos.length >= 3) {
      const t: Trazo = { id: this.id, tipo: 'trazo', puntos: this.puntos, ...this.base };
      return [t];
    }
    return [];
  }
}
