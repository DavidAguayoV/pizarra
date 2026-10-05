# Cambios

## Nivel 2, Fase 1 — Modelo de grafo y migración (2026-10-05)

Auditoría previa y decisiones: [docs/AUDITORIA_NIVEL2.md](docs/AUDITORIA_NIVEL2.md). Decisión: [ADR 0008](docs/decisiones/0008-modelo-de-grafo.md).

### Agregado
- **La escena es un grafo**: los extremos de cuerdas y resortes guardan a qué están unidos (puerto de un objeto, fijo en el espacio o suelto), las cuerdas guardan su **ruta** por las poleas, los cuerpos la superficie en que se apoyan y las fuerzas aplicadas el cuerpo sobre el que actúan.
- **Puertos** con nombre en cada objeto (caras y esquinas del bloque, borde de la esfera, eje de la polea, puntos de una superficie).
- **La geometría de lo unido se deriva**: al mover un cuerpo, sus cuerdas y resortes lo siguen (también mientras se arrastra y en el celular del estudiante).
- **Cuerda que envuelve la polea**: dos cuerdas dibujadas hasta la misma polea se funden en una sola, con tramos tangentes y el arco de contacto dibujado (pantalla, PNG, SVG y TikZ con `arc`, compilado con pdflatex). Con la envoltura real, una cuerda que termina en el centro de la polea ya no tira de lado.
- **Marcas de las uniones** al editar: punto = unido, triángulo = fijo en el espacio, círculo vacío = suelto.
- **Lector único del grafo**: la simulación y el diagrama de cuerpo libre leen las mismas relaciones (antes cada uno las deducía con reglas distintas).
- **Problemas de la escena** en el panel de simulación, con el elemento al que se refieren: extremo suelto, cuerda sin cuerpos, ruta imposible, cuerpos superpuestos, apoyo lejano, fuerza que no sale de un cuerpo, polea sin cuerda.
- **Integridad en la misma op**: borrar un cuerpo suelta lo que estaba unido, borrar una polea la saca de la ruta, mover una superficie arrastra a sus cuerpos apoyados, mover un extremo lo vuelve a unir. Un deshacer lo revierte todo junto.
- **Proyectos v2** (`schemaVersion` 2). Un proyecto v1 se abre migrado con una op que no se deshace; se simula **igual** (25 escenas de referencia grabadas con la v1, error < 1e-7).
- 36 pruebas unitarias nuevas del grafo, 27 de equivalencia con la v1 y 3 e2e con la interfaz real (Atwood dibujado con la interfaz en 9 acciones y con la T de la teoría, cuerda que sigue al bloque, proyecto v1 → v2). Total: 360 unitarias y 45 e2e.

### Corregido
- Un cuerpo apoyado que partía alejándose de la superficie (un proyectil lanzado desde el suelo) quedaba pegado a ella y deslizaba.
- Un cuerpo que aterrizaba deslizando sobre un piso sin roce quedaba clavado en el punto de impacto.

### Provisorio (hasta la Fase 2)
- Las uniones se asignan al soltar un objeto con las distancias de antes (9 cm a un cuerpo, radio + 14 cm a una polea), pero ahora quedan guardadas y a la vista. Los imanes con retroalimentación, el gesto continuo y los botones «arreglar» llegan en la Fase 2.

## Etapa 5 — Simulación (2026-10-03)

