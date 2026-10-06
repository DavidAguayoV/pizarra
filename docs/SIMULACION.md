# Simulación

Código: `src/sim/` (motor, modelo, solución analítica, series) y `src/ui/simulacion.ts` (panel). Pruebas: `tests/sim.test.ts` (37),
`tests/sim2.test.ts` (16), `tests/animacion.test.ts` (8) y `tests/e2e/simulacion.spec.ts` (10).
Convención: SI, **g = 9,80 m/s²** por defecto (editable en el panel), eje y hacia arriba, y = 0 como nivel de referencia de la energía potencial.

## Cómo se usa

1. Dibuja la escena con la herramienta **Cuerpos** (bloques, esferas, superficies, poleas, cuerdas, resortes) y, si hace falta, fuerzas con la herramienta **Vector** (rol *Fuerza aplicada*).
2. Selecciona un cuerpo para darle **velocidad inicial** (rapidez y dirección) y su masa.
3. **Simular** abre el panel: *Reproducir / Pausar*, *Paso* (0,05 s), *Reiniciar*, velocidad de 0,1× a 4×, y g.
4. Mientras corre se ve sobre la pizarra el movimiento, los vectores v y a (2 m/s o 2 m/s² por metro de flecha, como en los videos) y la trayectoria.
5. Gráficos de **posición, velocidad, aceleración y energía** (K, U_g, U_e, E_mec, trabajo del roce), tabla de valores, **comparación con la solución analítica** cuando existe, lista de eventos, y exportación a **CSV** (Excel en español: `;` y coma decimal) y a **TikZ/pgfplots**.

Cualquier cambio en la escena detiene la simulación y la devuelve a t = 0. Los estudiantes ven el movimiento en su celular por el mismo canal en vivo de la pizarra.

## El modelo

Cada bloque o esfera es una **partícula** con orientación fija, salvo que se marque **Gira**: entonces es un cuerpo rígido con
su ángulo (momento de inercia `m (a² + b²)/12` en un bloque, `2/5 m r²` en una esfera sólida). Actúan sobre ella:

| Qué | Cómo se obtiene de la escena |
|---|---|
| Peso | `m g` hacia abajo |
| Fuerza aplicada | un vector *aplicada* con origen en el cuerpo: constante, con el módulo y la dirección dibujados |
| Resorte | `k (largo − largo natural)` a lo largo del resorte, entre sus dos extremos unidos (cuerpo–cuerpo o cuerpo–punto fijo) |
| Cuerda | restricción de largo constante entre dos extremos (cuerpo–cuerpo o cuerpo–punto fijo); ideal: sin masa e inextensible |
| Cuerda que pasa por poleas | una sola cuerda con su **ruta**: el largo es el del camino tangente a las poleas más los arcos de contacto, y cada extremo tira en la dirección de su tramo tangente. Las poleas son fijas, sin masa ni roce. (Un proyecto v1 conserva los puntos de paso que tenía: `|A − P₁| + |B − P₂|`.) |
| Polea móvil | una polea **montada** sobre un cuerpo: su centro se mueve con él; el cuerpo siente la tensión de los dos tramos (gradiente del largo respecto del centro, `e_entra − e_sale`) |
| Borde de mesa | la cuerda dobla en el extremo de una superficie (un punto, sin roce) |
| Superficie | contacto unilateral (`N ≥ 0`) con roce estático y cinético de Coulomb; el cuerpo parte apoyado en la superficie de su `apoyo` |
| Polea con masa (Fase 3) | disco de masa M (`½ M r²`), fija: la cuerda no desliza sobre ella y cada lado tiene su tensión (T₁ ≠ T₂) |
| Otro cuerpo (Fase 3) | contacto entre cuerpos: normal `N ≥ 0` y roce con el **mayor** μ del par (μ «con cuerpos» de cada uno); el que se suelta sobre un bloque parte apoyado en él |
| Choque (Fase 3) | impulso con coeficiente de restitución `e` (panel de simulación; 0 = quedan juntos) |
| Superficie curva | arco de circunferencia (`barrido`); normal y tangente del punto bajo el cuerpo, γ centrípeto; [ADR 0013](decisiones/0013-superficies-curvas-y-cambio-de-superficie.md) |
| Cambio de superficie | el cuerpo apoyado que llega a otra pasa a ella (o queda en la esquina, con dos normales); al salir por un extremo sigue en la que toca |

