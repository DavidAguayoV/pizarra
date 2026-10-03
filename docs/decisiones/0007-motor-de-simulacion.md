# ADR 0007 — Motor de simulación propio (RK4 + Lagrange); gráficos propios

**Fecha:** 2026-10-03 · **Estado:** aceptada

**Contexto.** La simulación debe ser transparente y exacta para enseñar (el prompt maestro pide un integrador RK4 de paso fijo y reservar un motor externo para colisiones complejas),
y debe dar tensiones, roce estático y cinético y cambios de régimen con eventos bien ubicados.

**Decisión.**
1. **Integrador RK4 de paso fijo propio** con restricciones resueltas por **multiplicadores de Lagrange** (`M a = F + Jᵀ λ`, `J a = γ`). Contacto, adherencia y cuerdas (con o sin polea) son filas de J; la
   condición de signo de cada multiplicador (`N ≥ 0`, `T ≥ 0`, `|f| ≤ μs N`) decide los cambios de régimen. Es un solo mecanismo para todos los montajes, en vez de una fórmula por montaje.
2. **Eventos exactos donde importa**: el impacto y el tensado de una cuerda se ubican por bisección sobre una interpolación de Hermite y la integración sigue desde ese instante; el resto de los eventos se resuelven al final del paso.
3. **Sin Matter.js ni Planck.js**: son aproximados y poco transparentes para fines docentes (restitución, iteraciones de solver, tolerancias), y no dan la tensión de una cuerda ideal con exactitud.
4. **Gráficos con un renderizador propio en canvas (~150 líneas)**, sin uPlot (que el prompt proponía): se evita una dependencia (~45 KB) para dibujar cuatro líneas con rejilla, y los mismos datos salen también como pgfplots para Beamer.
5. **La simulación es un sistema derivado, no parte del registro de ops**: se reconstruye desde la escena (las ops) y se descarta al editar. Lo que se transmite a los estudiantes son elementos animados corrientes por el canal en vivo existente.

**Alternativas.** Réplica determinista en cada celular (un mensaje de inicio en lugar de 60 KB/s por estudiante): ahorra ancho de banda y se aprovecha de que el paso es fijo, pero exige que el cálculo sea idéntico en todos los navegadores
y complica la pausa y las ediciones; queda como mejora posible. Cuerpos rígidos con rotación: fuera de alcance (los bloques no giran).

**Consecuencias.** Exactitud verificada con 61 pruebas contra soluciones analíticas (`docs/SIMULACION.md`). Las simplificaciones (partículas, poleas sin radio, sin choques entre cuerpos) están documentadas. El costo de red de transmitir la simulación es alto y se advierte en la documentación.
