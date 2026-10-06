# Arquitectura

## Módulos

```
src/
  core/        registro de ops, store, escena, cámara, tema          (Etapa 0)
  ink/         herramientas, entrada (Pointer Events), suavizado, dibujo (Etapa 1)
  share/       transportes, difusor, sincronizador, salas             (Etapa 2)
  grafo/       puertos, uniones, ruta de cuerdas, escena resuelta, lector único,
               integridad, migración v1, problemas de la escena          (Nivel 2)
  physics/     vectores, ejes, edición (Etapa 3); objetos y DCL (Etapa 4)
  sim/         motor RK4 con restricciones, eventos, energía, series  (Etapa 5)
  recognize/   reconocimiento de formas y de escena                   (Etapa 6)
  export/      png, svg, json, tikz (Etapa 1); pdf (Etapa 7)
  ui/          barra de herramientas, paneles, modos proyector/espectador
tests/         unitarias (Vitest) y e2e (Playwright, tests/e2e)
assets/        activos versionados (personajes del proyecto Insta)
```

Las carpetas aún sin código tienen un `index.ts` vacío para fijar la estructura.

## Grafo de la escena (Nivel 2)

Las relaciones entre objetos se **guardan**, no se deducen: decisión en el [ADR 0008](decisiones/0008-modelo-de-grafo.md),
contexto en la [auditoría](AUDITORIA_NIVEL2.md).

```
elementos (ops)  ──completarV1──▶  completos  ──resolverEscena──▶  escena resuelta  ──▶ lienzo, exportaciones, animación
                                                     │
                                                     └──leerGrafo──▶  simulación (sim/modelo), DCL (physics/dcl), validar
```

- `grafo/puertos.ts`: puertos con nombre en coordenadas locales (`cara-sup`, `esq-id`, `eje`, `borde:90`, `u:0.5`, `local:x,y`).
- `grafo/ruta.ts`: camino de una cuerda que pasa por poleas (tangentes y arcos de contacto). Lógica pura.
- `grafo/resolver.ts`: **escena resuelta** (memorizada por lista): los extremos unidos toman la posición de su puerto y las
  cuerdas con ruta calculan su `camino` (derivado: `sinDerivados` lo quita antes de guardar). `dependientes` da lo que hay que
  redibujar mientras se arrastra un cuerpo.
- `grafo/lector.ts`: **lector único** del grafo. No hay tolerancias en la lectura.
- `grafo/integridad.ts`: `prepararLote` completa cada edición (borrar suelta lo unido, mover una superficie arrastra a sus cuerpos,
  mover un extremo lo vuelve a unir). Toda edición de la app pasa por aquí: las consecuencias viajan en la misma op.
- `grafo/v1.ts` (congelado) y `grafo/migracion.ts`: reglas de cercanía de la v1 para completar escenas antiguas; al abrir un
  archivo v1 se agrega una op `escena/migracion` que no se deshace (`TIPOS_NO_DESHACIBLES` en `core/ops.ts`).
- `grafo/conectar.ts`: imanes (radio fijo en pantalla), regiones de paso para el gesto de la cuerda, alineación de lo que cuelga,
  montaje de poleas móviles, numeración de cuerpos y las marcas de uniones y conexión. Decisión: [ADR 0009](decisiones/0009-modos-e-imanes.md).
- `grafo/validar.ts` y `grafo/arreglos.ts`: problemas de la escena (con el elemento al que se refieren) y sus arreglos automáticos.
- `ui/modos.ts` (barra por modos), `ui/problemas.ts` (menú de problemas con *Arreglar*).
- Prueba de que nada cambió para los proyectos guardados: `tests/equivalencia-v1.test.ts` contra `tests/golden/v1-referencia.json`
  (grabado con el código de la Etapa 5).

## Compartir en vivo (Etapa 2)

