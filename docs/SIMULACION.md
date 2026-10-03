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

Cada bloque o esfera es una **partícula** (con orientación fija: no gira). Actúan sobre ella:

| Qué | Cómo se obtiene de la escena |
|---|---|
| Peso | `m g` hacia abajo |
| Fuerza aplicada | un vector *aplicada* con origen en el cuerpo: constante, con el módulo y la dirección dibujados |
| Resorte | `k (largo − largo natural)` a lo largo del resorte; un extremo atado al cuerpo (a menos de 9 cm) y el otro a otro cuerpo o a un punto fijo |
| Cuerda | restricción de largo constante entre dos extremos (cuerpo–cuerpo o cuerpo–punto fijo); ideal: sin masa e inextensible |
| Cuerda con polea | dos cuerdas que terminan en la misma polea forman una sola de largo constante `|A − P₁| + |B − P₂|`, con P₁ y P₂ los puntos donde cada tramo toca la polea; un tramo dibujado vertical tira siempre en vertical |
| Superficie | contacto unilateral (`N ≥ 0`) con roce estático y cinético de Coulomb |

Simplificaciones deliberadas: las poleas son ideales (sin masa ni roce, y su radio no entra en la geometría), los cuerpos **no chocan entre sí** y los impactos contra una superficie son **perfectamente inelásticos**.

## El motor: RK4 con restricciones de Lagrange

Paso **fijo** de 1 ms, integrador **Runge–Kutta de 4.º orden** propio (transparente y verificable; ver [ADR 0007](decisiones/0007-motor-de-simulacion.md)).
En cada evaluación se resuelve el sistema lineal

```
M a = F + Jᵀ λ        J a = γ
```

donde las filas de J son las restricciones **activas**: contacto con una superficie (λ = N ≥ 0), adherencia (λ = fuerza de roce estático, con |f| ≤ μs N)
y cuerdas (λ = −T, T ≥ 0). El roce cinético (μk N, contrario al deslizamiento) se itera con N hasta converger. Después de cada paso se corrige la
deriva numérica proyectando posiciones y velocidades sobre las restricciones.

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

### Energía

`K = ½ m v²`, `U_g = m g y`, `U_e = ½ k x²`, `E_mec = K + U_g + U_e`. Se acumulan por separado el trabajo del **roce**, de las **fuerzas aplicadas** y de los **impactos / tirones**;
el panel muestra el balance `E − E₀ − W_no conservativo`, que debe ser ~0.

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

### Solución analítica en pantalla

El panel compara con la solución exacta cuando la escena es uno de estos casos y muestra la **diferencia máxima** mientras la solución es válida:

* **aceleración constante**: vuelo libre (con o sin fuerzas aplicadas) y deslizamiento con roce cinético sobre una superficie (vale hasta el primer cambio de régimen, por ejemplo la detención);
* **oscilador armónico**: un cuerpo unido a un resorte fijo que se mueve a lo largo de su eje (resorte vertical o sobre una superficie sin roce paralela al resorte).

Con cuerdas, varios resortes o roce en un resorte no hay solución analítica sencilla: la simulación sigue valiendo, pero no hay con qué compararla.

## Rendimiento y límites

* Costo medido: **97 µs por paso** con dos cuerpos, una cuerda con polea y roce (1 s simulado ≈ 97 ms). A 4× el motor usa ~40 % de un núcleo.
* El historial se limita a 20 000 muestras (si se pasa, se conserva una de cada dos y se duplica el período de muestreo). La simulación se detiene a los 10 minutos simulados.
* Un paso de 1 ms es suficiente para oscilaciones de decenas de rad/s; con resortes muy rígidos (`k` enorme) habría que bajarlo.
* Los cuerpos **no giran** ni chocan entre sí; los impactos son inelásticos; las poleas no tienen masa ni radio efectivo; el roce cinético supone que el cuerpo parte del reposo cuando "se suelta" de la adherencia.
* **Transmisión:** los estudiantes reciben los cuerpos, resortes, cuerdas y vectores (no la trayectoria) unas 20 veces por segundo. Es del orden de 60 KB/s por estudiante mientras corre (ver [PROTOCOLO_COMPARTIR.md](PROTOCOLO_COMPARTIR.md)): una clase con 60 estudiantes y 10 minutos de simulación gasta del orden de 2 GB de los 10 GB mensuales del plan gratuito de Firebase. Pausa o cierra la simulación cuando no se esté usando.
