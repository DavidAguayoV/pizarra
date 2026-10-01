import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const estado = (page: Page): Locator => page.getByRole('status');
const herramienta = (page: Page, nombre: string) => page.getByRole('button', { name: nombre, exact: true });

async function arrastrar(page: Page, desde: [number, number], hasta: [number, number], pasos = 12): Promise<void> {
  await page.mouse.move(...desde);
  await page.mouse.down();
  await page.mouse.move(...hasta, { steps: pasos });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto('./');
});

test('cada herramienta de dibujo agrega un elemento y todo se deshace y rehace', async ({ page }) => {
  await herramienta(page, 'Lápiz').click();
  await arrastrar(page, [200, 300], [400, 360]);
  await herramienta(page, 'Línea').click();
  await arrastrar(page, [200, 420], [420, 420]);
  await herramienta(page, 'Flecha').click();
  await arrastrar(page, [500, 300], [500, 420]);
  await herramienta(page, 'Rectángulo').click();
  await arrastrar(page, [600, 300], [760, 400]);
  await herramienta(page, 'Elipse').click();
  await arrastrar(page, [800, 300], [960, 400]);
  await herramienta(page, 'Resaltador').click();
  await arrastrar(page, [200, 500], [500, 500]);
  await expect(estado(page)).toContainText('6 elementos');

  await herramienta(page, 'Texto').click();
  await page.mouse.click(600, 520);
  await page.keyboard.type('f_k = mu N');
  await page.keyboard.press('Enter');
  await expect(estado(page)).toContainText('7 elementos');

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(estado(page)).toContainText('6 elementos');
  await page.getByRole('button', { name: 'Rehacer' }).click();
  await expect(estado(page)).toContainText('7 elementos');
});

