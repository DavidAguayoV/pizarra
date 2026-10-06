import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { herramienta } from './ayudas';

/** Superficies con roce a la vista: el interruptor «Con roce», la etiqueta μ y el panel de la superficie desplegado. */

async function pos(page: Page, x: number, y: number): Promise<[number, number]> {
  const lienzo = page.locator('canvas.lienzo');
  const box = (await lienzo.boundingBox())!;
  const esc = Number(await lienzo.getAttribute('data-escala'));
  return [box.x + box.width / 2 + x * esc, box.y + box.height / 2 - y * esc];
}
const clic = async (page: Page, x: number, y: number) => page.mouse.click(...(await pos(page, x, y)));
async function arrastrar(page: Page, de: [number, number], a: [number, number]): Promise<void> {
  await page.mouse.move(...(await pos(page, ...de)));
  await page.mouse.down();
  await page.mouse.move(...(await pos(page, ...a)), { steps: 10 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
});

test('«Con roce»: el plano nace con μs = 0,4 y μk = 0,3, y el DCL del bloque da a = g (sen θ − μk cos θ)', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto('./?transporte=local');
  await page.locator('canvas.lienzo').waitFor();
  await herramienta(page, 'Con roce').click();
  await expect(page.getByRole('button', { name: 'Con roce', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await herramienta(page, 'Plano inclinado').click();
  await arrastrar(page, [-3, -1.5], [2, 1]); // 26,57°: tan θ = 0,5 > μs = 0,4 → desliza
  await herramienta(page, 'Bloque').click();
  await clic(page, -0.5, 0);
  await herramienta(page, 'Seleccionar').click();
  await clic(page, -0.5, 0.1);
  // a = 9,8 (sen 26,57° − 0,3 cos 26,57°) = 1,75 m/s², plano abajo (negativa en x, que apunta plano arriba)
  await expect(page.locator('section.propiedades figcaption')).toContainText('a = -1,75 m/s²');
  await clic(page, 1.2, 0.6); // la superficie
  await expect(page.getByLabel('Coeficiente de roce estático')).toHaveValue('0,4');
  await expect(page.getByLabel('Coeficiente de roce cinético')).toHaveValue('0,3');
});

test('en el celular el panel de la superficie se abre desplegado (μ a la vista)', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 839 });
  await page.goto('./?transporte=local');
  await page.locator('canvas.lienzo').waitFor();
  await herramienta(page, 'Superficie').click();
  await clic(page, 0, -1);
  await herramienta(page, 'Seleccionar').click();
  await clic(page, 0.5, -1);
  await expect(page.getByLabel('Coeficiente de roce estático')).toBeVisible();
});
