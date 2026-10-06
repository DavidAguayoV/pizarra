import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Fase 5: teclado y lectores de pantalla, movimiento reducido y rendimiento con muchos objetos. */

const contar = async (page: Page): Promise<number> => Number(/(\d+) elemento/.exec((await page.locator('.estado').textContent()) ?? '')?.[1] ?? -1);

async function montaje(page: Page, id: string): Promise<void> {
  await page.getByRole('button', { name: 'Armar', exact: true }).click();
  await page.locator('.menu-montajes > summary').click();
  await page.locator(`[data-montaje="${id}"]`).click();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
});

test('solo con el teclado: Tab recorre los objetos y los anuncia, las flechas mueven, Enter lleva al panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./?transporte=local');
  await page.locator('canvas.lienzo').waitFor();
  await montaje(page, 'atwood');
  await expect(page.locator('#descripcion-escena')).toHaveText('En la pizarra: 1 polea, 2 bloques y 1 cuerda.');
  await page.locator('canvas.lienzo').focus();
  const anuncio = page.locator('#anuncio-seleccion');
  await page.keyboard.press('Tab');
  await expect(anuncio).toContainText('Polea de radio 0,25 m');
  await page.keyboard.press('Tab');
  await expect(anuncio).toContainText('Bloque m₁ de 2 kg');
  await expect(page.locator('section.propiedades')).toContainText('Bloque');
  // La flecha lo empuja 10 cm: el anuncio siguiente lo dice en su nueva posición
  const antes = await anuncio.textContent();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(anuncio).not.toHaveText(antes ?? '');
  await expect(anuncio).toContainText('x = -0,35 m');
  // Enter lleva el foco al panel del bloque
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('section.propiedades') !== null)).toBe(true);
  // Al final de la lista, Tab sale del lienzo (no hay trampa de foco)
  await page.locator('canvas.lienzo').focus();
  for (let k = 0; k < 4; k++) await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('CANVAS');
});

test('con «reducir movimiento» la interfaz no tiene transiciones', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./?transporte=local');
  await page.locator('canvas.lienzo').waitFor();
  const dur = await page.getByRole('button', { name: 'Armar', exact: true }).evaluate((b) => parseFloat(getComputedStyle(b).transitionDuration));
  expect(dur).toBeLessThan(0.001);
});

test('rendimiento: 64 objetos (16 masas con resorte que oscilan sin parar) en un celular con la CPU 4× más lenta', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'la limitación de CPU es de Chromium');
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./?transporte=local');
  await page.locator('canvas.lienzo').waitFor();
  await montaje(page, 'resorte-horizontal');
  await page.locator('canvas.lienzo').focus();
  await page.keyboard.press('Control+a');
  for (let k = 0; k < 4; k++) {
    await page.keyboard.press('Control+d');
    await page.keyboard.press('Control+a');
  }
  await expect.poll(() => contar(page)).toBe(64);
  const cdp = await page.context().newCDPSession(page);
  await page.getByRole('button', { name: 'Simular', exact: true }).click();
  await page.locator('section.panel-sim').getByRole('button', { name: /Reproducir/ }).click();
  const medir = async (rate: number): Promise<number> => {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const cuadros = await page.evaluate(
      () =>
        new Promise<number[]>((ok) => {
          const t: number[] = [];
          const fin = performance.now() + 2500;
          const paso = (ts: number): void => {
            t.push(ts);
            if (ts < fin) requestAnimationFrame(paso);
            else ok(t.slice(1).map((x, i) => x - t[i]!));
          };
          requestAnimationFrame(paso);
        }),
    );
    const orden = [...cuadros].sort((a, b) => a - b);
    const med = orden[Math.floor(orden.length / 2)]!;
    console.log(`64 objetos, CPU ${rate}×: mediana ${med.toFixed(1)} ms, p95 ${orden[Math.floor(orden.length * 0.95)]!.toFixed(1)} ms por cuadro`);
    return med;
  };
  const mediana = await medir(4);
  await medir(1);
  // Sigue moviéndose (no se detuvo): el tiempo simulado avanzó durante la medición
  await expect(page.locator('section.panel-sim')).not.toContainText('t = 0 s');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  // Holgado para la CI (máquinas compartidas); el valor medido en un equipo de escritorio se anota en el CHANGELOG.
  expect(mediana).toBeLessThan(100);
});

// Capturas de la fase: CAPTURAS=1 npx playwright test fase5
for (const [esquema, nombre] of [['light', 'claro'], ['dark', 'oscuro']] as const) {
  test(`captura: objeto elegido con el teclado (foco visible y panel) (${nombre})`, async ({ page }) => {
    test.skip(!process.env['CAPTURAS'], 'solo con CAPTURAS=1');
    await page.emulateMedia({ colorScheme: esquema });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('./?transporte=local');
    await page.locator('canvas.lienzo').waitFor();
    await montaje(page, 'plano-polea');
    await page.locator('canvas.lienzo').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.screenshot({ path: `docs/capturas/nivel2-fase5-teclado-${nombre}.png` });
  });
}