Un emisor (el profesor) y muchos receptores; lo que viaja es el mismo registro de ops. Detalle del protocolo,
estructura en la base, reconexión y consumo de datos en [PROTOCOLO_COMPARTIR.md](PROTOCOLO_COMPARTIR.md); alta del
servicio en [FIREBASE.md](FIREBASE.md); decisión en el [ADR 0004](decisiones/0004-compartir-en-vivo.md).

- `share/transport.ts`: interfaces `Transport`, `Emisor`, `Receptor`. Dos implementaciones: `FirebaseTransport` (producción) y `LocalTransport` (BroadcastChannel, solo para demostración entre pestañas).
- `share/difusor.ts` (profesor) y `share/sincronizador.ts` (estudiante) son lógica pura, sin red, y están probadas con una base en memoria (`share/bd.ts`).
- `ui/lienzo.ts`: cámara, caché de dibujo y elemento en construcción, compartidos por el modo profesor y el modo espectador.
- `ui/espectador.ts`: `?sala=CODIGO`; solo mira, "Seguir al profesor", "Copiar a mi pizarra".
- `ui/compartir.ts`: botón y panel con código grande y QR, pensado para proyectar.
- Sin configuración de Firebase (`src/share/firebaseBd.ts`) todo funciona en modo demostración local.

## Simulación (Etapa 5)

Un motor de partículas con restricciones (RK4 de paso fijo + multiplicadores de Lagrange) que corre sobre la escena. Detalle del modelo, los eventos, la validación y los límites en
[SIMULACION.md](SIMULACION.md); decisiones en el [ADR 0007](decisiones/0007-motor-de-simulacion.md).

- `sim/modelo.ts`: **lógica pura**. Construye el modelo dinámico (cuerpos, superficies, resortes, cuerdas con o sin poleas, fuerzas aplicadas) leyendo el grafo (`grafo/lector.ts`).
- `sim/motor.ts`: `Simulacion` (RK4, restricciones, roce estático y cinético, eventos, energías, historial). Sin DOM: se prueba en Node.
- `sim/analitico.ts`: soluciones exactas (aceleración constante y oscilador armónico) y la diferencia con la simulación.
- `sim/series.ts`: series para gráficos, tabla, CSV (Excel en español) y **pgfplots**.
- `sim/animacion.ts`: los elementos que se dibujan mientras corre (copias en la posición actual, vectores v y a, trayectoria). Son elementos corrientes: el lienzo y la transmisión en vivo los tratan como cualquier otro.
- `ui/simulacion.ts` y `ui/grafico.ts`: el panel (controles, eventos, energía, tabla) y el renderizador de gráficos.
- La simulación **no es parte del registro de ops**: se reconstruye desde la escena y vuelve a t = 0 con cualquier edición.

## Objetos y diagrama de cuerpo libre (Etapa 4)

Seis elementos nuevos: **bloque**, **esfera**, **superficie** (suelo, plano inclinado, pared; con μs y μk), **polea**, **cuerda** y
**resorte**. Son figuras geométricas con propiedades físicas; el modelo, las convenciones y las fórmulas verificadas están en
[PHYSICS.md](PHYSICS.md), y la decisión de inferir los contactos por cercanía en el [ADR 0006](decisiones/0006-dcl-por-cercania.md).

- `physics/objetos.ts`: constructores, geometría (achurado, cuña, zigzag del resorte) y `acomodarSobreSuperficie` (el imán).
- `physics/dcl.ts`: **lógica pura** sin DOM: `resolverDcl` (contactos, normal, roce estático o cinético, aceleración),
  `planteamiento` (ΣF = m a con símbolos y valores) y `construirDcl` (los elementos del diagrama).
- Herramienta **Cuerpos** (`C`) con paleta de objetos; asas nuevas: girar y redimensionar el bloque, radio de esferas y poleas, extremos de cuerdas, resortes y superficies.
- El panel de un bloque o esfera muestra **en vivo** las fuerzas detectadas y la aceleración, y el botón *Generar diagrama de cuerpo libre* dibuja, de una vez
  (una sola op `elemento/lote`, un solo deshacer), el cuerpo aislado, los ejes alineados con la superficie, las fuerzas a **escala común** y el planteamiento.
