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

## Etapa 0 (complemento): auditoría de estilo Insta — 2026-10-01

### Agregado
- `docs/ESTILO_INSTA.md`: auditoría del proyecto Insta2 (paleta v2, tipografía, personajes, firma) y lista de recursos faltantes.
- `src/ui/tokens.ts` + `tokens.css` generado: roles de color de la física y temas claro/oscuro derivados (contraste AA verificado, 35 pruebas).
- `assets/personajes/`: lámina, ficha y fotos de perfil de los cuatro personajes (sin modificar).
- Pruebas e2e con Playwright (y capturas con `CAPTURAS=1`) en la CI. ADR 0002.

### Cambiado
- `styles.css` toma sus colores de los tokens Insta (antes paleta azul propia).
- `PROMPT_MAESTRO.md` actualizado con la sección 1b (proyecto hermano Insta) y la Etapa 8.
