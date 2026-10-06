import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Cuerda, Elemento, Polea } from '../../src/core/elementos';
import { escenaInicial, reductoresEscena } from '../../src/core/escena';
import type { Escena } from '../../src/core/escena';
import { Store } from '../../src/core/store';
import { herramienta, pausarSiCorre } from './ayudas';

/**
 * Fase 2 del Nivel 2 con la interfaz real: la cuerda en un solo gesto que pasa por la polea (o por el borde de la
 * mesa), el menú de problemas con su arreglo, la polea móvil y el criterio de aceptación: un Atwood en un celular
 * (375 × 812) en pocas acciones, sin escribir nada, que simula con la tensión de la teoría.
 */

const panelSim = (page: Page) => page.locator('section.panel-sim');

async function pos(page: Page, x: number, y: number): Promise<[number, number]> {
  const lienzo = page.locator('canvas.lienzo');
  const box = (await lienzo.boundingBox())!;
  const esc = Number(await lienzo.getAttribute('data-escala'));
  return [box.x + box.width / 2 + x * esc, box.y + box.height / 2 - y * esc];
}
const clic = async (page: Page, x: number, y: number) => page.mouse.click(...(await pos(page, x, y)));
/** Un gesto que pasa por varios puntos (en metros) sin levantar el dedo. */
async function gesto(page: Page, ...puntos: Array<[number, number]>): Promise<void> {
  await page.mouse.move(...(await pos(page, ...puntos[0]!)));
  await page.mouse.down();
  for (const p of puntos.slice(1)) await page.mouse.move(...(await pos(page, ...p)), { steps: 8 });
  await page.mouse.up();
}

function leer(texto: string, etiqueta: string): number {
  const m = new RegExp(`${etiqueta}\\s*=\\s*(-?[\\d.,e+-]+)`).exec(texto);
  if (!m) throw new Error(`No se encontró "${etiqueta}" en: ${texto}`);
  return Number(m[1]!.replace(',', '.'));
}

async function tension(page: Page, hasta = 0.3): Promise<number> {
  await page.getByRole('button', { name: 'Simular', exact: true }).click();
  await page.getByLabel('Velocidad de reproducción', { exact: true }).selectOption('1');
  await panelSim(page).getByRole('button', { name: /Reproducir/ }).click();
  await expect.poll(async () => leer((await panelSim(page).locator('.sim-tiempo').textContent()) ?? '', 't'), { timeout: 15000 }).toBeGreaterThanOrEqual(hasta);
  await pausarSiCorre(page);
  return leer((await panelSim(page).locator('p[aria-label="Normal, roce y tensiones"]').textContent()) ?? '', 'T');
}

/** La escena del proyecto descargado (en el celular, Exportar está en el menú Más). */
async function escena(page: Page): Promise<Elemento[]> {
  const enMas = !(await page.locator('summary', { hasText: 'Exportar' }).isVisible());
  if (enMas) await page.getByLabel('Más opciones').click();
  await page.locator('summary', { hasText: 'Exportar' }).click();
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar proyecto (.json)' }).click()]);
  const json = JSON.parse(readFileSync((await d.path())!, 'utf8'));
  await page.keyboard.press('Escape');
  const store = new Store<Escena>(escenaInicial, reductoresEscena);
  store.cargar(json.ops);
  return store.estado.elementos;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./?transporte=local');
  await page.locator('canvas.lienzo').waitFor();
});

test('aceptación: Atwood en un celular (375 × 812) con un solo gesto para la cuerda, y T de la teoría', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const lienzo = (await page.locator('canvas.lienzo').boundingBox())!;
  expect(lienzo.height / 812).toBeGreaterThanOrEqual(0.75); // el lienzo ocupa al menos 3/4 de la pantalla

  const inicio = Date.now();
  let acciones = 0;
  const accion = async (f: () => Promise<void>) => {
    await f();
    acciones++;
  };
  await accion(() => herramienta(page, 'Armar').click());
  await accion(() => herramienta(page, 'Polea').click());
  await accion(() => clic(page, 0, 1.6));
  await accion(() => herramienta(page, 'Bloque').click());
  await accion(() => clic(page, -0.3, -0.7)); // m₁ = 2 kg (se numera solo)
  await accion(() => clic(page, 0.4, -1.2)); // m₂ = 3 kg, un poco corrido: se alinea solo bajo la polea
  await accion(() => herramienta(page, 'Conectar').click()); // la herramienta Cuerda viene elegida
  // Un solo gesto: desde m₁, sube por la izquierda de la polea, pasa por arriba y baja a m₂.
  await accion(() => gesto(page, [-0.3, -0.52], [-0.3, 0.8], [-0.3, 1.6], [0, 1.95], [0.3, 1.6], [0.35, 0.5], [0.4, -1.02]));
  expect(acciones).toBe(8);
  expect(Date.now() - inicio).toBeLessThan(30000);

  const els = await escena(page);
  const cuerdas = els.filter((e): e is Cuerda => e.tipo === 'cuerda');
  expect(cuerdas).toHaveLength(1);
  expect(cuerdas[0]!.ruta).toHaveLength(1);
  expect(cuerdas[0]!.union!.every((u) => u !== null && 'el' in u)).toBe(true);
  await expect(page.locator('details.menu-problemas')).toBeHidden(); // sin problemas: el tramo quedó vertical
  expect(await tension(page)).toBeCloseTo((2 * 2 * 3 * 9.8) / 5, 1); // 23,52 N
});

