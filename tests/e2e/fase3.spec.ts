import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { herramienta } from './ayudas';

/** Fase 3 a la vista: bloques apilados, cuerpos que giran y poleas con masa. */

async function pos(page: Page, x: number, y: number): Promise<[number, number]> {
  const lienzo = page.locator('canvas.lienzo');
  const box = (await lienzo.boundingBox())!;
  const esc = Number(await lienzo.getAttribute('data-escala'));
  return [box.x + box.width / 2 + x * esc, box.y + box.height / 2 - y * esc];
}
const clic = async (page: Page, x: number, y: number) => page.mouse.click(...(await pos(page, x, y)));

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
});

test('un bloque soltado sobre otro queda apilado: el DCL muestra N₁₂ y la simulación, la normal entre ellos', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto('./?transporte=local');
  await page.locator('canvas.lienzo').waitFor();
  await herramienta(page, 'Superficie').click();
  await clic(page, 0, -1);
  await herramienta(page, 'Bloque').click();
  await clic(page, -1, -0.75);
  await clic(page, -1, -0.3);
  await herramienta(page, 'Seleccionar').click();
  await clic(page, -1, -0.3);
  await expect(page.locator('section.propiedades figcaption')).toContainText('fuerzas entre cuerpos');
  await herramienta(page, 'Simular').click();
  const panel = page.locator('section.panel-sim');
  await panel.getByRole('combobox', { name: /cuerpo/i }).selectOption({ index: 0 }).catch(() => undefined);
  // m₁ = 2 kg abajo, m₂ = 3 kg arriba: N del suelo = 49 N y N entre ellos = 29,4 N
  await expect(panel).toContainText('N con m₂ = 29,4 N');
});

test('«Gira» y la masa de la polea: Atwood con T₁ ≠ T₂', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto('./?transporte=local');
  await page.locator('canvas.lienzo').waitFor();
  await herramienta(page, 'Polea').click();
  await clic(page, 0, 2);
  await herramienta(page, 'Bloque').click();
  await clic(page, -0.3, -0.3);
  await clic(page, 0.4, -0.8);
  await herramienta(page, 'Conectar').click();
  await clic(page, -0.3, -0.3);
  await clic(page, 0, 2);
  await clic(page, 0.4, -0.8);
  await herramienta(page, 'Seleccionar').click();
  await clic(page, 0, 2);
  await page.getByLabel('Masa de la polea').fill('4');
  await page.getByLabel('Masa de la polea').press('Enter');
  await clic(page, -0.3, -0.3);
  await page.getByText('Gira (cuerpo rígido)').click();
  await expect(page.getByLabel('Gira (cuerpo rígido)')).toBeChecked();
  await herramienta(page, 'Simular').click();
  // m₁ = 2, m₂ = 3, M = 4: a = 9,8/7 = 1,4 m/s²; T₁ = 2·11,2 = 22,4 N; T₂ = 3·8,4 = 25,2 N
  await expect(page.locator('section.panel-sim')).toContainText('T1 = 22,4 N');
  await expect(page.locator('section.panel-sim')).toContainText('T2 = 25,2 N');
});
