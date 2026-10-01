# Prompt maestro — Pizarra Virtual de Física

> Uso: pega este documento al inicio de cada sesión de trabajo (o déjalo en el repo como `docs/PROMPT_MAESTRO.md` y pide "lee el prompt maestro y continúa con la Etapa N").
> Autor del proyecto: Prof. David Aguayo Vera (UAI / FACH). Repositorio: `davidaguayov/pizarra` → https://davidaguayov.github.io/pizarra/

---

## 1. Objetivo

Construir una aplicación web **estática** (GitHub Pages) que sirva como pizarra para resolver problemas de física en clase:

1. **Capa 1 – Pizarra:** dibujo libre con mouse, tablet/lápiz y dedo, con herramientas de dibujo.
2. **Capa 2 – Física:** sobre la pizarra, sistema de referencia, vectores, descomposición y diagrama de cuerpo libre.
3. **Capa 3 – Simulación:** a partir de lo dibujado, simular, mostrar trayectoria, vectores y valores numéricos, gráficos y energía.
4. **Compartir:** el profesor proyecta en clase y los estudiantes ven **en vivo desde su celular**. Solo el profesor transmite.
5. **Exportar:** PNG, SVG, PDF, JSON (proyecto) y, sobre todo, **TikZ** listo para pegar en LaTeX/Beamer.

## 1b. Proyecto hermano: cuenta de Instagram de física (@problemasfisicauai)

Esta pizarra es **proyecto hermano** del proyecto de Instagram/TikTok/YouTube con animaciones de física (videos verticales de ~30 s, estilo @astropedri, pipeline en Manim). **Los personajes y los estilos de ese proyecto se deben mantener**: la pizarra no inventa una identidad visual propia, hereda la del proyecto Insta.

Reglas:

1. **Fuente de verdad del estilo:** antes de escribir UI, leer los recursos del proyecto Insta (personajes, paleta, tipografías, estilo de trazo, fondos, formato de fórmulas, convenciones de colores de vectores/fuerzas) y consolidarlos en `docs/ESTILO_INSTA.md` + un archivo de tokens de diseño (`src/ui/tokens.ts` y variables CSS). Si falta algún recurso, **pedirlo; no inventarlo ni aproximarlo**.
2. **Personajes:** usarlos tal como están definidos en el proyecto Insta (diseño, nombres, rol); no modificarlos ni crear variantes sin autorización de David. Se guardan como activos versionados en `assets/personajes/`.
3. **Coherencia con los videos:** misma paleta y convención de colores de fuerzas y vectores, misma tipografía, mismo orden de desarrollo (fórmulas simbólicas primero, sustitución numérica solo en el penúltimo paso, resultado final). Los temas claro/oscuro de la pizarra son variantes del mismo sistema visual, no un estilo nuevo.
4. **Puente entre proyectos (propuesto):** la escena de la pizarra se exporta como JSON versionado que el pipeline de Manim pueda leer (objetos, vectores, parámetros, solución), para convertir un problema resuelto en clase en un video sin rehacerlo. Y, a la inversa, poder importar la definición de un problema desde el proyecto Insta. Definir el esquema en `docs/ESQUEMA_ESCENA.md` y mantenerlo compatible entre ambos.
5. **Exportación en formato de redes (propuesto):** además de PNG/SVG/TikZ, una exportación vertical 9:16 de la pizarra o del paso a paso, con el estilo Insta, para usarla en los videos.
6. Cualquier cambio visual que se aparte del estilo Insta se consulta antes con David.

## 2. Decisiones ya tomadas (no reabrir sin avisar)

| Tema | Decisión |
|---|---|
| Uso principal | Proyectado en sala; estudiantes miran en el celular (mobile-first en modo espectador) |
| Compartir | Un solo emisor (profesor), muchos espectadores (objetivo ≥ 60). Sala con código de 4–6 caracteres + QR |
| Quién usa la app | Cualquier persona que entre puede usarla **localmente** (dibujar, vectores, simular). Solo el profesor transmite |
| Entrada | Mouse, tablet con lápiz (presión) y dedo |
| Contenido inicial | Dinámica de Newton y energía; luego cinemática, proyectiles, circular, etc. |
| Dibujo → física | Reconocimiento **híbrido** (ver §6), no mágico: vocabulario acotado y confirmación del usuario |
| Exportar | PNG, SVG, PDF, JSON, **TikZ** (prioridad alta) |
| Estética | Fondo blanco tipo pizarra, tema **claro y oscuro**, alto contraste (WCAG AA mínimo), pensado para proyector. **Hereda personajes y estilos del proyecto Insta (§1b), que se mantienen** |
| Idioma | Interfaz, comentarios de usuario, documentación y **todo texto en figuras TikZ 100 % en español** |
| Tecnología | Proyecto grande y documentado, no un archivo único |
| Hosting | GitHub Pages en la cuenta `davidaguayov`, ruta `/pizarra/` |

