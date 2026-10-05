# ADR 0005 — Etiquetas matemáticas con compositor propio (sin KaTeX)

**Fecha:** 2026-10-01 · **Estado:** aceptada (se aparta del prompt maestro; aprobada por David el 2026-10-05)

**Contexto.** El prompt maestro propone KaTeX para las etiquetas matemáticas en pantalla. Las etiquetas de vectores
(`\vec{F}_g`, `\theta`, `F_x = 8{,}7\,\mathrm{N}`) deben verse **igual** en la pantalla del profesor, en el celular del estudiante,
en el PNG y en el SVG.

**Problema con KaTeX.** Produce HTML con fuentes web: no se puede dibujar en un `canvas`. Para el PNG y el SVG habría que
rasterizarlo con `<foreignObject>` e incrustar las fuentes (~300 KB), una técnica que Safari trata como contenido
contaminado en el canvas. La alternativa (superponer HTML sobre el lienzo) obliga a sincronizar cámara, recorte y capas
en tres salidas distintas y no sirve para el PNG.

**Decisión.** Un compositor propio (`src/core/matematica.ts`, ~400 líneas, sin dependencias) para el subconjunto de LaTeX
que usa la física: letras y dígitos, subíndices y superíndices anidados, letras griegas, `\vec \hat \bar \dot`, `\frac`,
`\sqrt`, `\text`/`\mathrm`, funciones y símbolos. Devuelve primitivas (texto y líneas) con medidas **estimadas e
idénticas** en todas las salidas, así que no depende del DOM ni de las fuentes y se prueba en Node. **TikZ no pasa por
aquí**: lleva el LaTeX original, de modo que el documento final tiene composición tipográfica real.

**Consecuencias.** Menos peso (~0 KB frente a ~300 KB) y salidas consistentes. A cambio, lo que no esté en el subconjunto
(matrices, `\int` con límites…) se muestra de forma aproximada en pantalla aunque en TikZ salga bien; un comando
desconocido no rompe: se muestra su nombre. Si más adelante se necesita LaTeX completo en pantalla, el punto de
reemplazo es `componerMat`/`componerLinea` y las tres salidas (`dibujarMat`, `matASvg`).
