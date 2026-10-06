# ADR 0013 — Superficies curvas, loops y cambio de superficie

**Fecha:** 2026-10-06 · **Estado:** aceptada (pedida por David: «los bloques no son capaces de pasar de un plano inclinado a
una superficie lisa. También sería bueno generar loops y superficies curvas»)

**Contexto.** Un cuerpo apoyado solo veía su superficie: al llegar al pie de un plano, el bloque inclinado ya tenía la
esquina bajo el piso (su centro a 0,17 m del piso y su apoyo de 0,30 m) y la detección de impactos, que exige venir de
afuera, nunca se activaba: **atravesaba el piso**. Por la misma razón, un bloque empujado contra una pared la atravesaba
(la escena *esquina piso-pared* de la v1). Y no había superficies curvas.

**Decisión.**
1. **Cambio de superficie** (`sim/motor.ts`): un cuerpo apoyado que llega a otra superficie (yendo hacia ella) recibe en su
   instante exacto el impulso que anula solo la velocidad que la atravesaría. Si después se aleja de la que tenía (el pie de
   un plano, una rampa), **pasa** a la nueva; si las fuerzas lo aprietan contra las dos (un bloque empujado contra la pared)
   queda en la **esquina**, con una segunda normal (sin roce) `Nx`. Si las dos normales casi coinciden (una curva que nace
   tangente al piso) no es esquina: pasa. Al salir por el extremo de una superficie —en su instante exacto— sigue en la
   que ya toca (dos tramos de piso, la cima de una rampa con una meseta: ahí da un pequeño salto si se aleja).
2. Un **bloque que no gira se alinea** con la superficie a la que llega (como partícula, su orientación solo se ve); en una
   curva, se dibuja tangente en cada punto. Uno que gira gira con la curva.
3. **Curvas = arcos de circunferencia** (`physics/curvas.ts`, `Superficie.barrido`): de `a` a `b` barriendo un ángulo con
   signo (positivo, antihorario: un valle si va de izquierda a derecha; negativo, una loma). El lado sólido sigue siendo el de
   la derecha de a → b. Un **marco local** (u a lo largo, d con signo, n y t del punto más cercano) reemplaza a la normal y la
   tangente constantes en todo el motor; en una recta da exactamente los mismos números (la equivalencia con la v1 no cambia).
4. En una curva la fila normal tiene γ = lado·σ·v_t²/L (la aceleración centrípeta del centro) y las de adherencia/rodadura y
   el giro de un bloque, γ numérico. La **normal sale de la dinámica**: en la cima de un loop es m(v²/ρ − g) y, si se haría
   negativa, el cuerpo se despega (loma: a cos θ = 2/3).
5. **Pista de un solo lado** (`Superficie.unLado`): solo apoya del lado de su normal. Un loop en 2D se cruza consigo mismo; en
   la realidad su salida está corrida de costado. Con esta opción, quien llega por fuera lo atraviesa. El montaje *Loop* la usa.
6. Al volver al instante de un evento, la velocidad se toma de la **derivada de la cúbica de Hermite** (antes, promedio lineal):
   exacta con aceleración constante y, en una curva cerrada, no acorta la rapidez (que perdía ~1e-4 J por evento).
7. Una esfera que gira y desliza pasa a **rodar sin deslizar** cuando su deslizamiento llegaría a cero en el paso siguiente: con
   el roce que cambia de signo dentro del paso, el deslizamiento podía quedar oscilando cerca de cero y desordenar el balance.
   El deslizamiento que queda (menos de un paso) se contabiliza como trabajo del roce.
8. Editor: herramienta **Curva** (J; arrastrando, un cuarto de circunferencia; con un toque, un valle de 3 m), campo
   «Curvatura (°)» y asa en el medio para curvarla, «Solo por un lado (pista)», montajes *Loop*, *Valle* y *Loma*. Dibujo,
   SVG, TikZ (poligonal fina), imanes, puertos `u:`, apoyar, DCL (normal del punto bajo el cuerpo) y validador entienden curvas.

**Validación** (`tests/superficies.test.ts`, `tests/montajes.test.ts`): valle con período 2π√((R − r)/g) desliza y
2π√(7(R − r)/(5g)) rueda; loop con v₀² = 5 g ρ (+2 %) da la vuelta con N arriba = m(v²/ρ − g), y con 4 g ρ se despega a
cos α = −2/3; loma, despegue a cos θ = 2/3; plano → piso, piso → rampa, tramos seguidos sin pérdida, rampa → meseta, esquina
con N de la pared = F; energía conservada (o contabilizada en impactos/roce) a ~1e-7 J.

**Consecuencias.** *esquina piso-pared* pasa a ser una diferencia intencional con la v1 (ya no atraviesa la pared). La segunda
normal de una esquina no tiene roce. Un loop sin roce se recorre una y otra vez (la pista es cerrada). Las curvas son arcos de
circunferencia (no curvas libres).
