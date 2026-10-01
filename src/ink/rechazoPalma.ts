/**
 * Rechazo de palma: mientras hay un lápiz cerca (apoyado o flotando sobre la pantalla),
 * los toques de dedo se ignoran. Se recuerda el último momento en que se vio el lápiz,
 * porque al levantarlo la palma suele seguir apoyada unos instantes.
 */
export const VENTANA_LAPIZ_MS = 800;

export class RechazoPalma {
  private ultimoLapiz = -Infinity;

  constructor(private readonly ventanaMs = VENTANA_LAPIZ_MS) {}

  /** Llamar con cada evento de puntero (también el flotante, sin presionar). */
  registrar(tipoPuntero: string, ahora: number): void {
    if (tipoPuntero === 'pen') this.ultimoLapiz = ahora;
  }

  /** ¿Se debe ignorar este evento? Solo los toques, y solo si hubo lápiz hace poco. */
  ignorar(tipoPuntero: string, ahora: number): boolean {
    return tipoPuntero === 'touch' && ahora - this.ultimoLapiz < this.ventanaMs;
  }
}
