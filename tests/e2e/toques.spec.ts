import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { herramienta, pausarSiCorre } from './ayudas';

/**
 * Celular: conectar **toque a toque** (sin arrastrar), con toques imprecisos como los de un dedo, y paneles que no
 * tapan la escena. Respuesta a la prueba de David en su teléfono («conectar cosas con el teléfono es muy difícil y el
 * menú tapa casi toda la pantalla»).
 */

async function pos(page: Page, x: number, y: number): Promise<[number, number]> {
  const lienzo = page.locator('canvas.lienzo');
  const box = (await lienzo.boundingBox())!;
  const esc = Number(await lienzo.getAttribute('data-escala'));
  return [box.x + box.width / 2 + x * esc, box.y + box.height / 2 - y * esc];
}
/** Un toque corrido (dx, dy) píxeles, como cae un dedo. */
const toque = async (page: Page, x: number, y: number, dx = 0, dy = 0) => {
  const [px, py] = await pos(page, x, y);
  await page.mouse.click(px + dx, py + dy);
};
const guia = (page: Page) => page.locator('.guia-toques');

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 412, height: 839 });
  await page.goto('./?transporte=local');
  await page.locator('canvas.lienzo').waitFor();
});

test('Atwood conectado con tres toques imprecisos: bloque, polea, bloque', async ({ page }) => {
  await herramienta(page, 'Polea').click();
  await toque(page, 0, 1.6);
  await herramienta(page, 'Bloque').click();
  await toque(page, -0.3, -0.7);
  await toque(page, 0.4, -1.2);
  await herramienta(page, 'Conectar').click();
  await toque(page, -0.3, -0.75, 6, 10); // dentro de m₁, no en su borde
  await expect(guia(page)).toContainText('toca la polea');
  await toque(page, 0, 1.6, -12, 8); // la polea, corrido
  await expect(guia(page)).toContainText('otra polea, o el otro extremo');
  await toque(page, 0.4, -1.25, 10, -6); // dentro de m₂
  await expect(guia(page)).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'elemento' })).toContainText('4 elementos');
  await expect(page.locator('details.menu-problemas')).toBeHidden(); // tramos verticales: nada que arreglar

  await page.getByRole('button', { name: 'Simular', exact: true }).click();
  const panel = page.locator('section.panel-sim');
  // En el celular el panel parte compacto: deja ver la escena.
  expect((await panel.boundingBox())!.height).toBeLessThan(839 * 0.2);
  await panel.getByRole('button', { name: /Reproducir/ }).click();
  await page.waitForTimeout(400);
  await pausarSiCorre(page);
  const f = (await panel.locator('p[aria-label="Normal, roce y tensiones"]').textContent()) ?? '';
  expect(Number(/T\s*=\s*([\d,]+)/.exec(f)![1]!.replace(',', '.'))).toBeCloseTo(23.52, 1);
});

test('un toque suelto con la cuerda no crea nada; Cancelar descarta lo empezado', async ({ page }) => {
  await herramienta(page, 'Cuerda').click();
  await toque(page, 1.5, 2);
  await expect(guia(page)).toBeVisible();
  await guia(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(guia(page)).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'elemento' })).toContainText('0 elementos');
});

test('el panel de un bloque parte plegado en el celular y se suelta al simular', async ({ page }) => {
  await herramienta(page, 'Bloque').click();
  await toque(page, 0, 0);
  await herramienta(page, 'Seleccionar').click();
  await toque(page, 0, 0);
  const prop = page.locator('section.propiedades');
  await expect(prop.getByRole('button', { name: 'Editar' })).toBeVisible();
  await expect(prop.getByLabel('Masa del bloque')).toBeHidden();
  await prop.getByRole('button', { name: 'Editar' }).click();
  await expect(prop.getByLabel('Masa del bloque')).toBeVisible();
  await page.getByRole('button', { name: 'Simular', exact: true }).click();
  await expect(prop).toBeHidden();
});