test('el deslizador cambia el grosor y el resaltador tiene sus propios colores y grosores', async ({ page }) => {
  const desl = page.getByRole('slider', { name: 'Grosor del trazo' });
  const valor = page.locator('.valor-grosor');
  const antes = await valor.textContent();
  await desl.fill('90');
  await expect(valor).not.toHaveText(antes ?? '');
  await expect(page.getByRole('group', { name: 'Color de tinta' })).toBeVisible();

  await herramienta(page, 'Resaltador').click();
  await expect(page.getByRole('group', { name: 'Color del resaltador' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Color de tinta' })).toBeHidden();
  await page.getByRole('button', { name: 'Rosa fluorescente' }).click();
  await desl.fill('100');
  await expect(valor).toHaveText('30 cm');
  await arrastrar(page, [200, 400], [500, 400]);

  // El grosor del resaltador no pisa el de la tinta.
  await herramienta(page, 'Lápiz').click();
  await expect(valor).not.toHaveText('30 cm');
  await page.locator('summary', { hasText: 'Exportar' }).click();
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar .tex (fragmento)' }).click()]);
  const tex = readFileSync(await d.path(), 'utf8');
  expect(tex).toContain('definecolor{pzluzRosa}{HTML}{FF4FA3}');
  expect(tex).toContain('opacity=0.5');
});

test('un clic con el lápiz deja un punto y un clic con una forma no deja nada', async ({ page }) => {
  await herramienta(page, 'Lápiz').click();
  await page.mouse.click(300, 300);
  await expect(estado(page)).toContainText('1 elemento ');
  await herramienta(page, 'Rectángulo').click();
  await page.mouse.click(500, 300);
  await expect(estado(page)).toContainText('1 elemento ');
});

test('el borrador quita lo que toca y se puede deshacer', async ({ page }) => {
  await herramienta(page, 'Línea').click();
  await arrastrar(page, [200, 300], [500, 300]);
  await arrastrar(page, [200, 500], [500, 500]);
  await expect(estado(page)).toContainText('2 elementos');
  await herramienta(page, 'Borrador').click();
  await arrastrar(page, [350, 280], [350, 320]);
  await expect(estado(page)).toContainText('1 elemento ');
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(estado(page)).toContainText('2 elementos');
});

test('la rueda hace zoom y Centrar vuelve a la vista inicial', async ({ page }) => {
  await page.mouse.move(500, 400);
  await page.mouse.wheel(0, -400);
  await expect(estado(page)).not.toContainText('100 px/m');
  await page.getByRole('button', { name: 'Centrar' }).click();
  await expect(estado(page)).toContainText('100 px/m');
});

test('dos dedos hacen zoom y no dejan trazos', async ({ page }) => {
  await herramienta(page, 'Lápiz').click();
  await page.evaluate(() => {
    const c = document.querySelector('canvas.lienzo') as HTMLCanvasElement;
    const ev = (tipo: string, id: number, x: number, y: number) =>
      c.dispatchEvent(
        new PointerEvent(tipo, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1 }),
      );
    ev('pointerdown', 1, 400, 400);
    ev('pointermove', 1, 405, 402);
    ev('pointerdown', 2, 500, 400);
    for (let i = 1; i <= 10; i++) {
      ev('pointermove', 1, 400 - i * 10, 400);
      ev('pointermove', 2, 500 + i * 10, 400);
    }
    ev('pointerup', 1, 300, 400);
    ev('pointerup', 2, 600, 400);
  });
  await expect(estado(page)).toContainText('0 elementos');
  await expect(estado(page)).not.toContainText('100 px/m');
});

test('rechazo de palma: con el lápiz cerca el dedo no dibuja', async ({ page }) => {
  await herramienta(page, 'Lápiz').click();
  await page.evaluate(() => {
    const c = document.querySelector('canvas.lienzo') as HTMLCanvasElement;
    const ev = (tipo: string, t: string, id: number, x: number, y: number, extra = {}) =>
      c.dispatchEvent(new PointerEvent(tipo, { pointerId: id, pointerType: t, clientX: x, clientY: y, bubbles: true, ...extra }));
    ev('pointermove', 'pen', 9, 300, 300); // lápiz flotando
    ev('pointerdown', 'touch', 1, 200, 400);
    ev('pointermove', 'touch', 1, 260, 440);
    ev('pointerup', 'touch', 1, 260, 440);
    // El lápiz sí dibuja, con presión.
    ev('pointerdown', 'pen', 9, 300, 300, { pressure: 0.8, buttons: 1 });
    ev('pointermove', 'pen', 9, 360, 320, { pressure: 0.3, buttons: 1 });
    ev('pointermove', 'pen', 9, 420, 340, { pressure: 0.6, buttons: 1 });
    ev('pointerup', 'pen', 9, 420, 340);
  });
  await expect(estado(page)).toContainText('1 elemento ');
});

test('pegar una imagen la agrega a la pizarra', async ({ page }) => {
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'enunciado.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, PNG_1X1);
  await expect(estado(page)).toContainText('1 elemento ');
});

test('exporta SVG, TikZ y proyecto, y el proyecto se vuelve a abrir igual', async ({ page }) => {
  await herramienta(page, 'Lápiz').click();
  await page.mouse.move(200, 300);
  await page.mouse.down();
  for (const [x, y] of [[250, 270], [300, 260], [350, 280], [400, 330]] as const) await page.mouse.move(x, y, { steps: 6 });
  await page.mouse.up();
  await herramienta(page, 'Flecha').click();
  await arrastrar(page, [500, 300], [500, 420]);
  await herramienta(page, 'Texto').click();
  await page.mouse.click(600, 520);
  await page.keyboard.type('N = m g');
  await page.keyboard.press('Enter');
  await expect(estado(page)).toContainText('3 elementos');

  const bajar = async (nombre: string): Promise<string> => {
    await page.locator('summary', { hasText: 'Exportar' }).click();
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: nombre }).click()]);
    const ruta = await d.path();
    await page.locator('summary', { hasText: 'Exportar' }).click();
    return readFileSync(ruta, 'utf8');
  };

  const svg = await bajar('Descargar SVG');
  expect(svg).toContain('<svg');
  expect(svg).toContain('N = m g');

  const tex = await bajar('Descargar .tex (documento)');
  expect(tex).toContain('\\documentclass[tikz');
  expect(tex).toContain('\\begin{tikzpicture}');
  expect(tex).toContain('N = m g');
  expect(tex).toContain('.. controls');

  const fragmento = await bajar('Descargar .tex (fragmento)');
  expect(fragmento).not.toContain('\\documentclass');

  const json = await bajar('Descargar proyecto (.json)');
  expect(JSON.parse(json)).toMatchObject({ app: 'pizarra', schemaVersion: 1 });

  // Se limpia la pizarra y se reabre el proyecto.
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(estado(page)).toContainText('0 elementos');
  page.once('dialog', (d) => void d.accept());
  await page.locator('input[type=file][accept*=json]').setInputFiles({
    name: 'p.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
  await expect(estado(page)).toContainText('3 elementos');
});

