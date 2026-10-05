import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Cuerda, Elemento } from '../../src/core/elementos';
import { escenaInicial, reductoresEscena } from '../../src/core/escena';
import type { Escena } from '../../src/core/escena';
import type { Op } from '../../src/core/ops';
import { Store } from '../../src/core/store';
import { posPuerto } from '../../src/grafo/puertos';
import { resolverEscena } from '../../src/grafo/resolver';
import { crearBloque, crearCuerda, crearPolea } from '../../src/physics/objetos';

/**
 * Fase 1 del Nivel 2: el grafo con la interfaz real. Un Atwood dibujado (no cargado por código) queda con una
 * sola cuerda que envuelve la polea y simula con la tensión de la teoría; al mover un bloque, la cuerda lo sigue;
 * un proyecto v1 se abre, se migra y se guarda como v2.
 */

const herramienta = (page: Page, nombre: string) => page.getByRole('button', { name: nombre, exact: true });
const estado = (page: Page) => page.getByRole('status').filter({ hasText: 'elemento' });
const panelSim = (page: Page) => page.locator('section.panel-sim');

async function pos(page: Page, x: number, y: number): Promise<[number, number]> {
  const lienzo = page.locator('canvas.lienzo');
  const box = (await lienzo.boundingBox())!;
  const esc = Number(await lienzo.getAttribute('data-escala'));
  return [box.x + box.width / 2 + x * esc, box.y + box.height / 2 - y * esc];
}
async function arrastrar(page: Page, de: [number, number], a: [number, number]): Promise<void> {
  await page.mouse.move(...(await pos(page, ...de)));
  await page.mouse.down();
  await page.mouse.move(...(await pos(page, ...a)), { steps: 10 });
  await page.mouse.up();
}
const clic = async (page: Page, x: number, y: number) => page.mouse.click(...(await pos(page, x, y)));

function leer(texto: string, etiqueta: string): number {
  const m = new RegExp(`${etiqueta}\\s*=\\s*(-?[\\d.,e+-]+)`).exec(texto);
  if (!m) throw new Error(`No se encontró "${etiqueta}" en: ${texto}`);
  return Number(m[1]!.replace(',', '.'));
}

/** Descarga el proyecto y devuelve sus ops y la escena resuelta. */
async function proyecto(page: Page): Promise<{ json: { schemaVersion: number; ops: Op[] }; escena: Elemento[] }> {
  await page.locator('summary', { hasText: 'Exportar' }).click();
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar proyecto (.json)' }).click()]);
  const json = JSON.parse(readFileSync((await d.path())!, 'utf8'));
  await page.locator('summary', { hasText: 'Exportar' }).click();
  const store = new Store<Escena>(escenaInicial, reductoresEscena);
  store.cargar(json.ops);
  return { json, escena: resolverEscena(store.estado.elementos) };
}

/** Atwood dibujado con la paleta Cuerpos: polea, dos bloques de 0,4 m y dos cuerdas hasta la polea. */
async function dibujarAtwood(page: Page): Promise<void> {
  await herramienta(page, 'Cuerpos').click();
  await page.getByRole('button', { name: 'Polea', exact: true }).click();
  await clic(page, 0, 1.5);
  await page.getByRole('button', { name: 'Bloque', exact: true }).click();
  await arrastrar(page, [-0.5, -0.3], [-0.1, -0.7]);
  await arrastrar(page, [0.1, -0.8], [0.5, -1.2]);
  await page.getByRole('button', { name: 'Cuerda', exact: true }).click();
  await arrastrar(page, [-0.3, -0.32], [-0.3, 1.5]);
  await arrastrar(page, [0.3, 1.5], [0.3, -0.82]);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto('./?transporte=local');
  await page.locator('canvas.lienzo').waitFor();
});

