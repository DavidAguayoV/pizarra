import type { Page } from '@playwright/test';

/**
 * Botón de una herramienta con la barra por modos (Nivel 2): si no está a la vista, se busca en los modos
 * Dibujar, Armar y Conectar. «Cuerpos» (la paleta de antes) equivale al modo Armar.
 */
export function herramienta(page: Page, nombre: string): { click: () => Promise<void> } {
  return {
    async click() {
      const objetivo = nombre === 'Cuerpos' ? 'Armar' : nombre;
      const b = page.getByRole('button', { name: objetivo, exact: true });
      const intentar = async (): Promise<boolean> => {
        if (!(await b.isVisible())) return false;
        try {
          await b.click({ timeout: 3000 });
          return true;
        } catch {
          return false; // se ocultó entre medio (la barra se estaba armando): se busca de nuevo
        }
      };
      for (let vuelta = 0; vuelta < 2; vuelta++) {
        if (await intentar()) return;
        for (const modo of ['Dibujar', 'Armar', 'Conectar']) {
          await page.getByRole('button', { name: modo, exact: true }).click();
          if (await intentar()) return;
        }
      }
      throw new Error(`No se encontró la herramienta «${nombre}» en ningún modo`);
    },
  };
}

/**
 * Pausa la simulación si sigue corriendo. Puede que ya se haya detenido sola (por ejemplo, un cuerpo llegó a la
 * polea): en una máquina lenta eso pasa antes del clic, y entonces no hay nada que pausar.
 */
export async function pausarSiCorre(page: Page): Promise<void> {
  try {
    await page.locator('section.panel-sim').getByRole('button', { name: /Pausar/ }).click({ timeout: 2000 });
  } catch {
    /* ya estaba detenida */
  }
}