Todas las relaciones se **leen del grafo** de la escena (`grafo/lector.ts`, [ADR 0008](decisiones/0008-modelo-de-grafo.md)): un
extremo **suelto** no ejerce fuerza, y lo que no se puede usar aparece en el panel como **problema de la escena**
(`grafo/validar.ts`) con el elemento al que se refiere. La cuerda parte **siempre tensa**: su largo es el geométrico en t = 0.

Simplificaciones deliberadas: una polea **móvil** con masa se trata como ideal (se avisa); un bloque que gira no se vuelca mientras
está apoyado; los choques son sin roce (instantáneos). Ver [ADR 0010](decisiones/0010-motor-coordenadas-generalizadas.md).

## El motor: RK4 con restricciones de Lagrange, en coordenadas generalizadas

Paso **fijo** de 1 ms, integrador **Runge–Kutta de 4.º orden** propio (transparente y verificable; ver [ADR 0007](decisiones/0007-motor-de-simulacion.md)
y [ADR 0010](decisiones/0010-motor-coordenadas-generalizadas.md)). Las coordenadas son (x, y, θ) por cuerpo y el ángulo de cada polea con masa.
En cada evaluación se resuelve el **sistema reducido**

```
(J M⁻¹ Jᵀ) λ = γ − J M⁻¹ Q        q̈ = M⁻¹ (Q + Jᵀ λ)
```

donde las filas de J son las restricciones **activas**: contacto con una superficie o con otro cuerpo (λ = N ≥ 0), adherencia (λ = fuerza de roce
estático, con |f| ≤ μs N; en una esfera que gira, es la **rodadura sin deslizar**), cuerdas (λ = −T, T ≥ 0; una fila por pieza si pasan por poleas
con masa) y el bloqueo del giro de un bloque apoyado. El roce cinético (μk N, contrario al deslizamiento del punto de contacto) se itera con N hasta
converger. Después de cada paso se corrige la deriva numérica proyectando posiciones y velocidades sobre las restricciones.

Esto da **tensiones reales** (Atwood, bloque en la mesa unido a una masa colgante, péndulo) sin hipótesis especiales para cada montaje.

### Eventos

Se detectan al final de cada paso; **el impacto y el momento en que una cuerda se tensa se ubican en su instante exacto** (bisección sobre una interpolación de Hermite,
que es exacta para aceleración constante) y la integración continúa desde ahí, de modo que la energía se contabiliza sin error de paso.

| Evento | Qué pasa |
|---|---|
| Impacto | un cuerpo en el aire llega a una superficie: pierde su velocidad normal y queda apoyado (la energía perdida se registra) |
| Despegue | la normal se haría negativa: el cuerpo deja la superficie |
| Sale por el extremo | el centro pasa del largo de la superficie: sigue como proyectil |
| Detención | un cuerpo que desliza se detiene; si el roce estático alcanza (|f| ≤ μs N), queda adherido |
| Estático → cinético | el roce estático ya no alcanza: empieza a deslizar |
| Cambia de sentido | se detiene y vuelve (solo se registra si hay roce) |
| Cuerda se afloja / se tensa | la tensión se haría negativa / la cuerda vuelve a su largo (el tirón disipa energía, que se registra) |
| Resorte en su largo natural | la elongación cambia de signo |
| Llega a la polea | un cuerpo alcanza la polea por la que pasa su cuerda: la simulación se **detiene** |
| Choque | dos cuerpos se tocan: impulso en el instante exacto (con `e`); si no rebotan, quedan en contacto («m₂ cae sobre m₁») |
| Rebote | con `e > 0`, contra otro cuerpo o contra una superficie |
| Se separan / cae por el borde | la normal entre dos cuerpos se haría negativa / el centro del de arriba sale de la cara del de abajo |
| Pasa a la otra superficie | del plano al piso, del piso a la rampa o al loop, de un tramo al siguiente; o queda en una esquina |

### Energía

