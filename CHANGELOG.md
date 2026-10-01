# Cambios

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
