import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Elemento } from '../../src/core/elementos';
import { crearBloque, crearCuerda, crearPolea, crearSuperficie } from '../../src/physics/objetos';

const herramienta = (page: Page, nombre: string) => page.getByRole('button', { name: nombre, exact: true });
const panelSim = (page: Page) => page.locator('section.panel-sim');
const estado = (page: Page) => page.getByRole('status').filter({ hasText: 'elemento' });
const campo = (page: Page, etiqueta: string) => page.getByLabel(etiqueta, { exact: true });
const tiempo = (page: Page) => panelSim(page).locator('.sim-tiempo');

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

const clic = async (page: Page, x: number, y: number): Promise<void> => {
  await page.mouse.click(...(await pos(page, x, y)));
};

/** Número que sigue a `etiqueta` en un texto con coma decimal ("t = 0,52 s" → 0.52). */
function leer(texto: string, etiqueta: string): number {
  const m = new RegExp(`${etiqueta}\\s*=\\s*(-?[\\d.,e+-]+)`).exec(texto);
  if (!m) throw new Error(`No se encontró "${etiqueta}" en: ${texto}`);
  return Number(m[1]!.replace(',', '.'));
}

/** Carga una escena armada por código (más práctico que dibujarla): se abre como un proyecto. */
async function cargarEscena(page: Page, elementos: Elemento[]): Promise<void> {
  const ops = elementos.map((e, i) => ({ id: `t-${i}`, t: i, autor: 'prueba', tipo: 'elemento/agregar', payload: e }));
  await page.locator('input[type=file][accept*=json]').setInputFiles({
    name: 'escena.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'pizarra', schemaVersion: 1, ops })),
  });
  await expect(estado(page)).toContainText(`${elementos.length} elemento`);
}

async function abrirSim(page: Page): Promise<void> {
  await herramienta(page, 'Simular').click();
  await expect(panelSim(page)).toBeVisible();
}

async function reproducirHasta(page: Page, segundos: number, velocidad = '4'): Promise<void> {
  await campo(page, 'Velocidad de reproducción').selectOption(velocidad);
  await panelSim(page).getByRole('button', { name: /Reproducir/ }).click();
  await expect.poll(async () => leer((await tiempo(page).textContent()) ?? '', 't'), { timeout: 15000 }).toBeGreaterThanOrEqual(segundos);
  await panelSim(page).getByRole('button', { name: /Pausar/ }).click();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto('./?transporte=local');
  await page.locator('canvas.lienzo').waitFor();
});

test('caída libre: el cuerpo cae como y = y₀ − ½ g t² y Reiniciar lo devuelve a su lugar', async ({ page }) => {
  await herramienta(page, 'Cuerpos').click();
  await page.getByRole('button', { name: 'Esfera', exact: true }).click();
  await clic(page, -1, 1.5);
  await abrirSim(page);
  await expect(panelSim(page).locator('.sim-info')).toContainText('y = 1,5 m');
  await reproducirHasta(page, 0.6);
  const t = leer((await tiempo(page).textContent()) ?? '', 't');
  const y = leer((await panelSim(page).locator('.sim-info').textContent()) ?? '', 'y');
  // t y y se muestran con 2 decimales: el error de redondeo de g·t·δt llega a ~0,1 m
  expect(Math.abs(y - (1.5 - 0.5 * 9.8 * t * t))).toBeLessThan(0.15);
  await panelSim(page).getByRole('button', { name: 'Reiniciar' }).click();
  await expect(tiempo(page)).toHaveText('t = 0 s');
  await expect(panelSim(page).locator('.sim-info')).toContainText('y = 1,5 m');
});

