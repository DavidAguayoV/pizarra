# ADR 0009 — Barra por modos, piezas de tamaño fijo, imanes y cuerda en un gesto

**Fecha:** 2026-10-05 · **Estado:** aceptada (Fase 2 del Nivel 2; pedida por David tras probar la Fase 1)

**Contexto.** En la auditoría, en un celular de 375 × 812 la barra ocupaba 541 px y la paleta tapaba el resto: no se podía
armar nada. En la Fase 1 las uniones se asignaban con las distancias ocultas de la v1 (9 cm). David pidió además piezas de
tamaño fijo («la polea es raro que se pueda cambiar tanto de tamaño») y que una masa que cuelga de una polea **caiga
vertical**, o que al menos se avise («si las cuerdas no están verticales, esto empieza a oscilar»).

**Decisión.**
1. **Modos** (`ui/modos.ts`): Dibujar, Armar y Conectar muestran solo sus herramientas; Simular abre el panel. En el celular la barra
   va **abajo** (dos filas: tira de herramientas que se desplaza y modos) y lo poco usado pasa al menú **Más**. El lienzo queda en el
   87 % de la pantalla (antes, 33 %). La paleta flotante de cuerpos desaparece.
2. **Piezas de tamaño fijo**: bloque (0,5 × 0,4 m), esfera y polea (radio 0,25 m) se colocan con un toque; arrastrar las mueve; el
   tamaño se edita en su panel. La polea pierde su asa de radio. Los cuerpos nuevos se numeran (m₁ = 2 kg, m₂ = 3 kg…) para que dos
   bloques recién puestos ya formen un Atwood que se mueve.
3. **Imanes con radio en pantalla** (`grafo/conectar.ts`, 24 px; 12 px para superficies): puertos con nombre de los cuerpos, eje de
   la polea y puntos de una superficie. Mientras se conecta se marcan los puertos cercanos y el imán que se usará. Reemplazan a las
   tolerancias de 9 cm de la Fase 1.
4. **Cuerda en un solo gesto**: pasar el puntero sobre una polea (o el extremo de una superficie) agrega ese paso a la ruta, con el
   sentido según el lado por donde se pasó (`sentidoNatural`). Dibujar dos piezas que terminan en la misma polea sigue funcionando.
5. **Alinear lo que cuelga**: al unir, un cuerpo que cuelga de una polea con su tramo inclinado hasta 25° se corre para que el tramo
   quede vertical. Más inclinado se considera intencional (un péndulo) y se avisa como **problema** con arreglo.
6. **Problemas con arreglo** (`grafo/validar.ts`, `grafo/arreglos.ts`, `ui/problemas.ts`): aviso en la barra con la cantidad y un
   botón por problema (alinear bajo la polea, mover la polea hasta que el tramo sea paralelo al plano, separar cuerpos, fijar un
   extremo, quitar un apoyo lejano). Cada arreglo es una op: un deshacer lo revierte.
7. **Polea móvil** = polea `montaje` sobre un cuerpo (se suelta encima de él). **Borde de mesa** = paso por el extremo de una
   superficie. Las dos se simulan con el mismo mecanismo de restricciones (gradiente del largo respecto del centro de la polea).
8. **Tope**: si un cuerpo llega a la polea por la que pasa su cuerda, la simulación se detiene con un evento (todavía no hay choques).

**Alternativas.** Barra lateral (descartada: en el celular quita ancho, que es lo escaso en vertical); imanes en metros (descartados:
con el zoom del celular 9 cm son 4 px); alinear siempre, sin límite (descartado: un péndulo dibujado a propósito dejaría de serlo).

**Consecuencias.** Un Atwood se arma en **8 acciones** en el celular, con un solo gesto para la cuerda, y simula con la T de la
teoría (`tests/e2e/conectar.spec.ts`). Los atajos de teclado de los objetos cambiaron (C = Cuerda; ver README). Las pruebas e2e usan un
ayudante que busca cada herramienta en su modo (`tests/e2e/ayudas.ts`).
