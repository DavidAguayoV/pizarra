// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contraste } from '../src/core/color';
import { CLARO, OSCURO, ROLES_FISICOS, colorDeRol, variablesCss } from '../src/ui/tokens';

describe('contraste WCAG', () => {
  it('calcula los extremos conocidos', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contraste('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});

describe.each([CLARO, OSCURO])('tema $nombre', (tema) => {
  it('texto, texto suave y activo alcanzan AA (4,5:1) sobre el fondo', () => {
    expect(contraste(tema.texto, tema.fondo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(tema.textoSuave, tema.fondo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(tema.activo, tema.fondo)).toBeGreaterThanOrEqual(4.5);
  });

  it('los pares de la interfaz (botones, interruptores, avisos) alcanzan AA', () => {
    // Botón normal: texto del color del fondo sobre el acento (--acento = cuerpo-borde)
    expect(contraste(tema.fondo, tema.cuerpoBorde)).toBeGreaterThanOrEqual(4.5);
    // «Con roce» activo (fondo sobre disipación) y aviso de problemas (fondo sobre acento de familia)
    expect(contraste(tema.fondo, tema.familias.disipacion)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(tema.fondo, tema.familias.acento)).toBeGreaterThanOrEqual(4.5);
    // Texto y texto suave de los paneles y menús (fondo --superficie = panel)
    expect(contraste(tema.texto, tema.panel)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(tema.textoSuave, tema.panel)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ROLES_FISICOS)('el rol %s alcanza AA sobre el fondo y sobre el panel', (rol) => {
    const c = colorDeRol(tema, rol);
    expect(contraste(c, tema.fondo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c, tema.panel)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('tema oscuro = paleta v2 de los videos', () => {
  it('conserva los valores de estilo_v2.py', () => {
    expect(OSCURO.familias).toEqual({
      acento: '#FFC53D', campo: '#FF6B6B', contacto: '#4FC3F7',
      disipacion: '#B79CFF', movimiento: '#3DDC97', neutro: '#B8C7DA',
    });
    expect(OSCURO.activo).toBe('#00AFD8');
  });
});

describe('tokens.css', () => {
  it('está sincronizado con tokens.ts (correr npm run tokens si falla)', () => {
    const css = readFileSync(new URL('../src/ui/tokens.css', import.meta.url), 'utf8');
    for (const tema of [CLARO, OSCURO]) {
      for (const [k, v] of Object.entries(variablesCss(tema))) {
        expect(css).toContain(`${k}: ${v};`);
      }
    }
  });
});