`K = ½ m v² + ½ I ω²` (más `½ I ω²` de cada polea con masa), `U_g = m g y`, `U_e = ½ k x²`, `E_mec = K + U_g + U_e`. Se acumulan por separado el trabajo del **roce**, de las **fuerzas aplicadas** y de los **impactos / tirones**;
el panel muestra el balance `E − E₀ − W_no conservativo`, que debe ser ~0.

## Equivalencia con los proyectos de la versión 1

`tests/equivalencia-v1.test.ts` simula 25 escenas de referencia (`tests/escenasV1.ts`, incluidas las frágiles de la auditoría)
y compara posiciones, velocidades, aceleraciones, normales, roces, tensiones, eventos y el DCL con los resultados grabados con el
código de la Etapa 5: coinciden con error < 1e-7. Las únicas diferencias son **dos errores de la v1 corregidos a propósito**:

* un cuerpo apoyado que parte **alejándose** de la superficie (un proyectil lanzado desde el suelo) quedaba pegado a ella y deslizaba;
  ahora vuela;
* un cuerpo que **aterriza deslizando** sobre un piso sin roce quedaba clavado en el punto de impacto (se le aplicaba el roce estático
  aunque se moviera a lo largo de la superficie); ahora sigue deslizando;
* (Fase 3) en *bloques apilados* el bloque de arriba **atravesaba** al de abajo: los cuerpos no se tocaban. Ahora se apoya en él.
* en *esquina piso-pared* el bloque empujado contra la pared la **atravesaba**: un cuerpo apoyado no veía otras superficies. Ahora queda
  en la esquina, con la normal del piso y la de la pared (ADR 0013).

## Validación (contra soluciones analíticas)

| Caso | Resultado | Error |
|---|---|---|
| Caída libre | `y = y₀ − ½ g t²`; E_mec constante | < 1e-9 |
| Proyectil | tiempo de vuelo, altura máxima y alcance | tiempo < 1e-4 s |
| Plano inclinado con roce | `a = g (sen θ − μk cos θ)`; reposo si `tan θ ≤ μs` (barrido de 5 ángulos × 3 pares de μ) | < 1e-3 (coordenadas a 0,1 mm) |
| Plano: sube, se detiene y vuelve (o queda) | instante de la detención `t = v₀ / [g (sen θ + μk cos θ)]` y evento correcto | < 1e-2 s |
| Piso con F = 30 N, μs = 0,5, μk = 0,3, 5 kg | `a = 3,06 m/s²`; trabajo `(30 − 14,7) x` | < 1e-4 |
| Masa-resorte horizontal | período `2π√(m/k)`, `x(t) = x_eq + A cos ωt`, E_mec conservada | período < 1e-5 relativo; energía < 1e-6 |
| Resorte vertical con gravedad | oscila en torno a `m g / k` | < 1e-5 |
| Atwood | `a = (m₁ − m₂) g /(m₁ + m₂)`, `T = 2 m₁ m₂ g /(m₁ + m₂)`, E_mec conservada | < 1e-4 |
| Mesa con roce + masa colgante | `a = (m₂ − μk m₁) g /(m₁ + m₂)`, `T = m₂ (g − a)`, balance de energía | < 1e-4 |
| Péndulo | período `2π√(L/g)` (con corrección de amplitud), tensión ≥ 0, E_mec conservada | período < 2e-4 relativo |
| Péndulo lanzado desde abajo con `v² = 3 g L` | la cuerda se afloja, el cuerpo vuela y se tensa de nuevo; balance de energía | < 1e-6 |
| Mesa → suelo | sale por el borde a `v₀`, aterriza a `v₀ √(2h/g)` | < 1e-2 |
| Atwood **dibujado** (cuerda que envuelve la polea, Nivel 2) | `a = (m₁ − m₂) g /(m₁ + m₂)`, `T = 2 m₁ m₂ g /(m₁ + m₂)`, sin aceleración lateral aunque la cuerda termine en el centro de la polea | < 1e-6 |
| Polea móvil (Fase 2) | `a₂ = (2m₁ − m₂) g /(4m₁ + m₂)`, `a₁ = 2 a₂`, `T = m₁ (g − a₁)`; equilibrio con `m₂ = 2 m₁`; E_mec conservada | < 1e-5 |
| Mesa con roce + borde, sin polea (Fase 2) | `a = (m₂ − μk m₁) g /(m₁ + m₂)`, `T = m₂ (g − a)` | < 1e-5 |
| Plano 30° + polea en la arista + colgante (envoltura) | `a = (m₂ g − m₁ g sen θ − μk m₁ g cos θ)/(m₁ + m₂)`, `T = m₂ (g − a)` | < 5e-4 (coordenadas a 0,1 mm) |
| Esfera que rueda en un plano (Fase 3) | `a = 5/7 g sen θ`, `v = ω r`, `f = 2/7 m g sen θ`, E_mec conservada; si `μs < 2/7 tan θ` desliza girando: `a = g (sen θ − μk cos θ)`, `α = 5 μk g cos θ /(2r)` | < 1e-6 |
| Atwood con polea de masa M (Fase 3) | `a = (m₂ − m₁) g /(m₁ + m₂ + M/2)`, `T₁ = m₁ (g + a)`, `T₂ = m₂ (g − a)`; E_mec conservada aunque los tramos se balanceen | < 1e-6 |
| Bloque colgado de una esquina (Fase 3) | péndulo físico: E_mec conservada, la cuerda sigue en la esquina girada | < 1e-6 |
| Bloque sobre bloque, tirando del de abajo (Fase 3) | juntos `a = F /(m₁ + m₂)`, `f = m₂ a`; si no alcanza μs, `a₂ = μk g`, `a₁ = (F − μk m₂ g)/m₁` | < 1e-5 |
| Curvas | valle: T = 2π√((R − r)/g) desliza, 2π√(7(R − r)/(5g)) rueda; loop: con v₀² = 5gρ da la vuelta (N arriba = m(v²/ρ − g)), con 4gρ se despega a cos α = −2/3; loma: se despega a cos θ = 2/3 | < 1e-3 |
| Cambio de superficie | plano → piso sin atravesarlo, piso → rampa, tramos seguidos sin pérdida, rampa → meseta, esquina con N de la pared = F | < 1e-6 |
| Choques (Fase 3) | frontal elástico de masas iguales: intercambian velocidades; plástico: `v/2` y `ΔK` registrada; oblicuo elástico de esferas iguales: salen a 90°; pelota con `e = 0,8`: sube a `e² h` | < 1e-4 |