### Agregado
- **Motor de simulación propio**: RK4 de paso fijo con restricciones por multiplicadores de Lagrange. Un solo mecanismo da el contacto con superficies, el **roce estático y cinético**, las **cuerdas y poleas con tensiones reales** (Atwood, bloque en la mesa con masa colgante, péndulo) y los resortes.
- **Eventos**: impacto, despegue, salida por el extremo, detención, estático → cinético, cambio de sentido, cuerda que se afloja o se tensa y resorte en su largo natural. El impacto y el tensado de cuerdas se ubican en su instante exacto, así que la energía se contabiliza sin error de paso.
- **Panel *Simular***: reproducir, pausar, paso, reiniciar, velocidad de 0,1× a 4×, g editable; cuerpos animados sobre la pizarra con **vectores v y a** y **trayectoria**; **gráficos** de posición, velocidad, aceleración y energía (K, U_g, U_e, E_mec, trabajo del roce); **tabla de valores**; normal, roce y tensiones en vivo; lista de eventos; balance de energía.
- **Comparación con la solución analítica** (aceleración constante y oscilador armónico), con la diferencia máxima.
- **Velocidad inicial** de cada cuerpo (rapidez y dirección) en su panel.
- Exportación a **CSV** (para Excel en español) y a **TikZ/pgfplots** (fragmento y documento standalone, compilado con pdflatex); *Dejar trayectoria en la pizarra*.
- Los estudiantes ven la simulación en su celular por el canal en vivo.
- `docs/SIMULACION.md` (modelo, eventos, validación, límites), ADR 0007; 61 pruebas del motor contra soluciones analíticas y 10 e2e.

### Pendiente
- Cuerpos que giran, choques entre cuerpos, poleas con masa y radio efectivo.
- Réplica determinista de la simulación en cada celular (hoy se transmite el movimiento: ~60 KB/s por estudiante mientras corre).

## Etapa 4 — Objetos y diagrama de cuerpo libre (2026-10-01)

### Agregado
- Objetos físicos: **bloque, esfera, superficie** (suelo, plano inclinado, pared; con μs y μk), **polea, cuerda y resorte**. Herramienta *Cuerpos* con paleta; un cuerpo soltado cerca de una superficie **se apoya solo**.
- **Diagrama de cuerpo libre automático**: detecta peso, normal, roce, tensión, fuerza elástica y fuerzas aplicadas; resuelve normal y roce (**estático o cinético**) y la aceleración cuando no hay incógnitas; dibuja el cuerpo aislado con los ejes alineados a la superficie, las fuerzas a escala común y **ΣF = m a por componente** (símbolos y valores). Una sola op: un solo deshacer.
- Vista previa en vivo de fuerzas y aceleración en el panel del cuerpo; g editable (9,80 por defecto) y modo de roce (automático, estático, cinético, sin roce).
- Asas: girar y redimensionar el bloque, radio de esferas y poleas, extremos de cuerdas, resortes y superficies.
- Exportación a SVG, PNG y TikZ de todos los objetos (compilado con pdflatex).
- Física verificada contra las fórmulas del curso: `a = g (sen θ − μk cos θ)`, reposo si `tan θ ≤ μs`, barrido de ángulos y coeficientes, piso con fuerza aplicada, resorte, caída libre. `docs/PHYSICS.md`, ADR 0006.
- 237 pruebas unitarias y 39 e2e.

### Cambiado
- Medidas de texto más finas en el compositor de etiquetas (letras angostas, espacios, funciones con espacio fino).

### Corregido
- La vista previa del panel no se refrescaba mientras se escribía en un campo.

### Pendiente (Etapa 5 en adelante)
- **Tensiones y sistemas de varios cuerpos** (Atwood, bloques unidos por cuerdas) quedan como incógnitas: necesitan uniones vivas entre objetos y la simulación.
- Más de una superficie de contacto, rodadura y roce con velocidad inicial.

## Etapa 3 — Sistema de referencia y vectores (2026-10-01)

### Agregado
- **Ejes** (sistema de referencia) movibles y rotables; **vectores** con rol físico (peso, normal, tensión, roce, aplicada, velocidad, aceleración, momento, resultante), color y letra de la convención de los videos.
- Vectores por arrastre **o por valores** (módulo y ángulo respecto del sistema de referencia); escala configurable por vector (unidades por metro) y de la vista (px/m).
- **Componentes** (flechas punteadas y proyecciones), **ángulo marcado** y **suma punta con cola** con su resultante.
- Herramienta **Seleccionar**: mover, asas de edición, selección múltiple, Supr; panel de propiedades con números exactos. Editar es una op `elemento/lote` (un solo deshacer) y también se transmite en vivo.
- **Etiquetas matemáticas** (subíndices, `\vec`, griegas, fracciones) compuestas con las mismas medidas en pantalla, PNG, SVG y celular, incluso dentro del texto libre (`$...$`).
- TikZ de todo lo anterior, **compilado con pdflatex**; el recuadro de exportación incluye las etiquetas.
- ADR 0005; 172 pruebas unitarias (física de vectores contra cálculo directo) y 26 e2e.

