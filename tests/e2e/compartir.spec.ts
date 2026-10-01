import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

/** Profesor: abre el panel, crea la sala y devuelve su código. */
async function crearSala(prof: Page): Promise<string> {
  await prof.getByRole('button', { name: 'Compartir', exact: true }).click();
  await prof.getByRole('button', { name: 'Crear sala' }).click();
  const codigo = (await prof.locator('.codigo-sala').textContent()) ?? '';
  expect(codigo).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
  return codigo;
}

async function abrirEspectador(ctx: BrowserContext, codigo: string): Promise<Page> {
  const est = await ctx.newPage();
  await est.setViewportSize({ width: 390, height: 780 });
  await est.goto(`./?sala=${codigo}`);
  return est;
}

async function arrastrar(page: Page, desde: [number, number], hasta: [number, number], pasos = 12): Promise<void> {
  await page.mouse.move(...desde);
  await page.mouse.down();
  await page.mouse.move(...hasta, { steps: pasos });
  await page.mouse.up();
}

/** Píxeles del lienzo que no son del color del fondo ni de la grilla (tinta visible). */
const tinta = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const c = document.querySelector('canvas.lienzo') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    const lum = (i: number) => (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
    for (let i = 0; i < d.length; i += 4) {
      const l = lum(i);
      const tintaClara = l < 90; // los trazos "tinta" son casi negros en el tema claro
      if (tintaClara) n++;
    }
    return n;
  });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto('./?transporte=local');
});

