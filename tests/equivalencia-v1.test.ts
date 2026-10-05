// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Elemento } from '../src/core/elementos';
import { resolverDcl } from '../src/physics/dcl';
import { construirModelo } from '../src/sim/modelo';
import { Simulacion } from '../src/sim/motor';
import { ESCENAS_V1 } from './escenasV1';

/**
 * Equivalencia v1 → v2: la simulación y el DCL de cada escena de referencia deben dar lo mismo que daba la
 * versión 1 (uniones por cercanía). Los resultados de la v1 se grabaron una sola vez, con el código de la
 * Etapa 5, en `tests/golden/v1-referencia.json`. **No se regeneran**: si esta prueba falla, la migración
 * cambió el comportamiento de un proyecto guardado. (Solo para grabarlos de nuevo: GRABAR_V1=1.)
 */

const RUTA = new URL('./golden/v1-referencia.json', import.meta.url);
const G = 9.8;
const r9 = (x: number): number => Math.round(x * 1e9) / 1e9;
const pt = (p: { x: number; y: number }) => [r9(p.x), r9(p.y)];

type Registro = Record<string, unknown>;

function registrar(elementos: Elemento[], t: number): Registro {
  const m = construirModelo(elementos, G);
  const idCuerpo = (i: number) => m.cuerpos[i]!.id;
  const ext = (e: (typeof m.cuerdas)[number]['ext'][number]) => (e.tipo === 'cuerpo' ? `cuerpo:${idCuerpo(e.i)}` : 'fijo');
  const modelo = {
    cuerpos: m.cuerpos.map((c) => c.id),
    cuerdas: m.cuerdas.map((c) => ({ id: c.ids[0], conPolea: c.polea !== null, ext: c.ext.map(ext), largo: r9(c.largo) })),
    resortes: m.resortes.map((x) => ({ id: x.id, ext: x.ext.map(ext) })),
    fuerzas: m.fuerzas.map((f) => ({ id: f.id, cuerpo: idCuerpo(f.cuerpo), F: pt(f.F) })),
  };
  const s = new Simulacion(m, { h: 0.001 });
  const muestras: Registro[] = [];
  const pasos = Math.round(t / 0.001);
  for (let k = 0; k <= pasos; k++) {
    if (k % Math.round(pasos / 4) === 0 || k === pasos) {
      const e = s.estado;
      muestras.push({
        t: r9(e.t),
        cuerpos: Object.fromEntries(
          m.cuerpos.map((c, i) => [c.id, { p: pt(e.p[i]!), v: pt(e.v[i]!), a: pt(e.a[i]!), N: r9(e.N[i]!), f: r9(e.fric[i]!), modo: e.modo[i]!.k }]),
        ),
        T: Object.fromEntries(m.cuerdas.map((c, k2) => [c.ids[0], r9(e.T[k2]!)])),
      });
    }
    if (k < pasos) s.paso();
  }
  const eventos = s.eventos.map((e) => ({ t: r9(e.t), tipo: e.tipo, cuerpo: e.cuerpo === null ? null : idCuerpo(e.cuerpo) }));
  const dcl = Object.fromEntries(
    m.cuerpos.map((c) => {
      const d = resolverDcl(c.elemento, elementos, G);
      return [
        c.id,
        {
          fuerzas: d.fuerzas.map((f) => ({ rol: f.rol, simbolo: f.simbolo, angulo: r9(f.angulo), valor: f.valor === null ? null : r9(f.valor) })),
          superficie: d.superficie?.id ?? null,
          aceleracion: { x: d.aceleracion.x === null ? null : r9(d.aceleracion.x), y: d.aceleracion.y === null ? null : r9(d.aceleracion.y) },
          estadoRoce: d.estadoRoce,
          avisos: d.avisos,
        },
      ];
    }),
  );
  return { modelo, muestras, eventos, dcl };
}

/** Compara dos registros con tolerancia numérica, con la ruta del primer desacuerdo en el mensaje. */
function comparar(a: unknown, b: unknown, ruta: string, tol: number): void {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Math.abs(a - b) > tol) throw new Error(`${ruta}: ${a} ≠ ${b}`);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) throw new Error(`${ruta}: largo ${a.length} ≠ ${b.length}`);
    a.forEach((x, i) => comparar(x, b[i], `${ruta}[${i}]`, tol));
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (ka.join() !== kb.join()) throw new Error(`${ruta}: claves ${ka.join()} ≠ ${kb.join()}`);
    for (const k of ka) comparar((a as Registro)[k], (b as Registro)[k], `${ruta}.${k}`, tol);
    return;
  }
  if (a !== b) throw new Error(`${ruta}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
}

describe('equivalencia con la versión 1 (proyectos guardados se simulan igual)', () => {
  const actual = Object.fromEntries(ESCENAS_V1.map((e) => [e.nombre, registrar(e.elementos, e.t)]));

  if (process.env['GRABAR_V1']) {
    writeFileSync(RUTA, JSON.stringify(actual, null, 1) + '\n');
  }

  it('el archivo de referencia existe', () => {
    expect(existsSync(RUTA)).toBe(true);
  });

  const referencia = existsSync(RUTA) ? (JSON.parse(readFileSync(RUTA, 'utf8')) as Record<string, Registro>) : {};
  for (const e of ESCENAS_V1) {
    it(e.nombre, () => {
      expect(referencia[e.nombre], 'falta en la referencia').toBeDefined();
      comparar(actual[e.nombre], referencia[e.nombre], e.nombre, 1e-7);
    });
  }
});