test('plano inclinado con roce: desliza y la simulación coincide con la solución analítica', async ({ page }) => {
  await herramienta(page, 'Cuerpos').click();
  await page.getByRole('button', { name: 'Plano inclinado', exact: true }).click();
  await arrastrar(page, [-3, -1.5], [2, 1]);
  await page.getByRole('button', { name: 'Bloque', exact: true }).click();
  await clic(page, -0.5, 0);
  await herramienta(page, 'Seleccionar').click();
  await clic(page, 1.2, 0.6);
  await campo(page, 'Coeficiente de roce estático').fill('0.2');
  await campo(page, 'Coeficiente de roce estático').press('Enter');
  await campo(page, 'Coeficiente de roce cinético').fill('0.1');
  await campo(page, 'Coeficiente de roce cinético').press('Enter');
  await abrirSim(page);
  await reproducirHasta(page, 0.5, '1');
  await expect(panelSim(page).locator('.sim-info')).toContainText('deslizando');
  await expect(panelSim(page).locator('.sim-fuerzas, p[aria-label="Normal, roce y tensiones"]')).toContainText('N =');
  const comp = (await panelSim(page).locator('p.nota', { hasText: 'Diferencia máxima' }).textContent()) ?? '';
  expect(comp).toContain('aceleración constante');
  expect(Number(/([\d,]+e[-+]?\d+) m en posición/.exec(comp)![1]!.replace(',', '.'))).toBeLessThan(2e-3);
});

test('el balance de energía se muestra y es ~0 (E − E₀ − W)', async ({ page }) => {
  await herramienta(page, 'Cuerpos').click();
  await page.getByRole('button', { name: 'Esfera', exact: true }).click();
  await clic(page, 0, 1);
  await abrirSim(page);
  await reproducirHasta(page, 0.4);
  const txt = (await panelSim(page).locator('p.nota', { hasText: 'balance' }).textContent()) ?? '';
  const residuo = Number(/balance E − E₀ − W = (-?[\d,]+e[-+]?\d+)/.exec(txt)![1]!.replace(',', '.'));
  expect(Math.abs(residuo)).toBeLessThan(1e-6);
});

test('masa-resorte: oscilación armónica, eventos del largo natural y período analítico', async ({ page }) => {
  await herramienta(page, 'Cuerpos').click();
  await page.getByRole('button', { name: 'Superficie', exact: true }).click();
  await clic(page, 0, -0.5); // 3 m horizontales centradas en el clic
  await page.getByRole('button', { name: 'Bloque', exact: true }).click();
  await clic(page, 0.2, -0.1);
  await page.getByRole('button', { name: 'Resorte', exact: true }).click();
  await arrastrar(page, [-1.45, -0.2], [-0.25, -0.2]);
  await herramienta(page, 'Seleccionar').click();
  await clic(page, -0.85, -0.2);
  await expect(page.locator('section.propiedades').getByRole('heading', { name: 'Resorte' })).toBeVisible();
  await campo(page, 'Largo natural del resorte').fill('0.8');
  await campo(page, 'Largo natural del resorte').press('Enter');
  await abrirSim(page);
  await reproducirHasta(page, 1.5);
  const comp = (await panelSim(page).locator('p.nota', { hasText: 'Oscilador armónico' }).textContent()) ?? '';
  expect(comp).toContain('T = 2π√(m/k)');
  expect(Number(/([\d,]+e[-+]?\d+) m en posición/.exec(comp)![1]!.replace(',', '.'))).toBeLessThan(1e-4);
  await expect(panelSim(page).locator('ol.sim-eventos')).toContainText('largo natural');
});

test('Atwood: la polea reparte la tensión real T = 2 m₁ m₂ g /(m₁ + m₂)', async ({ page }) => {
  await cargarEscena(page, [
    crearPolea({ x: 0, y: 1.4 }, 0.3),
    crearCuerda({ x: -0.3, y: 1.4 }, { x: -0.3, y: -0.4 }),
    crearCuerda({ x: 0.3, y: 1.4 }, { x: 0.3, y: 0.1 }),
    crearBloque({ x: -0.3, y: -0.6 }, 0.4, 0.4, { masa: 3, etiqueta: 'm_1' }),
    crearBloque({ x: 0.3, y: -0.1 }, 0.4, 0.4, { masa: 2, etiqueta: 'm_2' }),
  ]);
  await abrirSim(page);
  await reproducirHasta(page, 0.4);
  const f = (await panelSim(page).locator('p[aria-label="Normal, roce y tensiones"]').textContent()) ?? '';
  expect(leer(f, 'T')).toBeCloseTo((2 * 3 * 2 * 9.8) / 5, 1); // 23,52 N
});

