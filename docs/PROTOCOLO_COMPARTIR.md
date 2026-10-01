# Protocolo para compartir en vivo

Código: `src/share/`. Pruebas: `tests/compartir.test.ts` (lógica, con una base en memoria) y
`tests/e2e/compartir.spec.ts` (dos pestañas reales: profesor y celular).

## Modelo

Un **emisor** (el profesor) y muchos **receptores** (estudiantes). Solo el emisor escribe. Lo que viaja es el
mismo registro de ops que usa la pizarra (ver [ARCHITECTURE.md](ARCHITECTURE.md)): como el estado es una
función pura de las ops, reproducirlas en otro dispositivo da exactamente la misma pizarra, incluido
deshacer y rehacer.

```
Pizarra del profesor ──ops──▶ Difusor ──▶ Emisor ──▶ [ Transport ] ──▶ Receptor ──▶ Sincronizador ──▶ Pizarra del estudiante
```

| Pieza | Archivo | Responsabilidad |
|---|---|---|
| `Transport` | `transport.ts` | Interfaz intercambiable: `crearSala`, `unirse`. |
| `FirebaseTransport` | `firebaseTransport.ts` | Producción, sobre Realtime Database. |
| `LocalTransport` | `localTransport.ts` | Demostración sin cuenta (BroadcastChannel; solo pestañas del mismo navegador). |
| `BD` / `BdMemoria` | `bd.ts` | Adaptador mínimo de base de datos; la versión en memoria sirve de servidor en las pruebas. |
| `Difusor` | `difusor.ts` | Mira el registro del profesor y publica: ops, snapshots, trazo en vivo, encuadre. |
| `Sincronizador` | `sincronizador.ts` | Une snapshot + ops en el estudiante; tolera repetidas, huecos y cambios de época. |
| `ProductorVivo` / `ReconstructorVivo` | `vivo.ts` | Trazo en construcción por incrementos. |

## Mensajes

* **Snapshot** `{ epoca, seq, ops[] }`: el registro completo hasta la op `seq`.
* **Op** `{ epoca, seq, op }`: una op nueva. `seq` = posición en el registro (1, 2, 3…).
* **Lote vivo** `{ id, ocultos[], base?, desde?, pts? , el? }`: el elemento que se está dibujando.
  Un trazo envía **solo los puntos nuevos** (`pts` desde la posición `desde`); una forma, entera; el borrador,
  solo qué ids está tocando. Se agrupan cada **50 ms** como máximo.
* **Vista** `{ cx, cy, escala, ancho, alto }`: el encuadre del profesor, como máximo cada 120 ms y solo si cambió.

### Épocas

Cuando el registro del profesor se **reemplaza** (abrió otro proyecto) o deja de ser una extensión del que ya
se había publicado, empieza una **época nueva**: se publica un snapshot nuevo y los receptores lo toman completo.
Dentro de una época el registro solo crece.

### Snapshot periódico

Cada `SNAPSHOT_CADA` = 50 ops se publica un snapshot y se vacía la lista de ops ya incluidas: quien entra
tarde lee el snapshot y solo las ops posteriores, nunca el historial completo.

## Estructura en Realtime Database

```
rooms/{código}/meta      { owner, creado }
rooms/{código}/snapshot  { epoca, seq, datos }       datos = JSON del registro
rooms/{código}/ops/{seq} texto JSON de un OpMsg      clave = seq con 8 dígitos
rooms/{código}/vivo/{n}  texto JSON de un LoteVivo   se borra entero al terminar el trazo
rooms/{código}/vista     { cx, cy, escala, ancho, alto }
```

Lo que tiene estructura libre viaja como **texto JSON**: Realtime Database descarta arrays vacíos, convierte
claves numéricas en arrays y prohíbe `. $ # [ ] /` en las claves; como texto no hay nada de eso que cuidar.
Las escrituras salen en cola, en orden: un snapshot nunca adelanta a una op.

**Códigos de sala:** 5 caracteres de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin `0 O 1 I`): 33 millones de
combinaciones. La base no permite listar salas, así que hay que conocer el código.

## Qué hace el receptor

1. Lee el snapshot y se suscribe a las ops, al trazo en vivo y al encuadre.
2. Aplica las ops en orden de `seq`; ignora las repetidas.
3. Si detecta un **hueco** (llega la 12 y esperaba la 10) o una **época nueva** sin su snapshot, vuelve a pedir el estado completo.
4. Escucha solo el número de época del snapshot (no el snapshot entero) para ahorrar ancho de banda.

### Reconexión

El estado de conexión se muestra siempre (`Conectado`, `Sin conexión: reintentando…`, `La sala no existe o se cerró`).
Al volver la red el receptor pide el estado de nuevo; lo que ya tenía se ignora por `seq`. Si mientras tanto el
profesor pasó por un snapshot periódico (las ops intermedias ya no existen), el snapshot más nuevo de la misma
época se toma completo. Todo eso está cubierto por pruebas.

## Modo espectador

URL `…/pizarra/?sala=CODIGO`. Solo mira (no hay herramientas de dibujo):

* Un dedo desplaza, dos dedos hacen zoom (pellizco).
* **Seguir al profesor**: la vista acompaña su encuadre mostrando *toda* la región que él ve (en un celular
  vertical eso significa verla más pequeña; con un gesto se desacopla y se puede hacer zoom). El botón vuelve a acoplar.
* **Copiar a mi pizarra**: pasa lo que hay a una pizarra propia donde se puede dibujar sin afectar la clase.
* El trazo del profesor se ve mientras lo dibuja.

## Consumo de datos (estimación)

Un trazo típico de 40 puntos pesa ~0,7 KB como op; mientras se dibuja, los lotes pesan ~0,1 KB cada 50 ms.
Una clase con 400 trazos son ~300 KB de ops por estudiante, más el snapshot al entrar (hasta ~300 KB al final de la
clase). Con 60 estudiantes: del orden de 20–40 MB por clase, contra 10 GB mensuales del plan gratuito.
Las imágenes pesan más (hasta ~2 MB cada una al reducirse a 1600 px): una pizarra con muchas imágenes consume proporcionalmente más.

## Lo que no hace (todavía)

* No cuenta cuántos estudiantes hay conectados (requiere presencia).
* El estudiante no puede devolver nada a la clase: solo ve.
* Las imágenes grandes viajan completas dentro de la op.
* Las reglas de seguridad no se pueden probar sin el emulador de Firebase; se verifican con la lista de comprobación de [FIREBASE.md](FIREBASE.md).
