# Pizarra de Física

Pizarra web para resolver problemas de física en clase: dibujo libre, sistema de referencia y vectores, diagrama de cuerpo libre y simulación, con exportación a TikZ. El profesor proyecta y los estudiantes ven en vivo desde el celular.

Sitio: https://davidaguayov.github.io/pizarra/ (cuando el repositorio esté publicado).

> **Estado:** Etapa 0 (cimientos). El lienzo actual es solo una demostración del núcleo (ops, deshacer/rehacer, cámara, temas). La pizarra real llega en la Etapa 1. Ver [CHANGELOG](CHANGELOG.md) y la hoja de ruta en [docs/PROMPT_MAESTRO.md](docs/PROMPT_MAESTRO.md).

## Usarla en clase

Por ahora, en la demostración:

- **Clic / toque:** agrega una marca. **Arrastrar:** desplaza la vista. **Rueda:** zoom.
- **Ctrl+Z** deshace, **Ctrl+Y** (o Ctrl+Shift+Z) rehace, **T** cambia el tema, **0** centra la vista.

## Desarrollar

Requiere Node 20 o superior.

```bash
npm install
npm run dev        # servidor en http://localhost:5173/pizarra/
npm test           # pruebas (Vitest)
npm run lint       # ESLint
npm run typecheck  # TypeScript estricto
npm run build      # compila a dist/
npm run check      # lint + tipos + pruebas + build (lo mismo que la CI)
npm run test:e2e   # Playwright (la 1.ª vez: npx playwright install chromium); CAPTURAS=1 guarda capturas
npm run tokens     # regenera src/ui/tokens.css desde tokens.ts
```

Cada push a `main` ejecuta lint, tipos, pruebas y build, y despliega en GitHub Pages (`.github/workflows/deploy.yml`). Requiere activar **Settings → Pages → Source: GitHub Actions** en el repositorio.

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Estilo heredado del proyecto Insta](docs/ESTILO_INSTA.md) y decisiones pendientes
- [Decisiones (ADR)](docs/decisiones/)
- [Prompt maestro](docs/PROMPT_MAESTRO.md)

Autor: Prof. David Aguayo Vera (UAI / FACH).
