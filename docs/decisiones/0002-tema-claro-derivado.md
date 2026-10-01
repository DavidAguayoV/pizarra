# ADR 0002 — Tema claro derivado de la paleta v2 de los videos

**Fecha:** 2026-10-01 · **Estado:** propuesta (pendiente de aprobación de David)

**Contexto.** La pizarra debe ser blanca y también oscura, con contraste AA, y heredar la identidad de
@problemasfisicauai. La paleta v2 está definida solo para fondo oscuro; sobre blanco el ámbar da 1,5:1.

**Decisión.** Tema oscuro = paleta v2 idéntica. Tema claro = mismos tonos y misma asignación de roles
con luminosidad reducida hasta superar 4,5:1 (valores en ESTILO_INSTA.md). Tokens en TypeScript como
fuente de verdad; CSS generado.

**Consecuencias.** Los colores de un mismo rol difieren de luminosidad entre temas pero se reconocen por
tono. Si David prefiere otra variante, se cambia en un solo archivo y las pruebas de contraste lo validan.
