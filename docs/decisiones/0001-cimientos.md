# ADR 0001 — Cimientos de la Etapa 0

Fecha: 2026-10-01. Estado: aceptada.

## Decisiones

1. **Vite + TypeScript estricto, sin framework de UI.** DOM directo y Canvas 2D; la interfaz es pequeña y el rendimiento del lienzo importa más que la reactividad.
2. **Deshacer/rehacer como ops en un registro append-only.** Permite reutilizar el registro para transmitir y guardar sin un mecanismo aparte. Costo: recalcular el estado completo; se mitigará con snapshots.
3. **Identificadores en español en el código nuevo** (`Camara`, `Store.deshacer`, tipos de op `core/deshacer`). Esto difiere del prompt maestro, que pedía identificadores en inglés; se anota para que David decida si prefiere unificar a inglés antes de que haya más código.
4. **Playwright y KaTeX/uPlot se difieren** a la etapa que los usa (Etapa 1 y 3/5). En la Etapa 0 la verificación visual se hizo en el navegador integrado.
5. **Pruebas con jsdom** para poder probar módulos que tocan DOM (tema) sin navegador.
6. **`node_modules` marcado como ignorado por Dropbox** (el proyecto vive en Dropbox).
