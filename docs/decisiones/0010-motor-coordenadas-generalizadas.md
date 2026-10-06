# ADR 0010 — Motor en coordenadas generalizadas: giro, poleas con masa y choques

**Fecha:** 2026-10-06 · **Estado:** aceptada (Fase 3 del Nivel 2; David eligió «extiende el motor; Planck.js solo como comparación»)

**Contexto.** El motor de la Etapa 5 ([ADR 0007](0007-motor-de-simulacion.md)) trata cada cuerpo como una partícula (x, y) y
resuelve las restricciones con el sistema aumentado denso `[M −Jᵀ; J 0]`, de tamaño 2n + filas. La Fase 3 pedía cuerpos que
giran (esferas que ruedan, bloques que se balancean), poleas con masa (T₁ ≠ T₂) y choques entre cuerpos. Con el sistema
aumentado, 20 cuerpos no alcanzaban el tiempo real y 50 iban 15 veces más lentos.

**Decisión.**
1. **Coordenadas generalizadas**: cada cuerpo tiene (x, y, θ) y cada polea con masa, su ángulo. Un cuerpo **gira** solo si se
   marca *Gira* (momento de inercia `m (a² + b²)/12` en un bloque, `2/5 m r²` en una esfera); si no, su `1/I` es 0 y se mueve
   como antes. Así, los proyectos v1 se simulan **igual** (la equivalencia sigue < 1e-7) y la física que no se pidió no cambia.
2. **Sistema reducido** `(J M⁻¹ Jᵀ) λ = γ − J M⁻¹ Q`: su tamaño es el número de restricciones activas, no el de coordenadas. Se
   resuelve por eliminación gaussiana con pivoteo; una restricción redundante (pivote nulo) se descarta.
3. **Rodadura** = la adherencia en el punto de contacto (brazo `−n r`): la misma fila que el roce estático, con la entrada de θ.
   Si |f| > μs N, la esfera desliza girando y el roce cinético hace torque. Un bloque que gira, apoyado, no se vuelca (su giro
   queda bloqueado); en el aire gira libremente y, al caer, queda sobre una cara.
4. **Poleas con masa** (disco, `½ M r²`, solo fijas): parten la cuerda en **piezas**. Cada pieza mide sus tramos rectos más el arco
   hasta una **referencia fija en la polea** (el punto medio del contacto inicial), y su restricción es
   `L_k − r s φ_A + r s φ_B = L_k(0)`. Medir hasta el punto de contacto, en vez de hasta la referencia, perdía energía cuando el
   tramo se balanceaba: el contacto se corre por la polea y ese arco también es cuerda. Cada pieza tiene su tensión.
5. **Contacto entre cuerpos** (`sim/contactos.ts`): un par (i, j) con una característica (una cara de un bloque o la línea de
   centros de dos esferas). Se detecta con **ejes separadores** (las caras de los dos bloques) y la esquina más cercana para una
   esfera. En contacto persistente aporta una fila normal (N ≥ 0) y, si está adherido, una tangencial; el roce entre dos cuerpos
   usa el μ **mayor del par**. Se pierde al separarse (N < 0) o cuando el centro de i sale de la cara de j.
6. **Choques por impulso** en el instante exacto (bisección sobre Hermite, como el impacto contra una superficie): la velocidad
   normal relativa pasa a `−e vₙ` en **un solo sistema** con todas las demás restricciones activas (una cuerda tensa o un apoyo
   reciben su parte del impulso). El impulso es sin roce: lo que estaba adherido y queda moviéndose pasa a deslizar. Si el rebote
   fuera menor a 5 cm/s, los cuerpos quedan en contacto (sin botes infinitos). `e` es un ajuste del panel (0 por defecto, como la
   v1).
7. **Proyección** de la deriva con el mismo camino de menor energía para todas las filas (`M⁻¹ Jᵀ`), cuerdas por pieza incluidas.

**Comparación con Planck.js** (E4; script en el scratchpad de la sesión, no es una dependencia):

| Caso | Planck, 1/60 s | Planck, 1 ms | Este motor, 1 ms |
|---|---|---|---|
| Bloque en plano 30°, μk = 0,3 | exacto | exacto | < 1e-6 (test) |
| Disco que rueda (2/3 g sen θ; aquí esfera, 5/7) | 0,7 % de error | 0,7 % | < 1e-6 |
| Atwood ideal | exacto | exacto | < 1e-6 |
| Péndulo de 1 m, 10 s: ΔE/(m g L) | −0,53 | −0,062 | −3,5e-12 (−2,6e-6 con 1/60 s) |
| Choque elástico frontal, masas iguales | intercambian | intercambian | intercambian (< 1e-9) |

Planck es más rápido y resuelve pilas y choques múltiples con robustez, pero pierde energía en lo que más importa en un curso
(un péndulo o una cuerda que gira) y no da tensiones ni normales exactas: su solucionador es iterativo y corrige posiciones. Se
mantiene el motor propio.

**Rendimiento** (Node, un núcleo; ms por paso de 1 ms simulado; «×» = veces el tiempo real):

| Escena | 2 cuerpos | 5 | 10 | 20 | 50 |
|---|---|---|---|---|---|
| Bloques con resortes sobre un piso | 0,04 ms (27×) | 0,04 (24×) | 0,07 (15×) | 0,15 (6,7×) | 0,77 (1,3×) |
| Péndulos independientes | 0,05 (21×) | 0,07 (15×) | 0,12 (8,5×) | 0,20 (5,0×) | 0,60 (1,7×) |
| Torre de bloques apilados | 0,05 (19×) | 0,10 (10×) | 0,22 (4,5×) | 0,44 (2,3×) | 1,9 (0,5×) |

Antes, 20 cuerpos no llegaban al tiempo real; ahora van entre 2 y 7 veces más rápido. Una torre de 50 bloques (100 filas
densas) sigue siendo lenta: si alguna vez hace falta, el paso siguiente es aprovechar que J es rala (por bloques).

**Consecuencias.** La física nueva se activa solo cuando se pide (*Gira*, masa de la polea, `e`) o cuando dos cuerpos se
tocan; la escena *bloques apilados* de la v1 pasa a ser una diferencia intencional (el de arriba ya no atraviesa al de
abajo). Una polea **móvil** con masa todavía se trata como ideal (se avisa). Un bloque que gira no se vuelca mientras está
apoyado (no hay contacto por una arista).
