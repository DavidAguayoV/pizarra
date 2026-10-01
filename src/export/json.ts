import type { Op } from '../core/ops';

/**
 * Archivo de proyecto: el registro de ops completo (con su historial de deshacer/rehacer),
 * versionado con `schemaVersion`. Abrirlo reconstruye exactamente la misma escena.
 */
export const SCHEMA_VERSION = 1;

export interface ProyectoJson {
  app: 'pizarra';
  schemaVersion: number;
  ops: Op[];
}

export function serializarProyecto(ops: readonly Op[]): string {
  const p: ProyectoJson = { app: 'pizarra', schemaVersion: SCHEMA_VERSION, ops: [...ops] };
  return JSON.stringify(p, null, 1) + '\n';
}

function esOp(x: unknown): x is Op {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o['id'] === 'string' &&
    typeof o['t'] === 'number' &&
    typeof o['autor'] === 'string' &&
    typeof o['tipo'] === 'string' &&
    'payload' in o
  );
}

/** Lee un proyecto. Lanza un Error con mensaje en español si el archivo no sirve. */
export function leerProyecto(texto: string): Op[] {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  const p = datos as Partial<ProyectoJson> | null;
  if (!p || p.app !== 'pizarra' || !Array.isArray(p.ops)) {
    throw new Error('El archivo no es un proyecto de la pizarra.');
  }
  if (typeof p.schemaVersion !== 'number' || p.schemaVersion > SCHEMA_VERSION) {
    throw new Error('El proyecto se creó con una versión más nueva de la pizarra.');
  }
  if (!p.ops.every(esOp)) throw new Error('El proyecto tiene operaciones dañadas.');
  return p.ops;
}
