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
    cuerdas: m.cuerdas.map((c) => ({ id: c.ids[0], conPolea: c.ruta !== null, ext: c.ext.map(ext), largo: r9(c.largo) })),
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

/**
 * Las únicas escenas en que la v2 se aparta de la v1 a propósito, con el motivo. Cada una tiene su propia
 * prueba con el comportamiento correcto.
 */
const DIFERENCIAS: Record<string, string> = {
  'proyectil al suelo':
    'Dos errores de la v1: un cuerpo apoyado que parte alejándose de la superficie quedaba pegado a ella (perdía su velocidad normal), ' +
    'y un cuerpo que aterriza deslizando sobre un piso sin roce quedaba clavado.',
  'bloques apilados': 'En la v1 los cuerpos no se tocaban entre sí: el bloque de arriba atravesaba al de abajo. Ahora se apoya en él.',
  'esquina piso-pared': 'En la v1 un cuerpo apoyado no veía otras superficies: el bloque empujado contra la pared la atravesaba. Ahora queda en la esquina.',
};

describe('diferencias intencionales con la v1', () => {
  it('un proyectil lanzado desde el suelo vuela: alcance y tiempo de vuelo de la teoría', () => {
    const escena = ESCENAS_V1.find((e) => e.nombre === 'proyectil al suelo')!.elementos;
    const s = new Simulacion(construirModelo(escena, G), { h: 0.001 });
    expect(s.descripcion(0)).toBe('en el aire');
    for (let k = 0; k < 300; k++) s.paso();
    expect(s.estado.p[0]!.x).toBeCloseTo(0.9, 6);
    expect(s.estado.p[0]!.y).toBeCloseTo(0.25 + 4 * 0.3 - 0.5 * G * 0.09, 6);
    for (let k = 0; k < 700; k++) s.paso();
    const impacto = s.eventos.find((e) => e.tipo === 'impacto')!;
    expect(impacto.t).toBeCloseTo((2 * 4) / G, 4); // vuelve a y = 0,25 en t = 2 v₀y / g
    expect(s.estado.p[0]!.x).toBeCloseTo(0.9 + 0.7 * 3, 6); // y sigue deslizando sin roce a 3 m/s
  });

  it('esquina piso-pared: el bloque empujado contra la pared queda en la esquina (N del piso = m g, de la pared = F)', () => {
    const escena = ESCENAS_V1.find((e) => e.nombre === 'esquina piso-pared')!.elementos;
    const s = new Simulacion(construirModelo(escena, G), { h: 0.001 });
    for (let k = 0; k < 300; k++) s.paso();
    expect(s.estado.p[0]!.x).toBeCloseTo(-0.8, 9);
    expect(s.estado.v[0]!.x).toBeCloseTo(0, 9);
    expect(s.estado.N[0]).toBeCloseTo(G, 9);
    expect(s.estado.Nx[0]).toBeCloseTo(10, 9);
  });

  it('bloques apilados: el de arriba queda en reposo sobre el de abajo (N = m₂ g entre ellos, (m₁ + m₂) g del suelo)', () => {
    const escena = ESCENAS_V1.find((e) => e.nombre === 'bloques apilados')!.elementos;
    const s = new Simulacion(construirModelo(escena, G), { h: 0.001 });
    for (let k = 0; k < 500; k++) s.paso();
    expect(s.estado.p[1]!.y).toBeCloseTo(0.6, 9);
    expect(s.estado.Nc[0]).toBeCloseTo(1 * G, 9);
    expect(s.estado.N[0]).toBeCloseTo(3 * G, 9);
  });
});

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
    if (e.nombre in DIFERENCIAS) continue;
    it(e.nombre, () => {
      expect(referencia[e.nombre], 'falta en la referencia').toBeDefined();
      comparar(actual[e.nombre], referencia[e.nombre], e.nombre, 1e-7);
    });
  }
});
