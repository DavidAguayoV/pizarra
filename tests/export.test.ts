// @vitest-environment node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Op } from '../src/core/ops';
import { dimensionesPng } from '../src/export/png';
import { leerProyecto, SCHEMA_VERSION, serializarProyecto } from '../src/export/json';
import { aSvg, cajaEscena, escaparXml } from '../src/export/svg';
import { aTikz, escaparLatex } from '../src/export/tikz';
import { escenaEjemplo } from './fixtures';

/** Compara con un archivo "golden". Para regenerarlos: UPDATE_GOLDEN=1 npm test */
function golden(nombre: string, actual: string): void {
  const ruta = new URL(`./golden/${nombre}`, import.meta.url);
  if (process.env['UPDATE_GOLDEN'] || !existsSync(ruta)) {
    mkdirSync(new URL('./golden/', import.meta.url), { recursive: true });
    writeFileSync(ruta, actual);
  }
  expect(actual).toBe(readFileSync(ruta, 'utf8'));
}

describe('TikZ', () => {
  it('fragmento: coincide con el archivo de referencia', () => {
    const { codigo } = aTikz(escenaEjemplo(), { modo: 'fragmento' });
    golden('escena-fragmento.tikz', codigo);
  });

  it('documento standalone: coincide con el archivo de referencia', () => {
    const { codigo } = aTikz(escenaEjemplo(), { modo: 'documento', anchoCm: 12 });
    golden('escena-documento.tex', codigo);
  });

  it('el ancho pedido se respeta (el contenido ocupa anchoCm)', () => {
    const { codigo } = aTikz(escenaEjemplo(), { anchoCm: 8 });
    const xs = [...codigo.matchAll(/\((-?[\d.]+),-?[\d.]+\)/g)].map((m) => Number(m[1]));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(8 + 1e-6);
  });

  it('cmPorMetro fija la escala y gana sobre anchoCm', () => {
    const { codigo } = aTikz(escenaEjemplo(), { cmPorMetro: 2, anchoCm: 99 });
    expect(codigo).toContain('% Escala: 2 cm por metro');
  });

  it('define solo los colores que se usan, con la paleta clara', () => {
    const { codigo } = aTikz([escenaEjemplo()[2]!]);
    expect(codigo).toContain('\\definecolor{pztinta}{HTML}{0B1320}');
    expect(codigo).not.toContain('pzcampo');
  });

  it('las imágenes salen como \\includegraphics con su archivo aparte', () => {
    const r = aTikz(escenaEjemplo());
    expect(r.imagenes).toHaveLength(1);
    expect(r.imagenes[0]!.nombre).toBe('pizarra-imagen-1.png');
    expect(r.codigo).toContain('\\includegraphics[width=');
    expect(r.codigo).toContain('graphicx');
  });

  it('una escena vacía no rompe', () => {
    expect(aTikz([]).codigo).toContain('\\begin{tikzpicture}');
  });

  it('no deja texto en inglés en los comentarios', () => {
    const { codigo } = aTikz(escenaEjemplo());
    expect(codigo).not.toMatch(/% .*\b(strokes|shapes|text layer)\b/);
  });
});

describe('escaparLatex', () => {
  it('escapa los especiales fuera de matemática', () => {
    expect(escaparLatex('f_k = 5% de N & más')).toBe('f\\_k = 5\\% de N \\& más');
  });

  it('respeta lo que va entre $...$', () => {
    expect(escaparLatex('masa $m_1$ y 3_x')).toBe('masa $m_1$ y 3\\_x');
  });

  it('con $ sin cerrar, los escapa todos', () => {
    expect(escaparLatex('cuesta $5')).toBe('cuesta \\$5');
  });
});

describe('SVG', () => {
  it('coincide con el archivo de referencia', () => {
    golden('escena.svg', aSvg(escenaEjemplo()));
  });

  it('es un documento SVG con el tamaño del contenido más margen', () => {
    const svg = aSvg(escenaEjemplo(), { pxPorMetro: 100, margen: 0 });
    const c = cajaEscena(escenaEjemplo())!;
    expect(svg).toContain(`width="${Math.round((c.x1 - c.x0) * 100 * 100) / 100}"`);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trim().endsWith('</svg>')).toBe(true);
  });

  it('sin fondo no dibuja el rectángulo de fondo', () => {
    expect(aSvg(escenaEjemplo(), { fondo: false })).not.toContain('<rect width="100%"');
  });

  it('escapa los caracteres de XML en el texto', () => {
    expect(escaparXml('a < b & "c"')).toBe('a &lt; b &amp; &quot;c&quot;');
  });
});

describe('PNG', () => {
  it('baja la resolución si el lienzo supera el tope del navegador', () => {
    const d = dimensionesPng(200, 100, 4);
    expect(Math.max(d.ancho, d.alto)).toBeLessThanOrEqual(8192);
    const normal = dimensionesPng(4, 2, 2);
    expect(normal).toMatchObject({ ancho: 800, alto: 400, px: 200 });
  });
});

describe('JSON del proyecto', () => {
  const ops: Op[] = [
    { id: 'a', t: 1, autor: 'x', tipo: 'elemento/agregar', payload: escenaEjemplo()[2] },
    { id: 'b', t: 2, autor: 'x', tipo: 'core/deshacer', payload: { objetivo: 'a' } },
  ];

  it('ida y vuelta sin pérdidas', () => {
    expect(leerProyecto(serializarProyecto(ops))).toEqual(ops);
  });

  it('lleva la versión del esquema', () => {
    expect(JSON.parse(serializarProyecto(ops))).toMatchObject({ app: 'pizarra', schemaVersion: SCHEMA_VERSION });
  });

  it('rechaza archivos que no son proyectos, con mensaje en español', () => {
    expect(() => leerProyecto('no es json')).toThrow(/JSON válido/);
    expect(() => leerProyecto('{"hola":1}')).toThrow(/no es un proyecto/);
    expect(() => leerProyecto('{"app":"pizarra","schemaVersion":1,"ops":[{"id":1}]}')).toThrow(/dañadas/);
  });

  it('rechaza proyectos de una versión futura', () => {
    expect(() => leerProyecto(`{"app":"pizarra","schemaVersion":${SCHEMA_VERSION + 1},"ops":[]}`)).toThrow(/más nueva/);
  });
});
