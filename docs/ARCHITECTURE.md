# Arquitectura

## Módulos

```
src/
  core/        registro de ops, store, escena, cámara, tema          (Etapa 0)
  ink/         herramientas, entrada (Pointer Events), suavizado, dibujo (Etapa 1)
  share/       Transport, salas, QR                                   (Etapa 2)
  physics/     marco de referencia, vectores, objetos, fuerzas, DCL   (Etapas 3-4)
  sim/         integrador RK4, eventos, energía, trayectoria          (Etapa 5)
  recognize/   reconocimiento de formas y de escena                   (Etapa 6)
  export/      png, svg, json, tikz (Etapa 1); pdf (Etapa 7)
  ui/          barra de herramientas, paneles, modos proyector/espectador
tests/         unitarias (Vitest) y e2e (Playwright, tests/e2e)
assets/        activos versionados (personajes del proyecto Insta)
```

Las carpetas aún sin código tienen un `index.ts` vacío para fijar la estructura.

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
| JSON | El registro de ops completo con `schemaVersion` (1), incluido el historial de deshacer: abrirlo reconstruye la misma pizarra. Rechaza archivos ajenos o de versión futura con mensaje en español. |
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