- Los vectores del diagrama llevan la etiqueta pasada su punta (`etiquetaEn: 'punta'`) para no montarse entre sí.

## Sistema de referencia y vectores (Etapa 3)

Dos elementos nuevos: **ejes** (sistema de referencia, rotable para planos inclinados) y **vector** (con rol físico,
etiqueta, unidad y escala). Todo en metros de pizarra; el valor físico de un vector es `largo × porMetro` (por ejemplo,
10 N por cada metro de flecha, ajustable). El color sale del rol (peso, normal, tensión, roce, aplicada, velocidad,
aceleración, momento, resultante), con la misma convención de los videos.

- `physics/vectores.ts`: geometría y física **puras** (módulo, ángulo respecto de unos ejes, descomposición,
  vector por valores, suma punta con cola, posiciones de etiquetas y arcos). Pruebas contra cálculo directo.
- `physics/edicion.ts`: asas de edición (vector: origen y punta; ejes: origen y puntas de x e y, que giran).
- `core/matematica.ts`: compositor de etiquetas (subíndices, `\vec`, griegas, fracciones…) con las **mismas
  medidas** en pantalla, PNG, SVG y celular; TikZ lleva el LaTeX original. Decisión en el [ADR 0005](decisiones/0005-etiquetas-matematicas.md).
- **Seleccionar** (herramienta `S`): clic, Mayús+clic para varios, arrastrar para mover, asas para editar, Supr para borrar.
  Editar es una op `elemento/lote` (`actualizar`, `agregar`, `borrar`): **un solo deshacer** revierte todo el cambio, y viaja por
  la red como cualquier otra op. Mientras se arrastra, el profesor transmite la vista previa (`LoteVivo.els`).
- `ui/propiedades.ts`: panel flotante con números exactos (módulo, ángulo, unidades por metro, sistema de referencia,
  mostrar valor / componentes / ángulo) y la **suma**: con dos o más vectores seleccionados dibuja copias punteadas punta
  con cola y la resultante desde el origen del primero. Los manejadores siempre parten del elemento vigente (no de una copia).
- Los vectores nuevos usan como sistema de referencia los **últimos ejes dibujados** (o la pizarra si no hay).

## Elementos de la pizarra (Etapa 1)

`core/elementos.ts` define los elementos de la escena: **trazo** (lápiz y resaltador), **línea**, **flecha**, **rectángulo**, **elipse**, **texto** e **imagen**. Todos en metros, con el grosor también en metros (la tinta escala con el zoom, como en una pizarra real). Son datos inmutables: cambiar uno es agregar y borrar ops.

- **Color por rol, no por hex** (`tinta`, `campo`, `contacto`, `disipacion`, `movimiento`, `acento`, `neutro`): cada tema lo resuelve (`core/colores.ts`). La tinta normal es negra en el tema claro y blanca en el oscuro; las exportaciones usan siempre la paleta clara.
- `escena.ts`: dos ops, `elemento/agregar` y `elemento/borrar`. El borrador borra objetos completos (una sola op por pasada, así un deshacer la revierte).
- **Un elemento = una op**: el trazo completo se agrega al soltar; mientras se dibuja es solo una vista previa local (en la Etapa 2 se transmitirá por lotes).

## Entrada (`ink/entrada.ts`)

Pointer Events unificados. Un puntero dibuja; **dos dedos** hacen pan y zoom y cancelan el trazo empezado; rueda = zoom; botón central, barra espaciadora o la herramienta *Mover vista* desplazan. **Presión** del lápiz (grosor x0,4 a x1,6 según la presión; el mouse registra 0,5 = grosor neutro). **Rechazo de palma** (`ink/rechazoPalma.ts`): con un lápiz cerca (apoyado o flotando, 800 ms) los toques se ignoran; si el lápiz aparece mientras un dedo dibujaba, ese trazo se cancela. El botón borrador del lápiz borra mientras se mantiene apretado. Mayús fuerza ángulos de 45° y cuadrados/círculos. `Anfitrion` es la interfaz que la entrada necesita de la app, así que se puede probar sin DOM.

