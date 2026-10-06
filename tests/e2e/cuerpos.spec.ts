import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { herramienta } from './ayudas';

const estado = (page: Page) => page.getByRole('status').filter({ hasText: 'elemento' });
const panel = (page: Page) => page.locator('section.propiedades');
const campo = (page: Page, etiqueta: string) => page.getByLabel(etiqueta, { exact: true });

async function pos(page: Page, x: number, y: number): Promise<[number, number]> {
  const lienzo = page.locator('canvas.lienzo');
  const box = (await lienzo.boundingBox())!;
  const esc = Number(await lienzo.getAttribute('data-escala'));
  return [box.x + box.width / 2 + x * esc, box.y + box.height / 2 - y * esc];
}

async function arrastrar(page: Page, de: [number, number], a: [number, number]): Promise<void> {
  const p0 = await pos(page, ...de);
  const p1 = await pos(page, ...a);
  await page.mouse.move(...p0);
  await page.mouse.down();
  await page.mouse.move(...p1, { steps: 10 });
  await page.mouse.up();
}

async function clic(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.click(...(await pos(page, x, y)));
}

async function tikz(page: Page): Promise<string> {
  await page.locator('summary', { hasText: 'Exportar' }).click();
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar .tex (fragmento)' }).click()]);
  const t = readFileSync((await d.path())!, 'utf8');
  await page.locator('summary', { hasText: 'Exportar' }).click();
  return t;
}

const num = async (page: Page, etiqueta: string): Promise<number> => Number((await campo(page, etiqueta).inputValue()).replace(',', '.'));

/** Plano inclinado (cuña) de (-3,-1.5) a (2,1): unos 26,6°, y un bloque soltado cerca que se apoya solo. */
async function escenaPlano(page: Page): Promise<void> {
  await herramienta(page, 'Cuerpos').click();
  await herramienta(page, 'Plano inclinado').click();
  await arrastrar(page, [-3, -1.5], [2, 1]);
  await herramienta(page, 'Bloque').click();
  await clic(page, -0.5, 0);
}

async function ponerRoce(page: Page): Promise<void> {
  await herramienta(page, 'Seleccionar').click();
  await clic(page, 1.2, 0.6); // la superficie
  await expect(panel(page).getByRole('heading', { name: 'Superficie' })).toBeVisible();
  await campo(page, 'Coeficiente de roce estático').fill('0.2');
  await campo(page, 'Coeficiente de roce estático').press('Enter');
  await campo(page, 'Coeficiente de roce cinético').fill('0.1');
  await campo(page, 'Coeficiente de roce cinético').press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto('./?transporte=local');
  await page.locator('canvas.lienzo').waitFor();
});

test('un bloque soltado cerca del plano se apoya solo, alineado con él', async ({ page }) => {
  await escenaPlano(page);
  await expect(estado(page)).toContainText('2 elementos');
  await herramienta(page, 'Seleccionar').click();
  await clic(page, -0.5, 0);
  await expect(panel(page).getByRole('heading', { name: 'Bloque' })).toBeVisible();
  // Quedó girado como el plano: atan(2,5 / 5) = 26,57°
  expect(await num(page, 'Ángulo del bloque')).toBeCloseTo(26.57, 0);
});

test('esfera y polea se colocan con un clic; cuerda y resorte, arrastrando (un clic solo no los crea)', async ({ page }) => {
  await herramienta(page, 'Cuerpos').click();
  for (const [nombre, x] of [['Esfera', -3.5], ['Polea', -2.2]] as const) {
    await herramienta(page, nombre).click();
    await clic(page, x, 1.5);
  }
  await herramienta(page, 'Cuerda').click();
  await clic(page, -0.8, 1.5); // empieza la conexión toque a toque: todavía no hay cuerda
  await expect(estado(page)).toContainText('2 elementos');
  await page.keyboard.press('Escape');
  await arrastrar(page, [-1.3, 1.5], [-0.3, 1.5]);
  await herramienta(page, 'Resorte').click();
  await arrastrar(page, [0.3, 1.5], [1.3, 1.5]);
  await expect(estado(page)).toContainText('4 elementos');
});