## 3. Stack técnico (propuesto; justificar si se cambia)

- **Vite + TypeScript** (modo estricto), sin framework de UI pesado (DOM + web components livianos o Preact si hace falta). Canvas 2D para dibujo y simulación.
- **KaTeX** para etiquetas matemáticas en pantalla. **uPlot** para gráficos x(t), v(t), E(t).
- **Vitest** para pruebas (física, geometría, exportador TikZ). **Playwright** para pruebas de interfaz y capturas.
- **Transmisión en vivo:** Firebase Realtime Database (plan gratuito) con **Anonymous Auth** y reglas que permiten escribir solo al dueño de la sala. Todo detrás de una interfaz `Transport` intercambiable (ver §5).
- **CI/CD:** GitHub Actions: lint + tests + build + deploy a Pages (`base: '/pizarra/'`).
- Sin dependencias de servidor propio. Sin claves secretas en el repo (la config web de Firebase es pública; la seguridad va en las reglas).

## 4. Arquitectura

```
src/
  core/        escena, cámara (zoom/pan), eventos, undo/redo, tema
  ink/         trazos libres, herramientas, suavizado, borrador
  physics/     marco de referencia, vectores, objetos, fuerzas, DCL
  sim/         integrador (RK4 paso fijo), eventos, energía, trayectoria
  recognize/   reconocimiento de formas y de escena (ver §6)
  share/       Transport (Firebase, BroadcastChannel local), salas, QR
  export/      png, svg, pdf, json, tikz
  ui/          barra de herramientas, paneles, modo proyector, espectador
docs/          ARCHITECTURE, PHYSICS, PROTOCOLO_COMPARTIR, TIKZ, FIREBASE, decisiones/ (ADR)
tests/         unitarias y e2e
```

Principios:

- **Todo es una operación (op)** en un registro append-only: `{id, t, autor, tipo, payload}`. Las mismas ops sirven para **deshacer/rehacer, guardar, transmitir y reproducir**. Estado actual = reducir las ops.
- La escena vive en **coordenadas del mundo (metros)** con una transformación de vista; así el zoom no degrada nada y la física tiene escala real. Escala configurable (px ↔ m).
- Cada elemento de la escena implementa `render()`, `toSVG()` y **`toTikz()`**. Ninguna etapa se considera terminada si sus elementos no se exportan a TikZ.
- Capas independientes (tinta, física, simulación) que se pueden mostrar u ocultar.

## 5. Compartir en vivo

- `Transport` con dos implementaciones: `FirebaseTransport` (producción) y `LocalTransport` (BroadcastChannel entre pestañas, para desarrollo y demo **sin cuenta**).
- Flujo: el profesor crea sala → código + QR (grande, para proyectar). Espectadores abren el enlace o escanean el QR.
- Datos: `rooms/{código}/snapshot` (estado completo, cada N ops o cada pocos segundos) y `rooms/{código}/ops` (ops incrementales). Trazos en curso se envían por lotes (~50 ms) para ver el dibujo "en vivo" sin saturar.
- Espectador: carga snapshot, se suscribe a ops nuevas, botón **"Seguir al profesor"** (auto-encuadre) y puede **desacoplarse** para hacer zoom/explorar; también puede copiar la escena a un espacio local y usar todas las herramientas sin afectar la transmisión.
- Reglas de la base: lectura pública de la sala; escritura solo si `auth.uid` es el dueño. Documentar en `docs/FIREBASE.md` el paso a paso para crear el proyecto (David lo hará con tu guía) y las reglas.
- Límites a documentar: el plan gratuito de Realtime Database admite ~100 conexiones simultáneas; indicar alternativa (Supabase Realtime o Cloudflare Durable Objects) detrás de la misma interfaz `Transport`.
- Reconexión automática y aviso visible de "sin conexión".

## 6. Dibujo → física (reconocimiento híbrido)

Honestidad de alcance: un sitio estático no puede "entender" cualquier dibujo. Se implementa un pipeline acotado, transparente y corregible:

