import type { Elemento, Trazo } from '../core/elementos';
import type { LoteVivo } from './protocolo';

/** Emisor: convierte el elemento en construcción en lotes pequeños (solo lo nuevo). */
export class ProductorVivo {
  private idActual: string | null = null;
  private enviados = 0;

  lote(el: Elemento | null, ocultos: ReadonlySet<string>): LoteVivo {
    const oc = [...ocultos];
    if (!el) return { id: '', ocultos: oc };
    if (el.tipo !== 'trazo') {
      this.idActual = null;
      return { id: el.id, ocultos: oc, el };
    }
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

/** Receptor: rearma el elemento en construcción a partir de los lotes. */
export class ReconstructorVivo {
  private id: string | null = null;
  private puntos: number[] = [];
  private base: LoteVivo['base'] | null = null;
  private forma: Elemento | null = null;
  private oc = new Set<string>();

  /** Aplica un lote; devuelve el elemento actual (o null) y los ids que se están borrando. */
  aplicar(l: LoteVivo): { elemento: Elemento | null; ocultos: ReadonlySet<string> } {
    this.oc = new Set(l.ocultos);
    if (l.el) {
      this.forma = l.el;
      this.id = null;
      this.puntos = [];
      this.base = null;
    } else if (l.pts && l.base) {
      if (this.id !== l.id) {
        this.id = l.id;
        this.puntos = [];
      }
      this.forma = null;
      this.base = l.base;
      const desde = l.desde ?? this.puntos.length;
      this.puntos = this.puntos.slice(0, desde).concat(l.pts);
    } else if (l.id === '') {
      this.forma = null;
      this.id = null;
      this.puntos = [];
      this.base = null;
    }
    return { elemento: this.actual(), ocultos: this.oc };
  }

  limpiar(): void {
    this.aplicar({ id: '', ocultos: [] });
  }

  private actual(): Elemento | null {
    if (this.forma) return this.forma;
    if (this.id && this.base && this.puntos.length >= 3) {
      const t: Trazo = { id: this.id, tipo: 'trazo', puntos: this.puntos, ...this.base };
      return t;
    }
    return null;
  }
}
