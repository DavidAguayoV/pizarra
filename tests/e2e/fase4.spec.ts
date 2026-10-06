import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { herramienta } from './ayudas';

/** Fase 4: montajes, alinear, girar, duplicar, rejilla y medir. */

async function pos(page: Page, x: number, y: number): Promise<[number, number]> {
  const lienzo = page.locator('canvas.lienzo');
  const box = (await lienzo.boundingBox())!;
  const esc = Number(await lienzo.getAttribute('data-escala'));
  return [box.x + box.width / 2 + x * esc, box.y + box.height / 2 - y * esc];
}
const clic = async (page: Page, x: number, y: number) => page.mouse.click(...(await pos(page, x, y)));
const contar = async (page: Page): Promise<number> => Number(/(\d+) elemento/.exec((await page.locator('.estado').textContent()) ?? '')?.[1] ?? -1);

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
});

test('en el celular, «Plano, polea y colgante» desde Montajes se simula a la primera: a = 3,92 m/s²', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./?transporte=local');
  await page.locator('canvas.lienzo').waitFor();
  await page.getByRole('button', { name: 'Armar', exact: true }).click();
  await page.locator('.menu-montajes > summary').click();
  await page.locator('[data-montaje="plano-polea"]').click();
  await expect(page.locator('.menu-problemas')).toBeHidden();
  await page.getByRole('button', { name: 'Simular', exact: true }).click();
  const panel = page.locator('section.panel-sim');
  // m₁ = 2 kg en el plano de 30°, m₂ = 3 kg colgando, sin roce: T = m₂ (g − a) = 3 (9,8 − 3,92) = 17,64 N
  await expect(panel).toContainText('T = 17,6 N');
});

test('montaje deshecho de una vez; varios seleccionados se alinean; Ctrl+D duplica conectado', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./?transporte=local');
  await page.locator('canvas.lienzo').waitFor();
  await herramienta(page, 'Armar').click();
  await page.locator('.menu-montajes > summary').click();
  await page.locator('[data-montaje="atwood"]').click();
  await expect.poll(() => contar(page)).toBe(4);
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect.poll(() => contar(page)).toBe(0);
  await page.getByRole('button', { name: 'Rehacer' }).click();
  await expect.poll(() => contar(page)).toBe(4);

  await herramienta(page, 'Seleccionar').click();
  await clic(page, -0.25, -0.3);
  await page.keyboard.down('Shift');
  await clic(page, 0.25, -0.8);
  await page.keyboard.up('Shift');
  await expect(page.locator('section.propiedades')).toContainText('2 elementos seleccionados');
  await page.getByRole('button', { name: 'Abajo', exact: true }).click();
  // Los dos bloques quedan con la base a la misma altura: el de la izquierda bajó 0,5 m
  await clic(page, 0.5, 3); // suelta la selección
  await clic(page, -0.25, -0.8);
  await expect(page.locator('section.propiedades')).toContainText('Bloque');

  // Ctrl+D con todo el Atwood seleccionado: 4 elementos más, sin problemas nuevos
  await page.keyboard.press('Escape');
  for (const [x, y] of [
    [0, 1.5],
    [-0.25, -0.8],
    [0.25, -0.8],
  ] as const) {
    await page.keyboard.down('Shift');
    await clic(page, x, y);
    await page.keyboard.up('Shift');
  }
  await page.keyboard.press('Control+d');
  await expect.poll(() => contar(page)).toBe(7);
  await expect(page.locator('.menu-problemas')).toBeHidden();
});

test('Medir (D) no agrega nada a la escena; G activa la rejilla magnética', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./?transporte=local');
  await page.locator('canvas.lienzo').waitFor();
  await herramienta(page, 'Armar').click();
  await page.locator('.menu-montajes > summary').click();
  await page.locator('[data-montaje="atwood"]').click();
  await page.keyboard.press('d');
  await expect(page.getByRole('button', { name: 'Medir', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const [x0, y0] = await pos(page, 0, 1.52);
  const [x1, y1] = await pos(page, -0.24, -0.12);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => contar(page)).toBe(4);
  // (El valor de la medida, «1,619 m · …», lo verifica tests/cota.test.ts: aquí solo que no se agrega nada.)
  await page.keyboard.press('g');
  await expect(page.locator('.aviso')).toContainText('Rejilla magnética');
  // (El botón está en el menú Más, cerrado: se mira su estado sin abrirlo.)
  await expect(page.locator('button', { hasText: 'Rejilla magnética' })).toHaveAttribute('aria-pressed', 'true');
});

// Capturas de la fase: CAPTURAS=1 npx playwright test fase4
for (const [esquema, nombre] of [['light', 'claro'], ['dark', 'oscuro']] as const) {
  test(`captura: menú de montajes en el celular y montajes simulándose (${nombre})`, async ({ page }) => {
    test.skip(!process.env['CAPTURAS'], 'solo con CAPTURAS=1');
    await page.emulateMedia({ colorScheme: esquema });
    await page.setViewportSize({ width: 412, height: 860 });
    await page.goto('./?transporte=local');
    await page.locator('canvas.lienzo').waitFor();
    await page.getByRole('button', { name: 'Armar', exact: true }).click();
    await page.locator('.menu-montajes > summary').click();
    await page.screenshot({ path: `docs/capturas/nivel2-fase4-montajes-celular-${nombre}.png` });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('./?transporte=local&nuevo=1');
    await page.locator('canvas.lienzo').waitFor();
    await page.getByRole('button', { name: 'Armar', exact: true }).click();
    await page.locator('.menu-montajes > summary').click();
    await page.locator('[data-montaje="mesa-polea"]').click();
    await page.getByRole('button', { name: 'Simular', exact: true }).click();
    const panel = page.locator('section.panel-sim');
    await panel.getByRole('button', { name: /Reproducir/ }).click();
    await page.waitForTimeout(250);
    await panel.getByRole('button', { name: /Pausar/ }).click().catch(() => undefined);
    await page.screenshot({ path: `docs/capturas/nivel2-fase4-mesa-${nombre}.png` });
  });
}