test('bloque en la mesa unido por una polea a una masa colgante, con roce', async ({ page }) => {
  await cargarEscena(page, [
    crearSuperficie({ x: -3, y: 0 }, { x: 0.4, y: 0 }, { muS: 0.3, muK: 0.2 }),
    crearBloque({ x: -1, y: 0.2 }, 0.4, 0.4, { masa: 2, etiqueta: 'm_1' }),
    crearPolea({ x: 0.7, y: 0.2 }, 0.3),
    crearCuerda({ x: -0.8, y: 0.2 }, { x: 0.4, y: 0.2 }),
    crearCuerda({ x: 1, y: 0.2 }, { x: 1, y: -0.9 }),
    crearBloque({ x: 1, y: -1.1 }, 0.4, 0.4, { masa: 3, etiqueta: 'm_2' }),
  ]);
  await abrirSim(page);
  await reproducirHasta(page, 0.3);
  const f = (await panelSim(page).locator('p[aria-label="Normal, roce y tensiones"]').textContent()) ?? '';
  const a = (3 * 9.8 - 0.2 * 2 * 9.8) / 5;
  expect(leer(f, 'T')).toBeCloseTo(3 * (9.8 - a), 1);
  expect(leer(f, 'f')).toBeCloseTo(0.2 * 2 * 9.8, 1);
});

test('la velocidad inicial se edita en el panel del cuerpo y define la trayectoria', async ({ page }) => {
  await herramienta(page, 'Cuerpos').click();
  await page.getByRole('button', { name: 'Superficie', exact: true }).click();
  await arrastrar(page, [-4.5, -1], [4.5, -1]);
  await page.getByRole('button', { name: 'Esfera', exact: true }).click();
  await clic(page, -3, 0);
  await herramienta(page, 'Seleccionar').click();
  await clic(page, -3, 0);
  await campo(page, 'Rapidez inicial').fill('5');
  await campo(page, 'Rapidez inicial').press('Enter');
  await campo(page, 'Dirección de la velocidad inicial').fill('50');
  await campo(page, 'Dirección de la velocidad inicial').press('Enter');
  await abrirSim(page);
  await reproducirHasta(page, 1.0);
  await expect(panelSim(page).locator('ol.sim-eventos')).toContainText('llega a la superficie');
  const n = await estado(page).textContent();
  await panelSim(page).getByRole('button', { name: 'Dejar trayectoria en la pizarra' }).click();
  await expect(estado(page)).not.toHaveText(n ?? '');
});

test('exporta CSV y el gráfico a pgfplots', async ({ page }) => {
  await herramienta(page, 'Cuerpos').click();
  await page.getByRole('button', { name: 'Esfera', exact: true }).click();
  await clic(page, 0, 1);
  await abrirSim(page);
  await reproducirHasta(page, 0.3);
  const [csv] = await Promise.all([page.waitForEvent('download'), panelSim(page).getByRole('button', { name: 'Descargar CSV' }).click()]);
  const t = readFileSync((await csv.path())!, 'utf8');
  expect(t.startsWith('﻿t (s);x (m);y (m)')).toBe(true);
  expect(t.trim().split('\r\n').length).toBeGreaterThan(20);
  await panelSim(page).getByRole('button', { name: 'Energía', exact: true }).click();
  const [tex] = await Promise.all([page.waitForEvent('download'), panelSim(page).getByRole('button', { name: 'Descargar .tex del gráfico' }).click()]);
  const g = readFileSync((await tex.path())!, 'utf8');
  expect(g).toContain('\\begin{axis}');
  expect(g).toContain('\\addlegendentry{$E_{mec}$}');
});