### Solución analítica en pantalla

El panel compara con la solución exacta cuando la escena es uno de estos casos y muestra la **diferencia máxima** mientras la solución es válida:

* **aceleración constante**: vuelo libre (con o sin fuerzas aplicadas) y deslizamiento con roce cinético sobre una superficie (vale hasta el primer cambio de régimen, por ejemplo la detención);
* **oscilador armónico**: un cuerpo unido a un resorte fijo que se mueve a lo largo de su eje (resorte vertical o sobre una superficie sin roce paralela al resorte).

Con cuerdas, varios resortes o roce en un resorte no hay solución analítica sencilla: la simulación sigue valiendo, pero no hay con qué compararla.

## Rendimiento y límites

* Costo medido (Fase 3, Node): 0,04–0,05 ms por paso con 2 cuerpos (20× el tiempo real), 0,15–0,44 ms con 20 (2–7×) y 0,6–1,9 ms con 50
  (0,5–1,7×). Detalle en el [ADR 0010](decisiones/0010-motor-coordenadas-generalizadas.md).
* El historial se limita a 20 000 muestras (si se pasa, se conserva una de cada dos y se duplica el período de muestreo). La simulación se detiene a los 10 minutos simulados.
* Un paso de 1 ms es suficiente para oscilaciones de decenas de rad/s; con resortes muy rígidos (`k` enorme) habría que bajarlo.
* Una polea móvil con masa se trata como ideal; un bloque que gira no se vuelca apoyado; los choques no tienen roce; una pila de muchos
  bloques (decenas) baja del tiempo real porque el sistema es denso.
* **Transmisión:** los estudiantes reciben los cuerpos, resortes, cuerdas y vectores (no la trayectoria) unas 20 veces por segundo. Es del orden de 60 KB/s por estudiante mientras corre (ver [PROTOCOLO_COMPARTIR.md](PROTOCOLO_COMPARTIR.md)): una clase con 60 estudiantes y 10 minutos de simulación gasta del orden de 2 GB de los 10 GB mensuales del plan gratuito de Firebase. Pausa o cierra la simulación cuando no se esté usando.
