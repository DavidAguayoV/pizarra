import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const herramienta = (page: Page, nombre: string) => page.getByRole('button', { name: nombre, exact: true });
const estado = (page: Page) => page.getByRole('status').filter({ hasText: 'elemento' });

/** Coordenadas de pantalla de un punto del mundo (metros): el centro del lienzo es el (0, 0). */
async function pos(page: Page, x: number, y: number): Promise<[number, number]> {
  const lienzo = page.locator('canvas.lienzo');
  const box = (await lienzo.boundingBox())!;
  const esc = Number(await lienzo.getAttribute('data-escala'));
  return [box.x + box.width / 2 + x * esc, box.y + box.height / 2 - y * esc];
}

async function arrastrarMundo(page: Page, de: [number, number], a: [number, number], pasos = 10): Promise<void> {
  const p0 = await pos(page, ...de);
  const p1 = await pos(page, ...a);
  await page.mouse.move(...p0);
  await page.mouse.down();
  await page.mouse.move(...p1, { steps: pasos });
  await page.mouse.up();
}

async function clicMundo(page: Page, x: number, y: number, mod?: 'Shift'): Promise<void> {
  const [px, py] = await pos(page, x, y);
  if (mod) await page.keyboard.down(mod);
  await page.mouse.click(px, py);
  if (mod) await page.keyboard.up(mod);
}

const panel = (page: Page) => page.locator('section.propiedades');
const campo = (page: Page, etiqueta: string) => page.getByLabel(etiqueta, { exact: true });

async function bajarTikz(page: Page): Promise<string> {
  await page.locator('summary', { hasText: 'Exportar' }).click();
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar .tex (fragmento)' }).click()]);
  const t = readFileSync((await d.path())!, 'utf8');
  await page.locator('summary', { hasText: 'Exportar' }).click();
  return t;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto('./?transporte=local');
  await page.locator('canvas.lienzo').waitFor();
});

test('los ejes se dibujan con un arrastre, quedan rotados y se editan con números', async ({ page }) => {
  await herramienta(page, 'Ejes').click();
  await arrastrarMundo(page, [-1, -1], [-1 + 1.5 * Math.cos(Math.PI / 6), -1 + 1.5 * Math.sin(Math.PI / 6)]);
  await expect(estado(page)).toContainText('1 elemento ');

  await herramienta(page, 'Seleccionar').click();
  await clicMundo(page, -1 + 0.75 * Math.cos(Math.PI / 6), -1 + 0.75 * Math.sin(Math.PI / 6));
  await expect(panel(page).getByRole('heading', { name: 'Sistema de referencia' })).toBeVisible();
  const ang = Number((await campo(page, 'Ángulo de los ejes').inputValue()).replace(',', '.'));
  expect(ang).toBeGreaterThan(28);
  expect(ang).toBeLessThan(32);

  await campo(page, 'Ángulo de los ejes').fill('45');
  await campo(page, 'Ángulo de los ejes').press('Enter');
  await campo(page, 'Etiqueta del eje x').fill("x'");
  await campo(page, 'Etiqueta del eje x').press('Enter');
  await expect(campo(page, 'Etiqueta del eje x')).toHaveValue("x'");
  expect(Number((await campo(page, 'Ángulo de los ejes').inputValue()).replace(',', '.'))).toBeCloseTo(45, 1);
});

test('un vector por arrastre, con su módulo y ángulo exactos escritos a mano', async ({ page }) => {
  await herramienta(page, 'Vector').click();
  await page.getByRole('button', { name: 'Peso', exact: true }).click();
  await arrastrarMundo(page, [0, 1], [0, -1]);
  await expect(estado(page)).toContainText('1 elemento ');

  await herramienta(page, 'Seleccionar').click();
  await clicMundo(page, 0, 0);
  await expect(panel(page).getByRole('heading', { name: 'Vector' })).toBeVisible();
  // 2 m de flecha × 10 N/m = 20 N, hacia abajo (−90°)
  expect(Number((await campo(page, 'Módulo del vector').inputValue()).replace(',', '.'))).toBeCloseTo(20, 0);
  expect(Number((await campo(page, 'Ángulo del vector').inputValue()).replace(',', '.'))).toBeCloseTo(-90, 0);

  await campo(page, 'Módulo del vector').fill('50');
  await campo(page, 'Módulo del vector').press('Enter');
  await campo(page, 'Ángulo del vector').fill('-60');
  await campo(page, 'Ángulo del vector').press('Enter');
  expect(Number((await campo(page, 'Módulo del vector').inputValue()).replace(',', '.'))).toBeCloseTo(50, 1);
  expect(Number((await campo(page, 'Ángulo del vector').inputValue()).replace(',', '.'))).toBeCloseTo(-60, 1);

  await panel(page).getByLabel('Mostrar valor en la etiqueta').check();
  const tex = await bajarTikz(page);
  expect(tex).toContain('m\\vec{g}=50\\,\\mathrm{N}');
  expect(tex).toContain('definecolor{pzcampo}'); // el peso usa el color de la familia "campo"
});

