# ADR 0011 — Montajes, disponer elementos y medir

**Fecha:** 2026-10-06 · **Estado:** aceptada (Fase 4 del Nivel 2)

**Contexto.** Con el grafo (ADR 0008), los imanes (ADR 0009) y el motor de la Fase 3 (ADR 0010), armar una escena ya no
depende de tolerancias, pero los montajes de siempre (Atwood, plano con polea…) se siguen armando pieza a pieza. El encargo
de la Fase 4 pide una biblioteca de montajes y atajos: alinear, rotar, rejilla y medidas.

**Decisión.**
1. **Montajes como funciones puras** (`grafo/montajes.ts`): cada uno arma sus elementos alrededor del origen con ids nuevos y
   las relaciones del grafo explícitas (uniones a puertos con nombre, `ruta` por la polea con su sentido, `apoyo`, cuerpo del
   vector); después se trasladan al centro de la vista y se emiten en **una** op. No son archivos .json: así siguen el modelo
   actual (puertos, tamaños fijos, numeración m_k a continuación de la escena) sin migraciones, y cada uno tiene una prueba
   que exige **cero problemas** del validador y la física de la teoría (`tests/montajes.test.ts`).
2. **La geometría de un montaje se calcula, no se ajusta a ojo**: en *plano + polea + colgante*, la polea queda donde el tramo
   que sale del bloque (a la altura de su centro) es tangente a ella y paralelo al plano, y el colgante, bajo su lado de bajada.
3. **Disponer** (`grafo/disponer.ts`, puro): alinear y distribuir usan la **caja geométrica** (el borde que se ve, sin márgenes de
   etiquetas); girar mueve los bloques sobre sí mismos y los segmentos en torno al centro del conjunto; duplicar reasigna las
   referencias **entre lo copiado** y conserva las que van fuera (un bloque copiado sigue apoyado en el mismo piso).
4. **Rejilla** de 10 cm aplicada al soltar (y al crear), antes del imán de apoyo: los extremos unidos los decide su unión.
5. **Medir** es una vista previa, no un elemento: no ensucia la escena ni las exportaciones. Si hiciera falta una cota
   permanente, sería un elemento nuevo con su dibujo en pantalla, SVG y TikZ (no se hizo).
6. Teclas libres elegidas para no chocar con las herramientas: D (medir), G (rejilla), «,» «.» (girar; R ya es Rectángulo).

**Consecuencias.** Los montajes son la forma más rápida de llegar a una escena que simula; los gestos y la conexión toque a
toque siguen siendo la forma de armar algo distinto. Alinear no reacomoda apoyos: un cuerpo alineado lejos de su superficie
aparece como problema con su arreglo.