test('Atwood dibujado: una sola cuerda que envuelve la polea, y la tensión de la teoría', async ({ page }) => {
  await dibujarAtwood(page);
  await expect(estado(page)).toContainText('4 elementos'); // polea, dos bloques y UNA cuerda
  const { escena } = await proyecto(page);
  const cuerda = escena.find((e): e is Cuerda => e.tipo === 'cuerda')!;
  expect(cuerda.ruta).toHaveLength(1);
  expect(cuerda.union!.every((u) => u !== null && 'el' in u)).toBe(true);

  // m₁ = 3 kg (el de la izquierda)
  await herramienta(page, 'Seleccionar').click();
  await clic(page, -0.3, -0.5);
  await page.getByLabel('Masa del bloque').fill('3');
  await page.getByLabel('Masa del bloque').press('Enter');

  await herramienta(page, 'Simular').click();
  await page.getByLabel('Velocidad de reproducción', { exact: true }).selectOption('4');
  await panelSim(page).getByRole('button', { name: /Reproducir/ }).click();
  await expect.poll(async () => leer((await panelSim(page).locator('.sim-tiempo').textContent()) ?? '', 't'), { timeout: 15000 }).toBeGreaterThanOrEqual(0.3);
  await panelSim(page).getByRole('button', { name: /Pausar/ }).click();
  const f = (await panelSim(page).locator('p[aria-label="Normal, roce y tensiones"]').textContent()) ?? '';
  expect(leer(f, 'T')).toBeCloseTo((2 * 3 * 2 * 9.8) / 5, 1); // 23,52 N
  // Sin problemas en la escena.
  expect(((await panelSim(page).getByLabel('Problemas de la escena').textContent()) ?? '').trim()).toBe('');
});

test('al mover un bloque, la cuerda lo sigue (la unión no se rompe)', async ({ page }) => {
  await dibujarAtwood(page);
  await expect(estado(page)).toContainText('4 elementos');
  await herramienta(page, 'Seleccionar').click();
  await arrastrar(page, [0.3, -1.0], [1.3, -1.6]);
  const { escena } = await proyecto(page);
  const bloque = escena.filter((e) => e.tipo === 'bloque').at(-1)!;
  const cuerda = escena.find((e): e is Cuerda => e.tipo === 'cuerda')!;
  const sup = posPuerto(bloque, 'cara-sup')!;
  expect(cuerda.b.x).toBeCloseTo(sup.x, 6);
  expect(cuerda.b.y).toBeCloseTo(sup.y, 6);
  expect(sup.x).toBeCloseTo(1.3, 1);
});

test('un proyecto v1 se abre migrado (una op que no se deshace) y se guarda como v2', async ({ page }) => {
  const els = [
    crearPolea({ x: 0, y: 1.4 }, 0.3),
    crearCuerda({ x: -0.3, y: 1.4 }, { x: -0.3, y: -0.4 }),
    crearCuerda({ x: 0.3, y: 1.4 }, { x: 0.3, y: 0.1 }),
    crearBloque({ x: -0.3, y: -0.6 }, 0.4, 0.4, { masa: 3 }),
    crearBloque({ x: 0.3, y: -0.1 }, 0.4, 0.4, { masa: 2 }),
  ];
  const ops = els.map((e, i) => ({ id: `t-${i}`, t: i, autor: 'prueba', tipo: 'elemento/agregar', payload: e }));
  await page.locator('input[type=file][accept*=json]').setInputFiles({ name: 'v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'pizarra', schemaVersion: 1, ops })) });
  await expect(estado(page)).toContainText('4 elementos · 6 ops');
  // Deshacer quita el último bloque, no la migración.
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(estado(page)).toContainText('3 elementos');
  await page.getByRole('button', { name: 'Rehacer' }).click();
  const { json } = await proyecto(page);
  expect(json.schemaVersion).toBe(2);
  expect(json.ops.filter((o) => o.tipo === 'escena/migracion')).toHaveLength(1);
});

// Capturas de la fase: CAPTURAS=1 npm run test:e2e
for (const [esquema, nombre] of [['light', 'claro'], ['dark', 'oscuro']] as const) {
  test(`captura: Atwood dibujado, la cuerda envuelve la polea y se ven las uniones (${nombre})`, async ({ page }) => {
    test.skip(!process.env['CAPTURAS'], 'solo con CAPTURAS=1');
    await page.emulateMedia({ colorScheme: esquema });
    await page.goto('./?transporte=local');
    await page.locator('canvas.lienzo').waitFor();
    await dibujarAtwood(page);
    await herramienta(page, 'Seleccionar').click();
    await arrastrar(page, [0.3, -1.0], [1.1, -1.4]); // movido: la cuerda lo sigue y sale inclinada
    await page.keyboard.press('Escape'); // suelta la selección
    await page.screenshot({ path: `docs/capturas/nivel2-fase1-${nombre}.png` });
  });
}
