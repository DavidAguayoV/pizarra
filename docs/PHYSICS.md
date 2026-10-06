# Física de la pizarra: diagrama de cuerpo libre

Código: `src/physics/dcl.ts` y `src/physics/objetos.ts`. Pruebas: `tests/dcl.test.ts` (38) y `tests/objetos.test.ts` (27).
Convención: **g = 9,80 m/s²** por defecto (editable en el panel); SI en todo; el eje y de los diagramas apunta hacia arriba.

## Objetos

| Objeto | Propiedades físicas |
|---|---|
| Bloque | masa (kg), ancho, alto, ángulo, etiqueta (`m_1`) |
| Esfera | masa, radio, etiqueta |
| Superficie | μ estático, μ cinético, relleno (achurado, cuña o ninguno); el lado sólido queda a la derecha de a → b |
| Polea | radio; ideal (sin masa ni roce) |
| Cuerda | ideal: sin masa e inextensible; un segmento recto |
| Resorte | k (N/m), largo natural (m); fuerza `k (largo − largo natural)` |

Desde el Nivel 2 las relaciones son **explícitas** ([ADR 0008](decisiones/0008-modelo-de-grafo.md)): cada cuerpo guarda la
superficie en que se apoya, cada extremo de cuerda o resorte guarda a qué está unido y cada fuerza aplicada, el cuerpo sobre el
que actúa. El DCL las **lee** del grafo (el mismo lector que usa la simulación), sin tolerancias. Mover un bloque **arrastra** su
cuerda y su resorte. Al soltar un cuerpo a menos de 30 cm de una superficie, se **apoya solo**: baja hasta tocarla, si es un
bloque se gira para quedar paralelo, y queda registrado su apoyo. (Hasta la Fase 2, las uniones de cuerdas y resortes se asignan
al soltarlos con las distancias de antes: 9 cm a un cuerpo.)

## Qué detecta

Para el cuerpo seleccionado:

1. **Peso** `m g`, siempre.
2. **Normal** y **roce** de la superficie en la que se apoya (la normal sale de la superficie hacia el cuerpo).
3. **Tensión** de cada cuerda unida al cuerpo, en la dirección del tramo que sale de él: hacia el otro extremo o, si pasa por
   una polea, hacia el punto de tangencia (valor: incógnita). Si el cuerpo lleva una **polea móvil**, la cuerda que la envuelve
   tira de él por sus dos tramos (dos tensiones T, sin subíndice: es la misma cuerda).
4. **Fuerza elástica** de cada resorte unido: tira hacia el otro extremo si está estirado y empuja si está comprimido.
5. **Fuerzas aplicadas**: vectores `aplicada` o `tension` que actúan sobre el cuerpo.

Los vectores de otros roles (velocidad, aceleración…), los fantasmas y los que no salen del cuerpo se ignoran.

## Ejes del diagrama

Con **una** superficie de contacto, x va a lo largo de ella e **y es la normal** que sale de la superficie (ejes siempre
dextrógiros: y = x + 90°). Sin superficie, x horizontal e y vertical. En un plano que sube hacia la derecha, x apunta plano arriba.

## Cómo se resuelven normal, roce y aceleración (una superficie, sin incógnitas)

Sea `Kx, Ky` la suma de las fuerzas conocidas (peso, elásticas, aplicadas) a lo largo de x e y:

* **Normal:** equilibrio perpendicular, `N = −Ky`. Si saliera negativa, el cuerpo se despega: `N = 0` y se avisa.
* **Roce** (modo *automático*):
  * si `|Kx| ≤ μs N`: **estático**, `f = |Kx|` en sentido contrario a `Kx`, `a = 0`;
  * si no: **cinético**, `f = μk N` en sentido contrario a `Kx` (se supone que parte del reposo), `a = (Kx − signo(Kx) μk N) / m`.
* Se puede forzar *estático* (avisa si el roce necesario supera `μs N`), *cinético* o *sin roce*.

### Verificado contra las fórmulas del curso (`tests/dcl.test.ts`)

| Caso | Resultado esperado | Comprobado |
|---|---|---|
| Plano inclinado θ sin roce | `a = −g sen θ` (x plano arriba), `N = m g cos θ` | sí |
| Plano inclinado con roce, `tan θ > μs` | `a = g (sen θ − μk cos θ)` hacia abajo, `f = μk m g cos θ` plano arriba | sí |
| Plano inclinado, `tan θ ≤ μs` | reposo, `f = m g sen θ` | sí |
| Barrido θ = 5°…70° × 4 pares (μs, μk) | reposo o deslizamiento según `tan θ` contra `μs`, `N = m g cos θ` | sí |
| Límite `tan θ = μs ± 0,003` | pasa de reposo a movimiento | sí |
| Piso con F = 30 N, μs = 0,5, μk = 0,3, m = 5 kg | `N = 49 N`, vence 24,5 N, `f = 14,7 N`, `a = 3,06 m/s²` | sí |
| Piso con F = 20 N (no vence el estático) | reposo, `f = 20 N` opuesta | sí |
| F oblicua hacia arriba | `N = m g − F sen φ` | sí |
| Sin superficie | `a = −g` | sí |
| Resorte | `k·x`, dirección según estirado o comprimido | sí |

Las coordenadas se guardan con 0,1 mm de resolución, así que el ángulo de una superficie dibujada tiene ~0,001° de error: por
eso las comparaciones usan tolerancia de 10⁻³.

### Lo que NO resuelve (se plantea, pero el valor queda como incógnita)

* **Tensiones** (la fuerza de una cuerda depende del movimiento de todo el sistema): en el diagrama y en ΣF = m a
  quedan con el símbolo `T`, sin valor. **La simulación sí las calcula** (Atwood, bloque en la mesa con masa colgante, péndulo):
  ver [SIMULACION.md](SIMULACION.md).
* **Más de una superficie de contacto** (bloque contra pared y piso): se dibujan las normales sin calcular su valor.
* Roce con velocidad inicial distinta de cero, rodadura, fuerzas de arrastre.

## Planteamiento ΣF = m a

Lo genera `planteamiento()`: una línea por eje con **símbolos** y, debajo, los valores numéricos que se pudieron calcular.

* Fuerzas alineadas con un eje: `±S`. El **peso en ejes inclinados**: `m g sen θ` y `m g cos θ` (con θ = inclinación de la superficie).
* Una fuerza oblicua cualquiera: `F cos(φ)` y `F sen(φ)` con φ medido desde el eje x del diagrama.
* El lado derecho es `0` si el cuerpo no acelera en ese eje (a lo largo de la superficie en reposo, o perpendicular a ella) y `m a` en caso contrario.

Ejemplo (plano de 26,6°, bloque de 3 kg, μs = 0,2, μk = 0,1):

```
Ejes: x a lo largo de la superficie, y perpendicular (θ = 26,6°)
ΣFx = −m g sen θ + fk = m a
ΣFy = −m g cos θ + N = 0
m g = 29,4 N;  N = 26,3 N;  fk = 2,63 N;  a = −3,51 m/s²
```