test('al editar la escena la simulación vuelve a t = 0 y al cerrarla se restaura la pizarra', async ({ page }) => {
  await herramienta(page, 'Cuerpos').click();
  await page.getByRole('button', { name: 'Esfera', exact: true }).click();
  await clic(page, 0, 1);
  await abrirSim(page);
  await panelSim(page).getByRole('button', { name: 'Paso' }).click();
  await expect(tiempo(page)).toHaveText('t = 0,05 s');
  await herramienta(page, 'Línea').click();
  await arrastrar(page, [-2, 1.8], [2, 1.8]); // arriba del panel de simulación
  await expect(tiempo(page)).toHaveText('t = 0 s');
  await panelSim(page).getByRole('button', { name: 'Cerrar' }).click();
  await expect(panelSim(page)).toBeHidden();
});

test('el estudiante ve la simulación moverse en su celular', async ({ page, context }) => {
  await page.getByRole('button', { name: 'Compartir', exact: true }).click();
  await page.getByRole('button', { name: 'Crear sala' }).click();
  const codigo = (await page.locator('.codigo-sala').textContent())!;
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await herramienta(page, 'Cuerpos').click();
  await page.getByRole('button', { name: 'Esfera', exact: true }).click();
  await clic(page, 0, 1.5);
  const est = await context.newPage();
  await est.setViewportSize({ width: 390, height: 780 });
  await est.goto(`./?sala=${codigo}&transporte=local`);
  await expect(est.getByRole('status')).toContainText('Conectado');
  await est.waitForTimeout(400);
  const huella = (): Promise<number> =>
    est.evaluate(() => {
      const c = document.querySelector('canvas.lienzo') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i]! < 120 && d[i + 1]! < 140) h = (h * 31 + i) % 1000003;
      return h;
    });
  await abrirSim(page);
  await campo(page, 'Velocidad de reproducción').selectOption('1');
  await panelSim(page).getByRole('button', { name: /Reproducir/ }).click();
  await est.waitForTimeout(400);
  const a = await huella();
  await est.waitForTimeout(500);
  const b = await huella();
  expect(a).not.toBe(b); // lo que se ve en el celular cambió: el cuerpo se movió
});

// Capturas de la etapa: CAPTURAS=1 npm run test:e2e
for (const [esquema, nombre] of [['light', 'claro'], ['dark', 'oscuro']] as const) {
  test(`captura: simulación del plano inclinado con roce (${nombre})`, async ({ page }) => {
    test.skip(!process.env['CAPTURAS'], 'solo con CAPTURAS=1');
    await page.emulateMedia({ colorScheme: esquema });
    await page.goto('./?transporte=local');
    await page.locator('canvas.lienzo').waitFor();
    await herramienta(page, 'Cuerpos').click();
    await page.getByRole('button', { name: 'Plano inclinado', exact: true }).click();
    await arrastrar(page, [-4, -0.5], [1, 2]);
    await page.getByRole('button', { name: 'Bloque', exact: true }).click();
    await clic(page, -1.2, 1.3); // un poco por encima del plano (y(−1,2) ≈ 0,9 m), para que se apoye arriba
    await herramienta(page, 'Seleccionar').click();
    await clic(page, 0.2, 1.6);
    await campo(page, 'Coeficiente de roce estático').fill('0.25');
    await campo(page, 'Coeficiente de roce estático').press('Enter');
    await campo(page, 'Coeficiente de roce cinético').fill('0.15');
    await campo(page, 'Coeficiente de roce cinético').press('Enter');
    await clic(page, 3, 2.2); // clic en vacío: suelta la selección
    await abrirSim(page);
    await campo(page, 'Velocidad de reproducción').selectOption('1');
    await panelSim(page).getByRole('button', { name: /Reproducir/ }).click();
    await expect.poll(async () => leer((await tiempo(page).textContent()) ?? '', 't'), { timeout: 15000 }).toBeGreaterThanOrEqual(0.9);
    await panelSim(page).getByRole('button', { name: /Pausar/ }).click();
    await page.screenshot({ path: `docs/capturas/etapa5-simulacion-${nombre}.png` });
  });
}
