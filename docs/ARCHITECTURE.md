# Arquitectura

## Módulos

```
src/
  core/        registro de ops, store, escena, cámara, tema          (Etapa 0)
  ink/         trazos libres, herramientas, suavizado, borrador       (Etapa 1)
  share/       Transport, salas, QR                                   (Etapa 2)
  physics/     marco de referencia, vectores, objetos, fuerzas, DCL   (Etapas 3-4)
  sim/         integrador RK4, eventos, energía, trayectoria          (Etapa 5)
  recognize/   reconocimiento de formas y de escena                   (Etapa 6)
  export/      png, svg, pdf, json, tikz                              (desde Etapa 1)
  ui/          barra de herramientas, paneles, modos proyector/espectador
tests/         unitarias (Vitest); e2e con Playwright desde la Etapa 1
```

Las carpetas aún sin código tienen un `index.ts` vacío para fijar la estructura.

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

Tokens de color como variables CSS en `src/styles.css`. `data-theme="claro|oscuro"` en `<html>`; sin valor guardado se usa `prefers-color-scheme`. Un script en `index.html` aplica el tema guardado antes de pintar. El canvas lee los tokens con `colorCss()`.

## Entrada

Pointer Events unificados (mouse, lápiz, dedo) con `touch-action: none` en el lienzo. Rechazo de palma y presión llegan en la Etapa 1.

## Despliegue

GitHub Actions: lint, tipos, pruebas, build y despliegue a Pages con `base: '/pizarra/'`. No hay servidor propio ni secretos en el repositorio.
