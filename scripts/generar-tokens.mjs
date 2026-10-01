// Genera src/ui/tokens.css desde src/ui/tokens.ts (Node ≥ 22 quita los tipos solo).
import { writeFileSync } from 'node:fs';
import { CLARO, OSCURO, variablesCss } from '../src/ui/tokens.ts';

const bloque = (selector, tema) =>
  `${selector} {\n${Object.entries(variablesCss(tema)).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`;

const css = `/* GENERADO por scripts/generar-tokens.mjs desde tokens.ts — no editar a mano. */
${bloque(':root', CLARO)}
@media (prefers-color-scheme: dark) {
${bloque(':root:not([data-theme])', OSCURO).replace(/^/gm, '  ').replace(/\s+$/, '')}
}

${bloque(":root[data-theme='oscuro']", OSCURO)}`;
writeFileSync(new URL('../src/ui/tokens.css', import.meta.url), css);
console.log('tokens.css generado');
