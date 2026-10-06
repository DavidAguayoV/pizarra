# Pizarra de Física

Pizarra web para resolver problemas de física en clase: dibujo libre, sistema de referencia y vectores, diagrama de cuerpo libre y simulación, con exportación a TikZ. El profesor proyecta y los estudiantes ven en vivo desde el celular.

Sitio: https://davidaguayov.github.io/pizarra/ (cuando el repositorio esté publicado).

> **Estado:** Etapas 0–5 (pizarra, compartir en vivo, vectores, objetos y DCL, simulación) y **Nivel 2, Fases 1 y 2**: la escena es un grafo con uniones explícitas; barra por modos, imanes, cuerda por poleas en un gesto, polea móvil y problemas con arreglo. Ver [CHANGELOG](CHANGELOG.md), la [auditoría del Nivel 2](docs/AUDITORIA_NIVEL2.md) y la hoja de ruta en [docs/PROMPT_MAESTRO.md](docs/PROMPT_MAESTRO.md).

## Usarla en clase

La barra tiene **cuatro modos**; cada uno muestra solo sus herramientas (en el celular, la barra va abajo):

| Modo | Para qué | Herramientas (tecla) |
|---|---|---|
| **Dibujar** | Tinta y formas | Seleccionar (**S**), Lápiz (**P**), Resaltador (**H**), Borrador (**B**), Línea (**L**), Flecha (**F**), Rectángulo (**R**), Elipse (**O**), Texto (**T**), Imagen, Mover vista (**M**) |
| **Armar** | Piezas físicas | Montajes, Bloque (**K**), Esfera (**E**), Polea (**Y**), Superficie (**U**), Plano inclinado (**I**), Con roce, Curva (**J**), Ejes (**X**), Vector (**V**), Medir (**D**) |
| **Conectar** | Cuerdas y resortes | Cuerda (**C**), Resorte (**Z**) |
| **Simular** | Abre y cierra el panel de simulación | |

Otras teclas: **1 2 3** grosor fino / medio / grueso · **Ctrl+Z**, **Ctrl+Y** deshacer y rehacer · **0** centrar la vista ·
**Supr** borra lo seleccionado · **Esc** suelta la selección · **flechas** empujan lo seleccionado 10 cm (con **Mayús**, 1 cm) ·
**,** y **.** lo giran 15° · **Ctrl+D** lo duplica (conectado entre sí) · **Ctrl+A** selecciona todo · **G** activa la rejilla
magnética (10 cm).

**Accesibilidad:** con el foco en la pizarra, **Tab** y **Mayús+Tab** recorren los objetos (un lector de pantalla anuncia cada uno con
sus datos y su posición), las flechas los mueven, **Enter** lleva al panel para editarlo y, al final de la lista, Tab sale de la
pizarra. La escena tiene una descripción en texto y los eventos de la simulación se anuncian. Con *reducir movimiento* activado en
el sistema, la interfaz no tiene transiciones. Los colores de texto, botones e interruptores cumplen AA (4,5:1) en los dos temas. Abrir, Centrar, Tema y Escala están en el menú **⋯ Más**
(en el celular también Rehacer, Exportar y Compartir).

- **Curvas y loops:** *Curva* dibuja un arco (arrastrando, un cuarto de circunferencia; con un toque, un valle). En su panel, la
  curvatura (+ valle, − loma) y «Solo por un lado (pista)»; el asa del medio la curva más o menos. Los cuerpos pasan solos de una
  superficie a otra (del plano al piso, del piso a la rampa, al loop) y se despegan si la normal se haría negativa.
- **Montajes** (*Armar*): Atwood, plano inclinado, plano con polea y colgante, mesa con polea y colgante, masa-resorte horizontal y
  vertical, péndulo, loop, valle, loma, bloques apilados y proyectil, ya conectados y listos para simular; aparecen en el centro de la vista y un
  deshacer los quita enteros. Con *Con roce* activo, sus superficies traen roce.
- **Disponer:** con **Mayús + clic** se seleccionan varios: el panel los **alinea** (bordes o centros), los **distribuye**, los gira
  15° y los **duplica**. *Medir* (**D**) muestra la distancia y el ángulo entre dos puntos (se pega a caras, esquinas y centros) sin
  agregar nada. La **rejilla magnética** (menú ⋯ Más o **G**) lleva lo que se suelta a múltiplos de 10 cm.
- **Armar un Atwood en 8 toques:** *Armar* → *Polea* → toca dónde va → *Bloque* → toca dos veces (se numeran solos: m₁ = 2 kg,
  m₂ = 3 kg) → *Conectar* → **un solo gesto**: desde m₁, sube por un lado de la polea, pasa por encima y baja hasta m₂. *Simular*.