1. **Reconocimiento de trazos** (módulo `recognize/shapes`, estilo $1/$P más heurísticas geométricas): línea, flecha, rectángulo, círculo, triángulo, zigzag (resorte), arco. Opción de "ajustar forma" al soltar (snapping).
2. **Inferencia de escena** (reglas): rectángulo apoyado sobre una línea → bloque sobre superficie; línea inclinada + rectángulo apoyado → plano inclinado con bloque (ángulo medido); círculo sobre línea → esfera; zigzag entre pared y bloque → resorte; flecha cerca de un objeto → fuerza candidata; dos ejes perpendiculares → sistema de referencia.
3. **Botón "Interpretar"** (nunca automático): muestra los objetos propuestos como superposición y un panel lateral con parámetros editables (masa, ángulo, μ, k, …) con valores por defecto razonables. El usuario acepta, edita o descarta cada uno.
4. Alternativa siempre disponible: insertar objetos desde una **paleta** (sin dibujar).
5. Registrar tasa de acierto en pruebas con un conjunto de dibujos de ejemplo. Diseñar el módulo como plugin para poder mejorarlo luego (p. ej. IA con visión, que requeriría clave de API y por ahora queda **fuera** del alcance).

## 7. Física: Newton y energía (primer contenido)

- **Objetos:** bloque, esfera, plano inclinado, superficie horizontal, polea ideal, cuerda, resorte (k, longitud natural), pared.
- **Fuerzas:** peso, normal, roce estático y cinético (μs, μk), tensión, fuerza aplicada, elástica. Convención de colores y letras fija y consistente (además del color, usar etiqueta y estilo de línea para no depender solo del color).
- **Vectores:** crear por arrastre o por valores (módulo, ángulo); editar; descomponer en componentes según un marco rotable (útil en planos inclinados); suma punta-cola y resultante; ángulos marcados; etiquetas con KaTeX.
- **DCL automático:** dado un objeto con sus contactos, proponer el diagrama de cuerpo libre y la ecuación ΣF = ma por componente (mostrar el planteamiento, no solo el resultado).
- **Simulación:** integrador propio **RK4 a paso fijo** (transparente y exacto para fines docentes), con detección de eventos: transición estático→cinético, despegue de superficie, llegada a longitud natural del resorte, detención. Motor externo (Matter.js/Planck.js) solo si se agregan colisiones complejas, y marcado como aproximado.
- **Salidas:** trayectoria dibujada, vectores v y a en vivo, tabla de valores, gráficos x(t), v(t), a(t), energías K, U_g, U_e, E_mec y trabajo de fuerzas no conservativas; controles reproducir/pausar/paso/velocidad; comparación con solución analítica cuando exista. SI por defecto, `g` configurable (9,8 m/s²).
- Etapas posteriores: cinemática 1D/2D, proyectiles, movimiento circular, oscilaciones, colisiones.

## 8. Exportación (TikZ prioritario)

- **TikZ:** copiar al portapapeles y descargar `.tex`; dos modos: fragmento `tikzpicture` (para pegar en Beamer/apuntes) y documento `standalone` compilable. Coordenadas en cm con escala configurable. Trazos libres simplificados (Ramer–Douglas–Peucker) y convertidos a curvas Bézier suaves. Vectores con `-latex`, ejes, ángulos con `pic`/arcos, resortes con zigzag o `decorate`, planos y bloques como polígonos. **Textos y etiquetas en español**, matemáticas en modo math. Paleta compatible con el estilo institucional UAI (colores definidos al inicio del fragmento, con nombres claros y comentarios por capa).
- Pruebas: archivos de referencia ("golden") y, si hay LaTeX disponible, compilación de verificación.
- **Otros formatos:** PNG (resolución elegible, fondo blanco o transparente), SVG, PDF (vía impresión/SVG), JSON del proyecto (importable, versionado con `schemaVersion`).
- Documentar en `docs/TIKZ.md` el mapeo elemento → código TikZ.

## 9. Interfaz y accesibilidad

- **Modo proyector:** UI mínima, trazos y fuentes grandes, botones grandes. **Modo espectador** pensado para celular (vertical), con zoom por pellizco.
- Temas claro/oscuro con contraste AA o mejor; tamaños de trazo mínimos legibles a distancia; foco visible; no depender solo del color.
- Entrada: Pointer Events unificados; presión del lápiz; **rechazo de palma** (si hay `pointerType: pen`, ignorar toque); dos dedos = pan/zoom, un dedo = dibujar (en modo emisor) o desplazar (espectador).
- Atajos de teclado documentados. Todo el texto de la interfaz en español.