test('un vector por valores aparece donde se indica y respeta el ángulo del sistema de referencia', async ({ page }) => {
  await herramienta(page, 'Ejes').click();
  await arrastrarMundo(page, [-1, -1], [-1 + 1.5 * Math.cos(Math.PI / 6), -1 + 1.5 * Math.sin(Math.PI / 6)]);
  await herramienta(page, 'Vector').click();
  await page.getByRole('button', { name: 'Fuerza aplicada', exact: true }).click();
  await campo(page, 'Módulo del vector nuevo').fill('40');
  await campo(page, 'Módulo del vector nuevo').press('Enter');
  await campo(page, 'Ángulo del vector nuevo').fill('20');
  await campo(page, 'Ángulo del vector nuevo').press('Enter');
  await page.getByRole('button', { name: 'Agregar por valores' }).click();
  await expect(estado(page)).toContainText('2 elementos');
  // Quedó seleccionado: 40 N a 20° del eje x de los ejes (no de la horizontal).
  expect(Number((await campo(page, 'Módulo del vector').inputValue()).replace(',', '.'))).toBeCloseTo(40, 1);
  expect(Number((await campo(page, 'Ángulo del vector').inputValue()).replace(',', '.'))).toBeCloseTo(20, 1);
});

test('las componentes y el ángulo salen en pantalla y en el TikZ', async ({ page }) => {
  await herramienta(page, 'Vector').click();
  await page.getByRole('button', { name: 'Fuerza aplicada', exact: true }).click();
  await arrastrarMundo(page, [-1, 0], [1, 1.2]);
  await herramienta(page, 'Seleccionar').click();
  await clicMundo(page, 0, 0.6);
  await panel(page).getByLabel('Mostrar componentes').check();
  await panel(page).getByLabel('Marcar ángulo con el eje x').check();
  const tex = await bajarTikz(page);
  expect(tex).toContain('dotted'); // líneas de proyección
  expect(tex).toContain('dash pattern'); // componentes
  expect(tex).toContain('F_x');
  expect(tex).toContain('F_y');
  expect(tex).toContain('arc[start angle=0');
  expect(tex).toContain('{$\\theta$}');
});

test('suma punta con cola de dos vectores seleccionados', async ({ page }) => {
  await herramienta(page, 'Vector').click();
  await page.getByRole('button', { name: 'Fuerza aplicada', exact: true }).click();
  await arrastrarMundo(page, [-2, -1], [1, -1]); // 3 m = 30 N, horizontal
  await arrastrarMundo(page, [-2, 0.2], [-2, 2.7]); // 2,5 m = 25 N, vertical
  await expect(estado(page)).toContainText('2 elementos');

  await herramienta(page, 'Seleccionar').click();
  await clicMundo(page, -0.5, -1);
  await clicMundo(page, -2, 1.5, 'Shift');
  await expect(panel(page).getByRole('heading', { name: '2 vectores seleccionados' })).toBeVisible();
  await expect(panel(page).getByRole('status')).toContainText(/39,[01] N a 39,[78]°/);

  await page.getByRole('button', { name: 'Sumar (punta con cola)' }).click();
  await expect(estado(page)).toContainText('4 elementos'); // 2 originales + copia punteada + resultante
  await expect(panel(page).getByRole('heading', { name: 'Vector' })).toBeVisible();
  expect(Number((await campo(page, 'Módulo del vector').inputValue()).replace(',', '.'))).toBeCloseTo(39.05, 0);
  await page.getByRole('button', { name: 'Deshacer' }).click(); // un solo deshacer quita copia y resultante
  await expect(estado(page)).toContainText('2 elementos');
});