test('el panel muestra código grande y QR, y avisa que es modo demostración', async ({ page }) => {
  const codigo = await crearSala(page);
  await expect(page.locator('.qr-sala svg')).toBeVisible();
  await expect(page.locator('.enlace-sala')).toContainText(`?sala=${codigo}`);
  await expect(page.locator('.nota-demo')).toContainText('Modo demostración');
  await expect(page.getByRole('status').filter({ hasText: 'Conectado' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByRole('button', { name: `● En vivo ${codigo}` })).toBeVisible();
});

test('el estudiante ve lo dibujado antes y después de entrar, y deshacer', async ({ page, context }) => {
  await page.getByRole('button', { name: 'Línea', exact: true }).click();
  await arrastrar(page, [200, 300], [600, 300]); // antes de compartir
  const codigo = await crearSala(page);
  await page.getByRole('button', { name: 'Cerrar' }).click();

  const est = await abrirEspectador(context, codigo);
  await expect(est.getByRole('status')).toContainText('Conectado');
  await expect(est.getByRole('status')).toContainText('1 ops');

  await arrastrar(page, [200, 400], [600, 400]);
  await arrastrar(page, [200, 500], [600, 500]);
  await expect(est.getByRole('status')).toContainText('3 ops');

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(est.getByRole('status')).toContainText('4 ops'); // deshacer también es una op
  await expect(page.getByRole('status').filter({ hasText: 'elementos' })).toContainText('2 elementos');
});

test('el trazo en construcción se ve en el celular antes de soltar', async ({ page, context }) => {
  const codigo = await crearSala(page);
  await page.getByRole('button', { name: 'Cerrar' }).click();
  const est = await abrirEspectador(context, codigo);
  await expect(est.getByRole('status')).toContainText('Conectado');
  await est.waitForTimeout(400); // llega el encuadre del profesor
  const antes = await tinta(est);

  await page.getByRole('button', { name: 'Lápiz', exact: true }).click();
  await page.keyboard.press('3');
  await page.mouse.move(300, 300);
  await page.mouse.down();
  for (const [x, y] of [[400, 260], [500, 330], [600, 280], [700, 350]] as const) await page.mouse.move(x, y, { steps: 8 });
  await page.waitForTimeout(250); // sin soltar
  const durante = await tinta(est);
  expect(durante).toBeGreaterThan(antes + 50); // un fallo real daría ~0; en el celular el trazo se ve pequeño
  await page.mouse.up();
  await expect(est.getByRole('status')).toContainText('1 ops');
});

test('seguir al profesor: el zoom lo acompaña y moverse desacopla; el botón vuelve a acoplar', async ({ page, context }) => {
  const codigo = await crearSala(page);
  await page.getByRole('button', { name: 'Cerrar' }).click();
  const est = await abrirEspectador(context, codigo);
  await expect(est.getByRole('status')).toContainText('Conectado');
  const lienzoEst = est.locator('canvas.lienzo');
  await expect(est.getByRole('button', { name: 'Siguiendo al profesor' })).toBeVisible();

  const e0 = await lienzoEst.getAttribute('data-escala');
  await page.mouse.move(500, 400);
  await page.mouse.wheel(0, -500);
  await expect.poll(() => lienzoEst.getAttribute('data-escala')).not.toBe(e0);

  // El estudiante mueve la vista: se desacopla.
  await arrastrar(est, [200, 400], [260, 440]);
  await expect(est.getByRole('button', { name: 'Seguir al profesor' })).toBeVisible();
  const eLibre = await lienzoEst.getAttribute('data-escala');
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(400);
  expect(await lienzoEst.getAttribute('data-escala')).toBe(eLibre);

  // Vuelve a seguir.
  await est.getByRole('button', { name: 'Seguir al profesor' }).click();
  await expect(est.getByRole('button', { name: 'Siguiendo al profesor' })).toBeVisible();
  await expect.poll(() => lienzoEst.getAttribute('data-escala')).not.toBe(eLibre);
});

test('si el profesor deja de compartir, el estudiante lo ve', async ({ page, context }) => {
  const codigo = await crearSala(page);
  const est = await abrirEspectador(context, codigo);
  await expect(est.getByRole('status')).toContainText('Conectado');
  await page.getByRole('button', { name: 'Dejar de compartir' }).click();
  await expect(est.getByRole('alert')).toContainText('Sin conexión');
});

test('una sala que no existe y un código mal escrito se explican', async ({ page }) => {
  await page.goto('./?sala=ZZZZZ&transporte=local');
  await expect(page.getByRole('alert')).toContainText('no existe', { timeout: 5000 });
  await page.goto('./?sala=AB0IO');
  await expect(page.getByRole('heading', { name: 'Código de sala no válido' })).toBeVisible();
});

test('"Copiar a mi pizarra" lleva lo que hay a una pizarra propia', async ({ page, context }) => {
  await page.getByRole('button', { name: 'Rectángulo', exact: true }).click();
  await arrastrar(page, [300, 300], [500, 420]);
  const codigo = await crearSala(page);
  await page.getByRole('button', { name: 'Cerrar' }).click();
  const est = await abrirEspectador(context, codigo);
  await expect(est.getByRole('status')).toContainText('1 ops');
  await est.getByRole('button', { name: 'Copiar a mi pizarra' }).click();
  await expect(est.getByRole('heading', { name: 'Pizarra de Física' })).toBeVisible();
  await expect(est.getByRole('status').filter({ hasText: 'elemento' })).toContainText('1 elemento ');
});

test('el estudiante puede escribir el código a mano', async ({ page }) => {
  await page.getByRole('button', { name: 'Compartir', exact: true }).click();
  await page.getByLabel('Código de la sala').fill('k7p-2q');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\?sala=K7P2Q/);
});

// Capturas de la etapa: CAPTURAS=1 npm run test:e2e
test('captura de la etapa (profesor, panel y celular)', async ({ page, context }) => {
  test.skip(!process.env['CAPTURAS'], 'solo con CAPTURAS=1');
  await page.getByRole('button', { name: 'Flecha', exact: true }).click();
  await arrastrar(page, [400, 500], [400, 620]);
  await page.getByRole('button', { name: 'Rectángulo', exact: true }).click();
  await arrastrar(page, [340, 440], [460, 500]);
  const codigo = await crearSala(page);
  await page.screenshot({ path: 'docs/capturas/etapa2-panel-profesor.png' });
  await page.getByRole('button', { name: 'Cerrar' }).click();
  const est = await abrirEspectador(context, codigo);
  await expect(est.getByRole('status')).toContainText('Conectado');
  await est.waitForTimeout(500);
  await est.screenshot({ path: 'docs/capturas/etapa2-celular.png' });
});