- **En el celular, conectar toque a toque:** con *Cuerda*, toca el primer bloque, después la polea y al final el otro bloque (sin
  arrastrar); arriba aparece una guía con *Cancelar*. La cuerda se une sola a la cara que corresponde.
- **Piezas de tamaño fijo:** bloque, esfera y polea aparecen con un toque y se mueven arrastrándolas; su tamaño se cambia en su panel.
  Una polea soltada **sobre un bloque** queda montada en él (**polea móvil**).
- **Imanes:** al conectar, los puertos de los objetos cercanos se marcan y el extremo se pega al más próximo (anillo grande). Al
  soltar, un punto en el extremo indica que quedó unido; un triángulo, que quedó fijo en el espacio; un círculo vacío, que está
  suelto. Mover un cuerpo arrastra sus cuerdas y resortes.
- **Cuerda por poleas en un gesto:** si el trazo pasa sobre una polea (se marca con un anillo punteado), la cuerda la envuelve por el
  lado por donde pasaste; también dobla en el **borde de una mesa** (el extremo de una superficie). Un cuerpo que cuelga de la polea
  se corre solo para que su tramo quede **vertical** (si no, oscilaría como un péndulo).
- **⚠ Problemas de la escena:** el aviso de la barra lista lo que la simulación no puede usar o lo que conviene revisar (un tramo
  inclinado, un tramo que no es paralelo al plano, cuerpos superpuestos, un extremo suelto…) con un botón para **arreglarlo**.
- **Mover y zoom:** rueda = zoom; dos dedos = mover y zoom; barra espaciadora o botón central + arrastrar = mover.
- **Lápiz de tablet:** si hay un lápiz cerca, los toques de dedo se ignoran (rechazo de palma).
- **Vectores y ejes:** dibuja unos **ejes** (puedes girarlos para un plano inclinado) y luego los **vectores**: su ángulo se mide desde el eje x de esos ejes. Selecciona un vector para escribir su módulo y ángulo exactos, mostrar su valor, sus **componentes** y el **ángulo**, o cambiar su sistema de referencia. Selecciona varios para **sumarlos** punta con cola.
- **Cómo se guardan las uniones:** [ADR 0008](docs/decisiones/0008-modelo-de-grafo.md) (grafo) y [ADR 0009](docs/decisiones/0009-modos-e-imanes.md) (modos e imanes).
- **Diagrama de cuerpo libre:** dibuja un **plano inclinado** y un **bloque** (se apoya solo), pon el roce en la superficie y selecciona el bloque: el panel muestra las fuerzas detectadas y la aceleración. *Generar diagrama de cuerpo libre* dibuja el cuerpo aislado, los ejes, las fuerzas a escala y **ΣF = m a** por componente. g = 9,80 m/s² (editable). Límites y fórmulas verificadas: [docs/PHYSICS.md](docs/PHYSICS.md).
- **Simulación:** *Simular* abre un panel que corre el movimiento de la escena (RK4 con roce, cuerdas, poleas —también con masa—, resortes, cuerpos que **giran** y ruedan, y **choques** con coeficiente de restitución *e*): ves los cuerpos moverse con sus vectores v y a y la trayectoria, **gráficos** de posición, velocidad, aceleración y energía, tabla de valores, la **comparación con la solución analítica**, y exportas a CSV o a TikZ (pgfplots). Dale velocidad inicial a un cuerpo seleccionándolo. Lo que no se puede simular (un extremo suelto, cuerpos superpuestos…) aparece en el panel como **problema de la escena**, nunca se ignora en silencio. Detalle y validación: [docs/SIMULACION.md](docs/SIMULACION.md).
- **Etiquetas:** en el texto libre y en las etiquetas de los vectores se escribe LaTeX entre `$...$` (`$\vec{F}_g$`, `$\theta$`, `$\frac{a}{b}$`).
- **Imágenes:** pegar con Ctrl+V, arrastrar un archivo al lienzo, o el botón *Imagen*.
- **Exportar:** menú *Exportar* (PNG 1x/2x/4x con fondo blanco o transparente, SVG, proyecto .json, TikZ). *Abrir* recupera un proyecto .json con todo su historial; los proyectos de la versión anterior se abren y se simulan igual (se migran solos).

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
- [Simulación: modelo, eventos y validación](docs/SIMULACION.md)
- [Exportación a TikZ](docs/TIKZ.md)
- [Protocolo para compartir en vivo](docs/PROTOCOLO_COMPARTIR.md) y [alta de Firebase](docs/FIREBASE.md)
- [Estilo heredado del proyecto Insta](docs/ESTILO_INSTA.md) y decisiones pendientes
- [Decisiones (ADR)](docs/decisiones/) y [auditoría del Nivel 2](docs/AUDITORIA_NIVEL2.md)
- [Prompt maestro](docs/PROMPT_MAESTRO.md)

Autor: Prof. David Aguayo Vera (UAI / FACH).
