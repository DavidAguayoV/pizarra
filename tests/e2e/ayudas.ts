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
      if (await b.isVisible()) return b.click();
      for (const modo of ['Dibujar', 'Armar', 'Conectar']) {
        await page.getByRole('button', { name: modo, exact: true }).click();
        if (await b.isVisible()) return b.click();
      }
      throw new Error(`No se encontró la herramienta «${nombre}» en ningún modo`);
    },
  };
}