test('el panel del cuerpo anticipa fuerzas y aceleración: plano con roce cinético', async ({ page }) => {
  await escenaPlano(page);
  await ponerRoce(page);
  await clic(page, -0.5, 0);
  await expect(panel(page).getByRole('heading', { name: 'Bloque' })).toBeVisible();
  await campo(page, 'Masa del bloque').fill('3');
  await campo(page, 'Masa del bloque').press('Enter');
  const lista = panel(page).locator('ul.fuerzas');
  await expect(lista).toContainText('Peso: 29,4 N');
  await expect(lista).toContainText('Normal: 26,3 N'); // 3 · 9,8 · cos 26,57° = 26,29
  await expect(lista).toContainText('Roce:');
  // a = g (sen θ − μk cos θ) = 9,8 (0,447 − 0,1 · 0,894) = 3,51 m/s², hacia abajo (negativa en x)
  await expect(panel(page)).toContainText('Aceleración: -3,5');
});

test('Generar diagrama de cuerpo libre dibuja cuerpo, ejes, fuerzas y ΣF = m a, y un solo deshacer lo quita', async ({ page }) => {
  await escenaPlano(page);
  await ponerRoce(page);
  await clic(page, -0.5, 0);
  await expect(estado(page)).toContainText('2 elementos');
  await page.getByRole('button', { name: 'Generar diagrama de cuerpo libre' }).click();
  // cuerpo + ejes + 3 fuerzas (peso, normal, roce) + texto = 6 elementos nuevos
  await expect(estado(page)).toContainText('8 elementos');

  const t = await tikz(page);
  expect(t).toContain('\\sum F_x');
  expect(t).toContain('\\sin\\theta');
  expect(t).toContain('f_k');
  expect(t).toContain('\\sum F_y');
  expect(t).toContain('% --- vectores ---');
  expect(t).toContain('% --- objetos ---');
  expect(t).toContain('definecolor{pzcuerpo}');

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(estado(page)).toContainText('2 elementos');
});

test('un bloque en el aire cae libremente: solo el peso y a = −g', async ({ page }) => {
  await herramienta(page, 'Cuerpos').click();
  await herramienta(page, 'Bloque').click();
  await clic(page, -1, 1);
  await herramienta(page, 'Seleccionar').click();
  await clic(page, -1, 1);
  const lista = panel(page).locator('ul.fuerzas');
  await expect(lista).toContainText('Peso:');
  await expect(lista.locator('li')).toHaveCount(1);
  await expect(panel(page)).toContainText('-9,8 m/s² en y');
});

test('al cambiar la masa el diagrama se recalcula', async ({ page }) => {
  await escenaPlano(page);
  await herramienta(page, 'Seleccionar').click();
  await clic(page, -0.5, 0);
  await campo(page, 'Masa del bloque').fill('10');
  await campo(page, 'Masa del bloque').press('Enter');
  await expect(panel(page).locator('ul.fuerzas')).toContainText('Peso: 98 N');
});

// Capturas de la etapa: CAPTURAS=1 npm run test:e2e
for (const [esquema, nombre] of [['light', 'claro'], ['dark', 'oscuro']] as const) {
  test(`captura: plano inclinado con diagrama de cuerpo libre (${nombre})`, async ({ page }) => {
    test.skip(!process.env['CAPTURAS'], 'solo con CAPTURAS=1');
    await page.emulateMedia({ colorScheme: esquema });
    await page.goto('./?transporte=local');
    await page.locator('canvas.lienzo').waitFor();
    await escenaPlano(page);
    await ponerRoce(page);
    await clic(page, -0.5, 0);
    await page.getByRole('button', { name: 'Generar diagrama de cuerpo libre' }).click();
    await page.keyboard.press('Escape');
    // Encuadra la escena y el diagrama.
    await page.getByLabel('Escala de la vista en píxeles por metro').fill('52');
    await page.getByLabel('Escala de la vista en píxeles por metro').press('Enter');
    await page.keyboard.press('Escape');
    await herramienta(page, 'Mover vista').click();
    await page.mouse.move(800, 600);
    await page.mouse.down();
    await page.mouse.move(520, 560, { steps: 6 });
    await page.mouse.up();
    await page.screenshot({ path: `docs/capturas/etapa4-dcl-${nombre}.png` });
  });
}