test('un archivo que no es proyecto muestra un aviso en español', async ({ page }) => {
  await page.locator('input[type=file][accept*=json]').setInputFiles({
    name: 'x.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hola":1}'),
  });
  await expect(page.getByRole('alert')).toContainText('no es un proyecto');
});

test('con miles de trazos la vista sigue fluida (desplazar y hacer zoom)', async ({ page }) => {
  const ops = Array.from({ length: 3000 }, (_, i) => {
    const x = (i % 60) * 0.3 - 9;
    const y = Math.floor(i / 60) * 0.2 - 5;
    const puntos = Array.from({ length: 40 }, (_, k) => [x + k * 0.006, y + Math.sin(k / 4) * 0.04, 0.5]).flat();
    return {
      id: `p${i}`, t: i, autor: 'prueba', tipo: 'elemento/agregar',
      payload: { id: `e${i}`, tipo: 'trazo', color: 'tinta', grosor: 0.012, resaltador: false, puntos },
    };
  });
  await page.locator('input[type=file][accept*=json]').setInputFiles({
    name: 'grande.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'pizarra', schemaVersion: 1, ops })),
  });
  await expect(estado(page)).toContainText('3000 elementos');

  const msPorCuadro = await page.evaluate(async () => {
    const c = document.querySelector('canvas.lienzo') as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) {
      c.dispatchEvent(new WheelEvent('wheel', { deltaY: i % 2 ? 60 : -60, clientX: r.left + 400, clientY: r.top + 300, bubbles: true, cancelable: true }));
      await new Promise((res) => requestAnimationFrame(() => res(null)));
    }
    return (performance.now() - t0) / 60;
  });
  console.log(`ms por cuadro con 3000 trazos: ${msPorCuadro.toFixed(1)}`);
  expect(msPorCuadro).toBeLessThan(34); // al menos ~30 fps en el peor caso (todo en pantalla)
});

// Capturas de verificación de cada etapa: CAPTURAS=1 npm run test:e2e
for (const [esquema, nombre] of [['light', 'claro'], ['dark', 'oscuro']] as const) {
  test(`captura de la etapa (${nombre})`, async ({ page }) => {
    test.skip(!process.env['CAPTURAS'], 'solo con CAPTURAS=1');
    await page.emulateMedia({ colorScheme: esquema });
    await page.goto('./');
    const muestra = (etiqueta: string) => page.getByRole('button', { name: etiqueta });

    // Plano inclinado con bloque, fuerzas y ecuación, dibujado con las herramientas.
    await herramienta(page, 'Línea').click();
    await arrastrar(page, [280, 560], [760, 560]);
    await arrastrar(page, [280, 560], [700, 300]);
    await herramienta(page, 'Rectángulo').click();
    await arrastrar(page, [480, 420], [560, 360]);
    await herramienta(page, 'Flecha').click();
    await muestra('Rojo · peso').click();
    await arrastrar(page, [520, 390], [520, 500]);
    await muestra('Azul · normal, tensión').click();
    await arrastrar(page, [520, 390], [575, 335]);
    await muestra('Violeta · roce').click();
    await arrastrar(page, [520, 390], [455, 430]);
    await herramienta(page, 'Lápiz').click();
    await muestra('Verde · velocidad, aceleración').click();
    await arrastrar(page, [340, 540], [380, 520]);
    await herramienta(page, 'Texto').click();
    await muestra('Tinta').click();
    await page.mouse.click(780, 330);
    await page.keyboard.type('Σ F = m a');
    await page.keyboard.press('Enter');
    await herramienta(page, 'Resaltador').click();
    await muestra('Amarillo fluorescente').click();
    await page.getByRole('slider', { name: 'Grosor del trazo' }).fill('45');
    await arrastrar(page, [775, 362], [905, 362]);
    await muestra('Rosa fluorescente').click();
    await page.getByRole('slider', { name: 'Grosor del trazo' }).fill('20');
    await arrastrar(page, [300, 620], [560, 620]);
    await muestra('Celeste fluorescente').click();
    await page.getByRole('slider', { name: 'Grosor del trazo' }).fill('70');
    await arrastrar(page, [620, 600], [860, 640]);
    await page.mouse.move(1000, 700);
    await page.screenshot({ path: `docs/capturas/etapa1-${nombre}.png` });
  });
}