## 10. Hoja de ruta por etapas

Cada etapa termina con: pruebas en verde, build, **captura de pantalla de verificación**, documentación actualizada, entrada en `CHANGELOG.md`, y un resumen breve para David. **Detenerse al final de cada etapa y esperar revisión.**

- **Etapa 0 — Cimientos:** repo, Vite+TS, lint, tests, CI/CD a Pages, estructura de carpetas, README y `docs/ARCHITECTURE.md`, registro de ops con deshacer/rehacer. **Incluye la auditoría de estilo del proyecto Insta (§1b):** `docs/ESTILO_INSTA.md`, tokens de diseño y temas claro/oscuro derivados de ellos, y la lista de recursos faltantes que David deba aportar.
- **Etapa 1 — Pizarra:** lápiz, resaltador, borrador, líneas, flechas, formas, texto, colores/grosores, pan/zoom, imágenes pegadas, presión, rechazo de palma. Exportar PNG/SVG/JSON y **TikZ de la tinta**.
- **Etapa 2 — Compartir en vivo:** `Transport`, `LocalTransport` (demo sin cuenta), `FirebaseTransport`, salas, QR, modo espectador móvil, reconexión. Guía `docs/FIREBASE.md`. *(Se adelanta porque permite usar la pizarra en clase desde temprano.)*
- **Etapa 3 — Sistema de referencia y vectores:** ejes movibles/rotables, grilla, escala, vectores, componentes, suma, ángulos, etiquetas KaTeX. TikZ de todo lo anterior.
- **Etapa 4 — Objetos y DCL:** paleta de objetos, fuerzas, DCL automático, planteamiento ΣF = ma.
- **Etapa 5 — Simulación:** integrador RK4, eventos, trayectoria, vectores en vivo, gráficos, tabla, energía, comparación analítica.
- **Etapa 6 — Interpretar dibujo:** reconocimiento de formas, inferencia de escena, panel de confirmación.
- **Etapa 7 — Pulido y más física:** cinemática, proyectiles, circular, oscilaciones; exportación completa; rendimiento; accesibilidad; documentación final.
- **Etapa 8 — Puente con el proyecto Insta:** exportar/importar escenas JSON compatibles con el pipeline de Manim, exportación vertical 9:16 con el estilo Insta, y revisión final de que personajes y estilos se mantienen idénticos.

## 11. Pruebas de física (obligatorias antes de dar por buena una simulación)

- Proyectil sin roce vs. solución analítica (alcance, altura máxima, tiempo).
- Plano inclinado con roce: aceleración `g(sin θ − μk cos θ)` y condición de reposo `tan θ ≤ μs`.
- Resorte masa: periodo `2π√(m/k)` y conservación de energía con error relativo < 1e-6.
- Caída libre y conservación de E_mec con fuerzas conservativas.
- Descomposición y suma de vectores contra cálculo directo.
- Cualquier error de física detectado se reporta explícitamente y se corrige en todo el contenido derivado.

## 12. Documentación y convenciones

- `README.md` (qué es, cómo usarlo en clase, cómo desarrollarlo), `CHANGELOG.md`, `docs/` descritos arriba, decisiones importantes como ADR cortos en `docs/decisiones/`.
- Código comentado en español donde aporte; nombres de identificadores en inglés consistente. Commits pequeños y descriptivos.
- Sin trampas de desempeño: dibujar a 60 fps con miles de trazos (capas en caché, recorte por vista).

## 13. Forma de trabajo

1. Antes de cada etapa, resumir en pocas líneas lo que se construirá y listar supuestos.
2. Las correcciones de David (física, figuras, textos) se aplican **de inmediato y en todo el contenido derivado**.
3. Preguntar solo si una decisión es costosa de revertir; en lo demás, elegir un valor razonable y anotarlo.
4. No agregar dependencias grandes sin justificar peso y licencia.
5. Verificar siempre abriendo la página en un navegador y comprobando el resultado antes de decir que algo funciona.

## 14. Para empezar

"Lee este prompt maestro. Primero localiza y lee los recursos de estilo y personajes del proyecto Insta (§1b) y dime dónde están si no los encuentras. Ejecuta la **Etapa 0** en la carpeta del proyecto, crea el repositorio `davidaguayov/pizarra` (o prepáralo para que yo lo suba), y detente al terminar para mi revisión."