test('mover un elemento, girar los ejes por su asa, borrar con Suprimir y deshacer', async ({ page }) => {
  await herramienta(page, 'Línea').click();
  await arrastrarMundo(page, [-2, 0], [0, 0]);
  await herramienta(page, 'Seleccionar').click();
  await arrastrarMundo(page, [-1, 0], [-1, 2]);
  await expect(estado(page)).toContainText('1 elemento ');
  await expect(page.getByRole('button', { name: 'Deshacer' })).toBeEnabled();

  // Después de mover, la línea ya no está en el eje horizontal: tocar ahí no selecciona nada.
  await clicMundo(page, 2.5, -1.5);
  await page.keyboard.press('Delete');
  await expect(estado(page)).toContainText('1 elemento ');
  await clicMundo(page, -1, 2);
  await page.keyboard.press('Delete');
  await expect(estado(page)).toContainText('0 elementos');
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(estado(page)).toContainText('1 elemento ');

  // Ejes: girar tirando de la punta del eje x.
  await herramienta(page, 'Ejes').click();
  await arrastrarMundo(page, [-2, -1], [-0.5, -1]);
  await herramienta(page, 'Seleccionar').click();
  await clicMundo(page, -1.25, -1);
  await arrastrarMundo(page, [-0.5, -1], [-2 + 1.5 * Math.cos(Math.PI / 4), -1 + 1.5 * Math.sin(Math.PI / 4)]);
  await clicMundo(page, -2, -1); // vuelve a mirar el panel
  await expect(panel(page).getByRole('heading', { name: 'Sistema de referencia' })).toBeVisible();
  expect(Number((await campo(page, 'Ángulo de los ejes').inputValue()).replace(',', '.'))).toBeGreaterThan(40);
});

test('el estudiante ve el vector y sus cambios, y arrastrar se ve mientras se arrastra', async ({ page, context }) => {
  await page.getByRole('button', { name: 'Compartir', exact: true }).click();
  await page.getByRole('button', { name: 'Crear sala' }).click();
  const codigo = (await page.locator('.codigo-sala').textContent())!;
  await page.getByRole('button', { name: 'Cerrar' }).click();
  const est = await context.newPage();
  await est.setViewportSize({ width: 390, height: 780 });
  await est.goto(`./?sala=${codigo}&transporte=local`);
  await expect(est.getByRole('status')).toContainText('Conectado');

  await herramienta(page, 'Vector').click();
  await arrastrarMundo(page, [-1, 0], [1, 0]);
  await expect(est.getByRole('status')).toContainText('1 ops');
  await herramienta(page, 'Seleccionar').click();
  await clicMundo(page, 0, 0);
  await campo(page, 'Módulo del vector').fill('77');
  await campo(page, 'Módulo del vector').press('Enter');
  await expect(est.getByRole('status')).toContainText('2 ops'); // la edición viajó como una op
});

// Capturas de la etapa: CAPTURAS=1 npm run test:e2e
for (const [esquema, nombre] of [['light', 'claro'], ['dark', 'oscuro']] as const) {
  test(`captura: plano inclinado con fuerzas (${nombre})`, async ({ page }) => {
    test.skip(!process.env['CAPTURAS'], 'solo con CAPTURAS=1');
    await page.emulateMedia({ colorScheme: esquema });
    await page.goto('./?transporte=local');
    await page.locator('canvas.lienzo').waitFor();
    const th = Math.PI / 6;

    // Plano inclinado de 30°
    await herramienta(page, 'Línea').click();
    await arrastrarMundo(page, [-3, -1.5], [3, -1.5]);
    await arrastrarMundo(page, [-3, -1.5], [-3 + 5.2, -1.5 + 5.2 * Math.tan(th)]);
    // Bloque (rectángulo) sobre el plano, ejes inclinados con origen en el centro del bloque
    const c = { x: -0.2, y: -1.5 + (-0.2 + 3) * Math.tan(th) + 0.45 };
    await herramienta(page, 'Ejes').click();
    await arrastrarMundo(page, [c.x, c.y], [c.x + 1.7 * Math.cos(th), c.y + 1.7 * Math.sin(th)]);
    // Peso, normal y roce
    await herramienta(page, 'Vector').click();
    await page.getByRole('button', { name: 'Peso', exact: true }).click();
    await arrastrarMundo(page, [c.x, c.y], [c.x, c.y - 1.8]);
    await page.getByRole('button', { name: 'Normal', exact: true }).click();
    await arrastrarMundo(page, [c.x, c.y], [c.x - 1.56 * Math.sin(th), c.y + 1.56 * Math.cos(th)]);
    await page.getByRole('button', { name: 'Roce', exact: true }).click();
    await arrastrarMundo(page, [c.x, c.y], [c.x - 0.9 * Math.cos(th), c.y - 0.9 * Math.sin(th)]);

    // El peso con sus componentes y el ángulo, mostrando los valores
    await herramienta(page, 'Seleccionar').click();
    await clicMundo(page, c.x, c.y - 1.2);
    await panel(page).getByLabel('Mostrar componentes').check();
    await panel(page).getByLabel('Marcar ángulo con el eje x').check();
    await panel(page).getByLabel('Mostrar valor en la etiqueta').check();
    await campo(page, 'Etiqueta del ángulo').fill('\\theta');
    await campo(page, 'Etiqueta del ángulo').press('Enter');
    await page.mouse.click(60, 700); // suelta la selección
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `docs/capturas/etapa3-plano-${nombre}.png` });
  });
}
