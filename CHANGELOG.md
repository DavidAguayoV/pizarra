# Cambios

## Sin publicar

### Etapa 0 — Cimientos (2026-10-01)

- Proyecto Vite + TypeScript (modo estricto), ESLint, Vitest.
- Registro de ops append-only con deshacer/rehacer como meta-ops (`src/core/ops.ts`, `store.ts`).
- Cámara mundo (m) ↔ pantalla (px) con zoom anclado y pan (`src/core/camara.ts`).
- Temas claro y oscuro con tokens de color y contraste AA (`src/core/tema.ts`, `src/styles.css`).
- Pantalla de demostración: lienzo con grilla en metros, marcas, pan, zoom, atajos.
- CI/CD a GitHub Pages (`base: '/pizarra/'`).
- Estructura de carpetas por módulo, README y `docs/ARCHITECTURE.md`.
- 13 pruebas unitarias (ops y cámara).
