import { expect, test } from '@playwright/test';

test('marcas, deshacer/rehacer y cambio de tema', async ({ page }) => {
  await page.goto('./');
  const lienzo = page.getByLabel('Lienzo de la pizarra');
  const estado = page.getByRole('status');

  await lienzo.click({ position: { x: 200, y: 200 } });
  await lienzo.click({ position: { x: 300, y: 250 } });
  await expect(estado).toContainText('2 marcas');
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(estado).toContainText('1 marca ');
  await page.getByRole('button', { name: 'Rehacer' }).click();
  await expect(estado).toContainText('2 marcas');

  await page.getByRole('button', { name: /Tema (claro|oscuro)/ }).click();
  expect(['claro', 'oscuro']).toContain(await page.evaluate(() => document.documentElement.dataset['theme']));
});

// Capturas de verificación de cada etapa: CAPTURAS=1 npm run test:e2e
for (const [esquema, nombre] of [['light', 'claro'], ['dark', 'oscuro']] as const) {
  test(`captura de la etapa (${nombre})`, async ({ page }) => {
    test.skip(!process.env['CAPTURAS'], 'solo con CAPTURAS=1');
    await page.emulateMedia({ colorScheme: esquema });
    await page.setViewportSize({ width: 1000, height: 640 });
    await page.goto('./');
    const lienzo = page.getByLabel('Lienzo de la pizarra');
    for (const [x, y] of [[300, 250], [450, 320], [600, 200]] as const) await lienzo.click({ position: { x, y } });
    await page.screenshot({ path: `docs/capturas/etapa0-${nombre}.png` });
  });
}