## Rendimiento

Los elementos confirmados se pintan en un lienzo de caché que solo se rehace al cambiar escena, cámara, tema o tamaño, con recorte por vista (cada elemento guarda su caja una vez). Mientras se traza, cada cuadro copia el caché y dibuja encima solo el elemento en construcción. Prueba e2e: 3000 trazos de 40 puntos con zoom continuo, 16,7 ms por cuadro (60 fps).

## Exportación (`src/export`)

| Formato | Notas |
|---|---|
| PNG | Resolución 1x/2x/4x (100 px por metro por el factor, con tope de 8192 px), fondo blanco o transparente. Mismo código de dibujo que la pantalla. |
| SVG | Autocontenido, vectorial. Grosor medio por trazo. |
| JSON | El registro de ops completo con `schemaVersion` (2 desde el Nivel 2), incluido el historial de deshacer: abrirlo reconstruye la misma pizarra. Un archivo v1 se migra al abrirlo. Rechaza archivos ajenos o de versión futura con mensaje en español. |
| TikZ | Fragmento o documento `standalone`. Ver [TIKZ.md](TIKZ.md). |

## Registro de ops

Todo cambio es una `Op { id, t, autor, tipo, payload }` agregada a un registro **append-only**. El estado es el resultado de reducir las ops *activas* con los reductores registrados por tipo.

- **Deshacer / rehacer son ops** (`core/deshacer`, `core/rehacer`) con `payload.objetivo = id de la op afectada`. El registro nunca se edita.
- `opsActivas(registro)` = ops normales que no están deshechas. `pilaRehacer(registro)` se **deriva** del registro (deshacer apila, rehacer desapila, una op normal nueva la vacía). Así un espectador que reproduce las mismas ops obtiene el mismo estado y la misma pila.
- Tipos de op desconocidos se ignoran (compatibilidad hacia adelante entre versiones).
- El mismo registro servirá para guardar (JSON con `schemaVersion`), transmitir (`Transport`) y reproducir.
- Etapa 0 recalcula el estado completo en cada cambio. Con miles de trazos se añadirán instantáneas (snapshots) detrás de la misma interfaz `Store`.

## Coordenadas

La escena vive en **metros**, con el eje y hacia arriba. `Camara { cx, cy, escala }` (px/m) convierte a pantalla (y hacia abajo). El zoom y el pan solo cambian la cámara, no los datos. Funciones puras en `core/camara.ts`.

## Elementos de escena (desde la Etapa 1)

Cada elemento implementará `render()`, `toSVG()` y `toTikz()`. Ninguna etapa se da por terminada si sus elementos no exportan a TikZ.

## Temas

`src/ui/tokens.ts` es la fuente de verdad de la paleta (heredada del proyecto Insta, ver [ESTILO_INSTA.md](ESTILO_INSTA.md)); `npm run tokens` genera `src/ui/tokens.css` y una prueba verifica que no se desvíen y que cada rol de color alcance contraste AA en ambos temas. `styles.css` solo les da nombres cortos (`--fondo`, `--texto`...). `data-theme="claro|oscuro"` en `<html>`; sin valor guardado se usa `prefers-color-scheme`. Un script en `index.html` aplica el tema guardado antes de pintar. El canvas lee los tokens con `colorCss()`.

## Entrada

Pointer Events unificados (mouse, lápiz, dedo) con `touch-action: none` en el lienzo. Rechazo de palma y presión llegan en la Etapa 1.

## Despliegue

GitHub Actions: lint, tipos, pruebas, build, e2e (Playwright) y despliegue a Pages con `base: '/pizarra/'`. No hay servidor propio ni secretos en el repositorio.
