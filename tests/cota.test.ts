// @vitest-environment node
import { expect, it } from 'vitest';
import { cotaMedida } from '../src/ink/herramientas';
it('la medida muestra la distancia en metros y el ángulo con coma decimal y signo menos', () => {
  const t = (a: { x: number; y: number }, b: { x: number; y: number }) => (cotaMedida(a, b, 'x', 0.2)[1] as { texto: string }).texto;
  expect(t({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe('2 m · 0°');
  expect(t({ x: 0, y: 0 }, { x: 0.25, y: -2.1 })).toBe('2,115 m · −83,2°');
  expect(t({ x: 0, y: 0 }, { x: 1.5, y: 0 })).toBe('1,5 m · 0°');
  expect(t({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe('1,414 m · 45°');
});
