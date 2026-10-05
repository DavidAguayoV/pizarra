# ADR 0006 — Diagrama de cuerpo libre: contactos inferidos por cercanía, sin conexiones vivas

**Fecha:** 2026-10-01 · **Estado:** reemplazada por el [ADR 0008](0008-modelo-de-grafo.md) (Nivel 2)

**Contexto.** El DCL automático debe saber sobre qué se apoya un cuerpo y qué le está atado, a partir de lo que se dibujó.

**Decisión.** Los objetos físicos (bloque, esfera, superficie, polea, cuerda, resorte) son **figuras geométricas con
propiedades**; los contactos y las uniones se **infieren por cercanía** al momento de generar el diagrama (tolerancia 9 cm).
Al soltar un cuerpo cerca de una superficie se apoya solo (imán de 30 cm) para que la puntería no decida si hay contacto.
No hay conexiones vivas entre objetos (mover un bloque no arrastra su cuerda).

**Alternativas.** Anclajes explícitos (la cuerda guarda el id de los cuerpos que une): permitirían arrastrar sistemas
completos y resolver Atwood, pero obligan a mantener integridad referencial en cada edición, borrado y deshacer, y a
decidir qué pasa cuando se borra un extremo. Se pospone: la Etapa 5 (simulación) los necesitará y se agregarán sobre este modelo.

**Consecuencias.** Es simple, predecible y se explica en una frase; el diagrama es una **instantánea** (si el
profesor mueve algo después, se genera de nuevo). El costo: tensiones y sistemas de varios cuerpos quedan como incógnitas
hasta que haya anclajes (ver `docs/PHYSICS.md`).
