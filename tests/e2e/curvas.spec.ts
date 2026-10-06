import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { herramienta } from './ayudas';

/** Superficies curvas, loops y paso de una superficie a otra. */

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
  await page.mouse.move(...(await pos(page, ...a)), { steps: 8 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./?transporte=local');
  await page.locator('canvas.lienzo').waitFor();
});

test('un bloque que baja por un plano inclinado pasa al piso (no lo atraviesa)', async ({ page }) => {
  await herramienta(page, 'Superficie').click();
  await arrastrar(page, [-6, -2], [1, -2]);
  await herramienta(page, 'Plano inclinado').click();
  await arrastrar(page, [-4, -2], [-1, -0.27]);
  await herramienta(page, 'Bloque').click();
  await clic(page, -1.8, -0.6);
  await herramienta(page, 'Simular').click();
  const panel = page.locator('section.panel-sim');
  await panel.getByRole('button', { name: /Reproducir/ }).click();
  await expect(panel).toContainText('pasa a la otra superficie', { timeout: 10_000 });
});

test('la herramienta Curva dibuja un valle; su panel muestra la curvatura y el radio', async ({ page }) => {
  await herramienta(page, 'Curva').click();
  await clic(page, 0, 0);
  await herramienta(page, 'Seleccionar').click();
  await clic(page, 0, 0.0);
  const prop = page.locator('section.propiedades');
  await expect(prop.getByLabel('Curvatura de la superficie')).toHaveValue('180');
  await expect(prop).toContainText('Arco de radio 1,5 m');
});

test('el montaje Loop se simula: la esfera llega arriba del loop sin despegarse', async ({ page }) => {
  await page.getByRole('button', { name: 'Armar', exact: true }).click();
  await page.locator('.menu-montajes > summary').click();
  await page.locator('[data-montaje="loop"]').click();
  await expect(page.locator('.menu-problemas')).toBeHidden();
  await herramienta(page, 'Simular').click();
  const panel = page.locator('section.panel-sim');
  await panel.getByRole('button', { name: /Reproducir/ }).click();
  await expect(panel).toContainText('pasa a la otra superficie', { timeout: 10_000 });
  await page.waitForTimeout(1500);
  await expect(panel).not.toContainText('se despega');
});

// Capturas: CAPTURAS=1 npx playwright test curvas
for (const [esquema, nombre] of [['light', 'claro'], ['dark', 'oscuro']] as const) {
  test(`captura: loop simulándose (${nombre})`, async ({ page }) => {
    test.skip(!process.env['CAPTURAS'], 'solo con CAPTURAS=1');
    await page.emulateMedia({ colorScheme: esquema });
    await page.goto('./?transporte=local');
    await page.locator('canvas.lienzo').waitFor();
    await page.getByRole('button', { name: 'Armar', exact: true }).click();
    await page.locator('.menu-montajes > summary').click();
    await page.locator('[data-montaje="loop"]').click();
    await herramienta(page, 'Simular').click();
    const panel = page.locator('section.panel-sim');
    await panel.getByRole('button', { name: /Reproducir/ }).click();
    await expect(panel).toContainText('pasa a la otra superficie', { timeout: 10_000 });
    await page.waitForTimeout(450);
    await panel.getByRole('button', { name: /Pausar/ }).click().catch(() => undefined);
    await page.screenshot({ path: `docs/capturas/curvas-loop-${nombre}.png` });
  });
}
