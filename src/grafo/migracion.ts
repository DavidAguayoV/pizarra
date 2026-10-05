import type { Elemento } from '../core/elementos';
import { escenaInicial, OP_MIGRACION, reductoresEscena } from '../core/escena';
import type { Op } from '../core/ops';
import { opsActivas } from '../core/ops';
import { loteMigracion } from './v1';

/**
 * Migración de un proyecto guardado con la v1 (`schemaVersion` 1). Sus ops se conservan **intactas** (con todo
 * su historial) y se agrega al final una sola op `escena/migracion`: un lote con las uniones, rutas y apoyos que
 * la v1 deducía por cercanía (`grafo/v1.ts`, congelado). Esa op no se deshace. Si la escena no tiene nada que
 * unir (solo tinta, por ejemplo), no se agrega nada.
 */
export function migrarOpsV1(ops: readonly Op[]): Op[] {
  let estado = escenaInicial();
  for (const op of opsActivas(ops)) {
    const r = reductoresEscena[op.tipo] as ((s: typeof estado, p: unknown, o: Op) => typeof estado) | undefined;
    if (r) estado = r(estado, op.payload, op);
  }
  const elementos: readonly Elemento[] = estado.elementos;
  const lote = loteMigracion(elementos);
  if (!lote) return [...ops];
  const ultima = ops.at(-1);
  const migracion: Op = { id: `migracion-v1-${ops.length}`, t: ultima?.t ?? 0, autor: 'migracion', tipo: OP_MIGRACION, payload: lote };
  return [...ops, migracion];
}