### Cambiado
- El texto libre con `$...$` ahora se ve compuesto en pantalla (antes solo en TikZ).
- La barra de herramientas es más compacta.

### Corregido
- Las unidades se exportaban con `\text`, que exige amsmath: ahora `\mathrm` (LaTeX básico).

### Pendiente
- Etiquetas arrastrables (hoy se colocan automáticamente), polígono de suma con más de dos vectores en una sola figura con etiquetas propias, y la Etapa 4 (objetos, DCL).
## Etapa 2 — Compartir en vivo (2026-10-01)

### Agregado
- Sala con código de 5 caracteres (sin `0 O 1 I`) y **QR**; panel grande para proyectar. Botón *Compartir* con indicador "En vivo".
- **Modo espectador** (`?sala=CODIGO`), pensado para celular vertical: un dedo mueve, dos dedos hacen zoom, **Seguir al profesor** (se desacopla al mover), **Copiar a mi pizarra**, aviso visible de conexión.
- El trazo del profesor se ve **mientras lo dibuja**, en lotes de 50 ms con solo los puntos nuevos.
- `Transport` intercambiable: `FirebaseTransport` (Realtime Database + inicio anónimo, SDK cargado solo al compartir) y `LocalTransport` (BroadcastChannel, demostración sin cuenta).
- Sincronización robusta: ops repetidas o fuera de orden, huecos, época nueva al abrir otro proyecto, reconexión con snapshot.
- Reglas de seguridad (`database.rules.json`): lectura por código, escritura solo del dueño.
- `docs/FIREBASE.md` (alta paso a paso y lista de comprobación), `docs/PROTOCOLO_COMPARTIR.md`, ADR 0004.
- 21 pruebas unitarias de sincronización (base en memoria) y 9 e2e con dos pestañas (profesor y celular).

### Cambiado
- El elemento en construcción conserva el mismo id al confirmarse (así el trazo en vivo y el definitivo son el mismo).
- El dibujo (cámara, caché, vista previa) se extrajo a `ui/lienzo.ts` para compartirlo con el modo espectador.

### Pendiente
- **Probar contra el servicio real de Firebase** (hoy verificado con una base en memoria y con el transporte local); falta crear el proyecto (guía en `docs/FIREBASE.md`).
- Contador de estudiantes conectados; las reglas de seguridad no se prueban en la CI (requieren el emulador).

## Etapa 1 — Pizarra (2026-10-01)

### Agregado
- Elementos: trazo (lápiz y resaltador), línea, flecha, rectángulo, elipse, texto e imagen, en metros, con color por rol de tinta que se adapta a cada tema.
- Herramientas con teclado, 3 grosores, 7 colores con nombre (no depende solo del color), Mayús para 45°/cuadrado/círculo.
- Entrada con Pointer Events: presión del lápiz, rechazo de palma, dos dedos = pan/zoom, rueda, espacio/botón central, botón borrador del lápiz.
- Imágenes pegadas, arrastradas o insertadas (se reducen a 1600 px).
- Exportación: PNG (1x/2x/4x, fondo blanco o transparente), SVG, JSON de proyecto versionado (`schemaVersion` 1) y **TikZ** (fragmento y documento) con RDP + Bézier; verificado compilando con pdflatex.
- Caché de dibujo con recorte por vista: 3000 trazos a 60 fps.
- `docs/TIKZ.md` y ADR 0003; 88 pruebas unitarias (incluye archivos de referencia de TikZ y SVG) y 12 e2e.

### Corregido
- El tema del sistema se guardaba como preferencia al primer arranque y después ya no seguía al sistema; ahora solo se guarda al alternarlo.

### Pendiente
- PDF (Etapa 7), mover/editar elementos ya dibujados, y probar presión y rechazo de palma con hardware real (hoy se verifican con eventos sintéticos).

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