test('la cuerda dobla en el borde de la mesa (sin polea): T = m₁ m₂ g /(m₁ + m₂)', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await herramienta(page, 'Superficie').click();
  await gesto(page, [-3, 0], [0, 0]);
  await herramienta(page, 'Bloque').click();
  await clic(page, -1, 0.35); // se apoya solo en la mesa
  await clic(page, 0.3, -1.2);
  await herramienta(page, 'Cuerda').click();
  // Desde la esquina inferior derecha de m₁ (tramo horizontal), por el borde de la mesa, hasta m₂.
  await gesto(page, [-0.76, 0.02], [-0.3, 0.02], [0.05, 0], [0.12, -0.3], [0.1, -0.98]);
  const c = (await escena(page)).find((e): e is Cuerda => e.tipo === 'cuerda')!;
  expect(c.ruta).toEqual([expect.objectContaining({ extremo: 'b' })]);
  expect(await tension(page)).toBeCloseTo((2 * 3 * 9.8) / 5, 1); // 11,76 N
});

test('un tramo muy inclinado se avisa en la barra y «Alinear bajo la polea» lo arregla', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await herramienta(page, 'Polea').click();
  await clic(page, 0, 1.5);
  await herramienta(page, 'Bloque').click();
  await clic(page, -0.3, -0.5);
  await clic(page, 2, -1); // muy lejos: más de 25°, no se corrige solo
  await herramienta(page, 'Cuerda').click();
  await gesto(page, [-0.3, -0.32], [-0.3, 1.2], [0, 1.85], [0.3, 1.5], [1.2, 0], [2, -0.82]);
  const aviso = page.locator('details.menu-problemas');
  await expect(aviso).toBeVisible();
  await aviso.locator('summary').click();
  await expect(aviso).toContainText('oscilará como un péndulo');
  await aviso.getByRole('button', { name: 'Alinear bajo la polea' }).click();
  await expect(aviso).toBeHidden();
  // Un solo deshacer vuelve a la situación anterior.
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(aviso).toBeVisible();
});

test('una polea soltada sobre un bloque queda montada (polea móvil) y lo sigue', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await herramienta(page, 'Bloque').click();
  await clic(page, 0, -1);
  await herramienta(page, 'Polea').click();
  await clic(page, 0, -0.9);
  await herramienta(page, 'Seleccionar').click();
  await gesto(page, [0, -1.1], [1, -1.5]); // se arrastra el bloque
  const els = await escena(page);
  const p = els.find((e): e is Polea => e.tipo === 'polea')!;
  expect(p.montaje?.el).toBe(els.find((e) => e.tipo === 'bloque')!.id);
});

// Capturas de la fase: CAPTURAS=1 npm run test:e2e
for (const [esquema, nombre] of [['light', 'claro'], ['dark', 'oscuro']] as const) {
  test(`captura: Atwood armado en el celular (${nombre})`, async ({ page }) => {
    test.skip(!process.env['CAPTURAS'], 'solo con CAPTURAS=1');
    await page.emulateMedia({ colorScheme: esquema });
    await page.setViewportSize({ width: 375, height: 812 });
    await herramienta(page, 'Polea').click();
    await clic(page, 0, 1.6);
    await herramienta(page, 'Bloque').click();
    await clic(page, -0.3, -0.7);
    await clic(page, 0.4, -1.2);
    await herramienta(page, 'Cuerda').click();
    await gesto(page, [-0.3, -0.52], [-0.3, 0.8], [-0.3, 1.6], [0, 1.95], [0.3, 1.6], [0.35, 0.5], [0.4, -1.02]);
    await page.screenshot({ path: `docs/capturas/nivel2-fase2-celular-${nombre}.png` });
  });
  test(`captura: plano con polea, problema y su arreglo (${nombre})`, async ({ page }) => {
    test.skip(!process.env['CAPTURAS'], 'solo con CAPTURAS=1');
    await page.emulateMedia({ colorScheme: esquema });
    await page.setViewportSize({ width: 1100, height: 760 });
    await herramienta(page, 'Plano inclinado').click();
    await gesto(page, [-4, -1.5], [0, 0.8]);
    await herramienta(page, 'Bloque').click();
    await clic(page, -2, -0.6);
    await herramienta(page, 'Polea').click();
    await clic(page, 0.4, 1.0);
    await herramienta(page, 'Bloque').click();
    await clic(page, 0.7, -1.2);
    await herramienta(page, 'Cuerda').click();
    await gesto(page, [-1.75, -0.48], [-0.6, 0.5], [0.2, 1.3], [0.55, 1.1], [0.7, 0], [0.7, -1.02]);
    await page.locator('details.menu-problemas summary').click();
    await page.screenshot({ path: `docs/capturas/nivel2-fase2-problemas-${nombre}.png` });
  });
}
