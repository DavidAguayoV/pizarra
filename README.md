# Pizarra de Física

Pizarra web para resolver problemas de física en clase: dibujo libre, sistema de referencia y vectores, diagrama de cuerpo libre y simulación, con exportación a TikZ. El profesor proyecta y los estudiantes ven en vivo desde el celular.

Sitio: https://davidaguayov.github.io/pizarra/ (cuando el repositorio esté publicado).

> **Estado:** Etapa 1 (pizarra): lápiz, resaltador, borrador, líneas, flechas, formas, texto e imágenes; exporta PNG, SVG, JSON y TikZ. Comparte en vivo con los estudiantes (Etapa 2). Ver [CHANGELOG](CHANGELOG.md) y la hoja de ruta en [docs/PROMPT_MAESTRO.md](docs/PROMPT_MAESTRO.md).

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
| **S** | Seleccionar: clic, Mayús+clic (varios), arrastrar para mover; las asas editan vectores y ejes; **Supr** borra; **Esc** suelta |
| **X** | Ejes (sistema de referencia): arrastra para fijar el ángulo; Mayús = de 15° en 15° |
| **V** | Vector: elige su tipo (peso, normal, tensión, roce…) y arrastra, o escribe módulo y ángulo y *Agregar por valores* |
| **C** | Cuerpos: bloque, esfera, superficie, plano inclinado, polea, cuerda y resorte (un clic los coloca; arrastrar los dimensiona) |
| **M** | Mover vista |
| **1 2 3** | Grosor fino / medio / grueso |
| **Ctrl+Z**, **Ctrl+Y** | Deshacer, rehacer |
| **0** | Centrar la vista |

- **Mover y zoom:** rueda = zoom; dos dedos = mover y zoom; barra espaciadora o botón central + arrastrar = mover.
- **Lápiz de tablet:** si hay un lápiz cerca, los toques de dedo se ignoran (rechazo de palma).
- **Vectores y ejes:** dibuja unos **ejes** (puedes girarlos para un plano inclinado) y luego los **vectores**: su ángulo se mide desde el eje x de esos ejes. Selecciona un vector para escribir su módulo y ángulo exactos, mostrar su valor, sus **componentes** y el **ángulo**, o cambiar su sistema de referencia. Selecciona varios para **sumarlos** punta con cola.
- **Diagrama de cuerpo libre:** dibuja un **plano inclinado** y un **bloque** (se apoya solo), pon el roce en la superficie y selecciona el bloque: el panel muestra las fuerzas detectadas y la aceleración. *Generar diagrama de cuerpo libre* dibuja el cuerpo aislado, los ejes, las fuerzas a escala y **ΣF = m a** por componente. g = 9,80 m/s² (editable). Límites y fórmulas verificadas: [docs/PHYSICS.md](docs/PHYSICS.md).
- **Etiquetas:** en el texto libre y en las etiquetas de los vectores se escribe LaTeX entre `$...$` (`$\vec{F}_g$`, `$\theta$`, `$\frac{a}{b}$`).
- **Imágenes:** pegar con Ctrl+V, arrastrar un archivo al lienzo, o el botón *Imagen*.
- **Exportar:** menú *Exportar* (PNG 1x/2x/4x con fondo blanco o transparente, SVG, proyecto .json, TikZ). *Abrir* recupera un proyecto .json con todo su historial.

## Compartir en vivo con los estudiantes

1. **Compartir → Crear sala**: aparece un código de 5 caracteres y un QR grandes, para proyectar.
2. Los estudiantes escanean el QR o escriben el código en la misma pantalla de *Compartir*. Ven la pizarra en el
   celular **mientras la dibujas**, y solo tú puedes dibujar.
3. En el celular: un dedo mueve, dos dedos hacen zoom; **Seguir al profesor** acompaña tu encuadre; **Copiar a mi
   pizarra** les da una copia para dibujar sin afectar la clase.
4. **Dejar de compartir** cierra la sala.

> Hasta que se configure Firebase ([docs/FIREBASE.md](docs/FIREBASE.md)) funciona en **modo demostración**: la sala
> solo se ve en otras pestañas del mismo navegador. Para clase real hay que seguir esa guía (10 minutos).

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
- [Física: objetos y diagrama de cuerpo libre](docs/PHYSICS.md)
- [Exportación a TikZ](docs/TIKZ.md)
- [Protocolo para compartir en vivo](docs/PROTOCOLO_COMPARTIR.md) y [alta de Firebase](docs/FIREBASE.md)
- [Estilo heredado del proyecto Insta](docs/ESTILO_INSTA.md) y decisiones pendientes
- [Decisiones (ADR)](docs/decisiones/)
- [Prompt maestro](docs/PROMPT_MAESTRO.md)

Autor: Prof. David Aguayo Vera (UAI / FACH).
