# ADR 0012 — Pizarra accesible con el teclado y presupuesto de tiempo por cuadro

**Fecha:** 2026-10-06 · **Estado:** aceptada (Fase 5 del Nivel 2)

**Contexto.** La pizarra es un `<canvas>`: sin trabajo explícito, los objetos no existen para el teclado ni para un lector de
pantalla. Además, al medir el rendimiento con 64 objetos en un celular simulado (CPU 4× más lenta) la simulación caía a 4 cuadros
por segundo.

**Decisión.**
1. **El lienzo es un control enfocable** (`role="application"`, `tabindex=0`) cuyo «cursor» es la selección: Tab y Mayús+Tab
   recorren los objetos en el orden de la escena (sin los trazos a mano) y, en los extremos, dejan salir el foco (no hay trampa).
   Lo demás reutiliza los atajos de la Fase 4 (flechas, «,» «.», Ctrl+D, Supr) y Enter lleva al panel, que ya es HTML accesible.
   No se duplicó la escena en un árbol DOM paralelo: sería una segunda fuente de verdad.
2. **Texto para lectores** (`ui/describir.ts`, puro y probado): un resumen de la escena (`aria-describedby`), un anuncio de lo
   seleccionado y el último evento de la simulación, en regiones vivas «polite» separadas (la lista de eventos entera no se relee).
3. **Presupuesto de 10 ms de simulación por cuadro** (`Simulacion.avanzar(dt, maxPasos, presupuestoMs)`): si se agota, se descarta el
   atraso y el panel muestra «más lenta que la realidad». Sin presupuesto (pruebas, exportaciones) el avance es exacto. El paso de
   1 ms no cambia: la física es la misma; solo cambia cuánto tiempo simulado se muestra por segundo real.
4. `prefers-reduced-motion`: sin transiciones ni animaciones CSS. La simulación nunca parte sola, así que no hace falta más.

**Consecuencias.** 60 fps con 64 objetos en movimiento incluso con la CPU 4× más lenta (prueba e2e `fase5.spec.ts`, que registra
mediana y p95). Un equipo muy lento ve la simulación en cámara lenta en vez de congelada. Pendiente: un lector de pantalla real
(NVDA/VoiceOver) no se probó de forma automática; las regiones vivas siguen el patrón estándar.
