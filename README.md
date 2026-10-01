# Pizarra de Física

Pizarra web para resolver problemas de física en clase: dibujo libre, sistema de referencia y vectores, diagrama de cuerpo libre y simulación, con exportación a TikZ. El profesor proyecta y los estudiantes ven en vivo desde el celular.

Sitio: https://davidaguayov.github.io/pizarra/ (cuando el repositorio esté publicado).

> **Estado:** Etapa 1 (pizarra): lápiz, resaltador, borrador, líneas, flechas, formas, texto e imágenes; exporta PNG, SVG, JSON y TikZ. La transmisión en vivo llega en la Etapa 2. Ver [CHANGELOG](CHANGELOG.md) y la hoja de ruta en [docs/PROMPT_MAESTRO.md](docs/PROMPT_MAESTRO.md).

## Usarla en clase

Herramientas (también con teclado):

| Tecla | Herramienta |
|---|---|
| **P** | Lápiz (con presión si el lápiz la entrega) |
| **H** | Resaltador |
| **B** | Borrador (borra el objeto completo que toca) |
| **L** · **F** | Línea · Flecha (Mayús = ángulos de 45°) |
| **R** · **O** | Rectángulo · Elipse (Mayús = cuadrado / círculo) |
| **T** | Texto (clic, escribir, **Enter** coloca, **Mayús+Enter** nueva línea, **Esc** cancela; `$...$` = matemática en la exportación a TikZ) |
| **M** | Mover vista |
| **1 2 3** | Grosor fino / medio / grueso |
| **Ctrl+Z**, **Ctrl+Y** | Deshacer, rehacer |
| **0** | Centrar la vista |

- **Mover y zoom:** rueda = zoom; dos dedos = mover y zoom; barra espaciadora o botón central + arrastrar = mover.
- **Lápiz de tablet:** si hay un lápiz cerca, los toques de dedo se ignoran (rechazo de palma).
- **Imágenes:** pegar con Ctrl+V, arrastrar un archivo al lienzo, o el botón *Imagen*.
- **Exportar:** menú *Exportar* (PNG 1x/2x/4x con fondo blanco o transparente, SVG, proyecto .json, TikZ). *Abrir* recupera un proyecto .json con todo su historial.

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
- [Exportación a TikZ](docs/TIKZ.md)
- [Estilo heredado del proyecto Insta](docs/ESTILO_INSTA.md) y decisiones pendientes
- [Decisiones (ADR)](docs/decisiones/)
- [Prompt maestro](docs/PROMPT_MAESTRO.md)

Autor: Prof. David Aguayo Vera (UAI / FACH).
