# ADR 0008 — La escena es un grafo: uniones explícitas, geometría derivada, un solo lector

**Fecha:** 2026-10-05 · **Estado:** aceptada (aprobada por David en la auditoría del Nivel 2) · **Reemplaza a:** [ADR 0006](0006-dcl-por-cercania.md)

**Contexto.** Hasta la Etapa 5, las relaciones entre objetos (qué cuerda ata a qué cuerpo, por qué polea pasa, sobre qué se
apoya un cuerpo) se **deducían por cercanía** cada vez que se simulaba o se generaba un DCL, con tolerancias ocultas (9 cm,
radio + 14 cm, 30 cm). La auditoría ([AUDITORIA_NIVEL2.md](../AUDITORIA_NIVEL2.md) §4) mostró que 1 cm de diferencia, o
agregar una cuerda más, cambia el montaje entero casi siempre en silencio, que el DCL y la simulación usaban reglas
distintas y que no había forma de pasar una cuerda por una polea con un gesto.

**Decisión.**

1. **Las relaciones se guardan** en los elementos (campos opcionales, así que un elemento v1 sigue siendo válido):
   - cuerda y resorte: `union: [Union | null, Union | null]`, con `Union = { el, puerto } | { fijo: true }`; `null` = suelto
     (no ejerce fuerza);
   - cuerda: `ruta: Paso[]`, las poleas por las que pasa, en orden y con su **sentido** de envoltura;
   - bloque y esfera: `apoyo: string[]` (superficies; la primera es la principal);
   - vector (fuerza aplicada o tensión): `cuerpo: string | null`.
2. **Puertos** (`grafo/puertos.ts`): puntos con nombre en coordenadas locales (`cara-sup`, `esq-id`, `eje`, `borde:90`,
   `u:0.5`, y `local:x,y` para la migración). No se guardan: son función del elemento, así que acompañan al giro y al movimiento.
3. **La geometría de lo unido se deriva** (`grafo/resolver.ts`): los extremos unidos toman la posición de su puerto y la cuerda
   con ruta calcula su camino **tangente a las poleas** con los arcos de contacto (`grafo/ruta.ts`). La escena resuelta es la
   que se dibuja, se toca, se exporta y se simula. El camino nunca se guarda en una op.
4. **Un solo lector** (`grafo/lector.ts`) para la simulación, el DCL y el validador. No hay tolerancias en la lectura.
5. **Integridad en la misma op** (`grafo/integridad.ts`): borrar un cuerpo suelta lo que estaba unido a él, borrar una polea la
   saca de la ruta, mover una superficie arrastra a sus cuerpos apoyados, mover un extremo lo vuelve a unir. Un deshacer revierte
   todo junto y el estudiante lo recibe junto. No se agregan tipos de op para unir: unir es actualizar la cuerda.
6. **Migración v1 → v2** (`grafo/v1.ts`, `grafo/migracion.ts`): las reglas de cercanía de la v1, **congeladas**, completan los
   campos que faltan. Al abrir un archivo v1 se agrega **una** op `escena/migracion` que **no se deshace**; el archivo se guarda
   como `schemaVersion` 2. Dos cuerdas v1 que terminan en la misma polea se funden en una con un paso `fijos` (los dos puntos donde
   la v1 tomaba el paso), así que se simula exactamente igual. Un campo `undefined` siempre significa «elemento v1 sin procesar»,
   y el lector lo completa en memoria con las mismas reglas (escenas armadas por código, ops de una app vieja).
7. **Problemas de la escena** (`grafo/validar.ts`): todo lo que la simulación no puede usar se dice, con el elemento al que se
   refiere (extremo suelto, cuerda sin cuerpos, ruta imposible, cuerpos superpuestos, apoyo lejano, fuerza que no sale de un cuerpo,
   polea sin cuerda). Cada problema trae su `arreglo` posible; la interfaz para aplicarlo llega en la Fase 2.

**Transitorio (Fase 1).** Mientras no existan los imanes con retroalimentación visual (Fase 2), al soltar un objeto
`grafo/conectar.ts` le asigna sus uniones con las **mismas distancias de la v1**: dibujar funciona como antes, pero el resultado
queda **guardado y a la vista** (marcas en los extremos: punto = unido, triángulo = fijo, círculo = suelto). Dos cuerdas dibujadas
hasta la misma polea se funden en una que la **envuelve de verdad** (sentido según el dibujo). En la Fase 2 este módulo se
reemplaza por los imanes.

**Alternativas.** (a) Seguir deduciendo con mejores heurísticas: no resuelve el problema de fondo (lo que se ve puede no ser lo que se
simula). (b) Aristas como elementos aparte (`Union` como elemento): duplicaría la integridad referencial sin beneficio, porque una
cuerda o un resorte **ya son** las aristas. (c) Reescribir las ops de un archivo v1 al abrirlo: perdería el historial tal como se guardó.

**Consecuencias.**
- Mover un cuerpo arrastra a sus cuerdas y resortes (también en la vista previa y en el celular del estudiante).
- Las 25 escenas de referencia de la v1 (`tests/escenasV1.ts`) dan **lo mismo** en simulación y DCL, salvo dos errores de la v1 que se
  corrigieron a propósito (un cuerpo lanzado desde una superficie quedaba pegado a ella; uno que aterrizaba deslizando sin roce quedaba
  clavado): `tests/equivalencia-v1.test.ts`.
- Con la envoltura real, una cuerda que termina en el centro de la polea ya no tira de lado: el Atwood dibujado es un Atwood.
- La app vieja rechaza un archivo v2 con su mensaje de «versión más nueva».
