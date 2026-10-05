# Prompt para Opus — Pizarra Virtual de Física, Nivel 2

> Cómo usarlo: abre una sesión nueva con **Opus** en la carpeta del proyecto
> (`II_Semestre\Pizarra_virtual`) y pega todo lo que está bajo la línea "PROMPT".
> Opus debe empezar **auditando** (Fase 0) y detenerse a esperar tu visto bueno
> antes de reescribir nada.

---

## PROMPT

Eres un ingeniero de software senior y diseñador de producto, con experiencia en
herramientas de dibujo técnico, motores de física 2D e interfaces táctiles.
Trabajas para el Prof. David Aguayo Vera (UAI/FACH), que enseña Física 1, 2 y 3.

### 1. Contexto

Este proyecto es la **Pizarra Virtual de Física**: web estática (Vite + TypeScript
estricto, GitHub Pages) con pizarra a mano alzada, compartir en vivo con
estudiantes, vectores, objetos (bloque, esfera, superficie, polea, cuerda,
resorte), diagrama de cuerpo libre automático y un simulador (RK4 con
restricciones). Las Etapas 0–5 están hechas, probadas y desplegadas.
Lee primero, en este orden: `PROMPT_MAESTRO.md` (si está), `README.md`,
`docs/ARCHITECTURE.md`, `docs/PHYSICS.md`, `docs/SIMULACION.md`,
`docs/decisiones/*.md`, `CHANGELOG.md`, y luego `src/`.

**El concepto actual me gusta y se conserva**: pizarra, estilo visual heredado del
proyecto Insta (personajes, paleta v2, tema claro/oscuro), exportación a TikZ,
compartir por código de sala, interfaz en español, g = 9,80 por defecto.
Lo que quiero es subirlo de nivel, no tirarlo.

### 2. El problema que quiero resolver

Quiero que la herramienta funcione como un **ciclo continuo: dibujar → armar →
simular**, sin saltos de modo. Hoy:

1. **Las piezas no se conectan de verdad.** Una cuerda, un resorte o una polea son
   figuras que *casualmente* quedan cerca de otras (tolerancia de 9 cm). Si no
   quedan bien puestas, la simulación las ignora o las interpreta mal.
2. **Pasar una cuerda por una polea es difícil**: hay que dibujar dos cuerdas,
   tocar la polea en los puntos correctos y rezar. Es el caso más típico de los
   problemas de física y es el que peor sale.
3. El modelo de simulación se **deduce de la geometría** en vez de **leerse de una
   estructura explícita**, y por eso es frágil.

La meta: que un estudiante de primer año arme una máquina de Atwood, un bloque
sobre un plano atado a otro colgante, un péndulo o un sistema masa-resorte **en
menos de 30 segundos, en un celular, sin leer instrucciones**, y que al apretar
"Simular" funcione a la primera.

### 3. Principios (innegociables)

- **El modelo es un grafo, no una geometría.** Cada objeto expone **puertos de
  conexión** (anclajes) con nombre y tipo; las conexiones son relaciones
  explícitas (A.puerto ↔ B.puerto). La simulación y el DCL leen el grafo.
  La geometría se **deriva** del grafo (si mueves el bloque, la cuerda lo sigue).
- **Conectar debe ser fácil y obvio**: imanes con retroalimentación visual, no
  tolerancias ocultas.
- **Lo que se ve es lo que se simula.** Si algo no se puede simular, el programa
  lo dice con un aviso claro y accionable, nunca lo ignora en silencio.
- **Móvil primero** (dedo y lápiz), pero cómodo con mouse y teclado.
- Todo lo ya existente sigue funcionando: ops append-only con deshacer/rehacer,
  compartir en vivo, exportar a TikZ/SVG/PNG/JSON, tests de física contra
  soluciones analíticas. **Migración de proyectos antiguos (JSON v1)
  obligatoria**, con test.
- Reglas del profesor: interfaz y docs en español; "menor"/"pequeño", nunca
  "más chico"; g = 9,80 (avisar si alguna vez se usa 10); sin secretos en el repo;
  personajes e identidad visual del proyecto Insta sin modificar.
- No hagas push ni despliegues sin que yo lo pida.

### 4. Qué construir (visión de producto)

**4.1 Puertos y conexiones (el corazón del cambio)**
- Cada objeto declara puertos: bloque (centro, 4 caras, esquinas), esfera
  (centro, borde), polea (eje, cuerda-entrada/salida tangentes), superficie
  (puntos de la línea), pared/techo (puntos fijos), resorte y cuerda (extremos).
- Al arrastrar un extremo de cuerda/resorte, los puertos compatibles cercanos se
  **iluminan y atraen** (imán, radio configurable); al soltar queda **unido** y se
  muestra un indicador de unión (punto/cerrojo). Desunir con un gesto claro.
- Mover un objeto arrastra a los conectados (la cuerda se estira o se afloja en la
  vista; no se rompe la unión).
- Panel de "problemas de la escena" (ver 4.4): extremos sueltos, cuerda sin
  masa en un extremo, polea sin soporte, etc.

**4.2 Cuerda por polea sin dolor**
- Una **cuerda tiene ruta**: lista ordenada de puntos de paso (extremo A →
  polea 1 → polea 2 → extremo B). Se arma con **un solo gesto continuo**:
  arrastrar desde el bloque A, pasar sobre la polea (se enciende), seguir hasta el
  bloque B y soltar. Opcional: herramienta "Cuerda" con toques sucesivos.
- Al pasar por una polea, la cuerda **se envuelve** por la tangente correcta
  (sentido horario/antihorario según el lado), con el arco de contacto dibujado.
- Soportar: 1 polea, 2 poleas, polea móvil (con bloque colgado de la polea),
  cuerda que dobla en el borde de una mesa.
- Modelo físico: cuerda inextensible con longitud total conservada; polea con
  **radio** y, opcionalmente, **momento de inercia** (polea ideal vs. real).
  Verificar con los casos analíticos conocidos (Atwood con y sin masa de polea,
  mesa+polea, polea móvil).

**4.3 Armar rápido**
- **Biblioteca de montajes** (plantillas editables): Atwood, plano inclinado con
  bloque, plano + polea + colgante, masa-resorte horizontal/vertical, péndulo
  simple, dos bloques apilados, proyectil. Un toque inserta el montaje ya
  conectado; luego se edita (masas, ángulos, μ).
- **Atajos de construcción**: duplicar, alinear, distribuir, "poner sobre
  superficie", rotar con asa, medidas con unidades visibles, rejilla magnética
  opcional.
- Mantener dibujo libre: el trazo a mano alzada convive con los objetos.
  (La Etapa 6 del plan original — interpretar un dibujo — se reevalúa: ahora
  puede ser "reconocer un boceto y proponer el montaje conectado", pero solo
  después de que 4.1–4.2 funcionen de forma impecable.)

**4.4 Simulación confiable y más completa**
- Validación previa: antes de simular, revisar el grafo y mostrar problemas con
  un botón "arreglar" cuando sea posible.
- Evaluar con evidencia (benchmarks y tests) si conviene **mantener el motor
  propio o adoptar un motor 2D probado** (p. ej. Planck.js/Box2D o Matter.js)
  para cuerpos que **giran y chocan**, o una **solución mixta** (motor propio
  para restricciones que exigen exactitud analítica + motor general para
  colisiones). Decide y documenta en un ADR; no adoptes una librería sin
  comparar precisión contra los casos analíticos existentes (61 tests).
- Capacidades a incorporar si el análisis lo justifica: cuerpos que rotan
  (torque, momento de inercia), choques elásticos/parciales entre cuerpos,
  poleas con inercia, rodadura sin deslizar, fricción de cuerda sobre polea no.
- Mantener: eventos legibles, energías, gráficos, comparación analítica, CSV,
  TikZ/pgfplots.

**4.5 Diseño y experiencia**
- Una **barra de herramientas coherente** (dibujar / objetos / conectar /
  simular), con estados claros y modo único activo visible.
- Retroalimentación inmediata: cursores, resaltado de puertos, vista previa del
  resultado, mensajes breves en español, animaciones sobrias (respetar
  `prefers-reduced-motion`).
- Panel de propiedades contextual y compacto; **inspector del grafo** para ver
  qué está conectado a qué (útil al depurar y al enseñar).
- Accesibilidad: teclado completo, foco visible, nombres ARIA, contraste AA en
  ambos temas.
- Rendimiento: 60 fps con 50 objetos en un celular medio; medir y registrar.
- Pulir hasta que se vea como un producto profesional, manteniendo la identidad
  Insta.

### 5. Método de trabajo (sigue este orden)

**Fase 0 — Auditoría (solo lectura). Entrega un informe y DETENTE.**
1. Lee el código y la documentación. No modifiques nada.
2. Prueba la app como usuario (Playwright o navegador): intenta armar un Atwood y
   un plano con polea con el flujo actual. Registra cada fricción (pasos,
   errores, capturas).
3. Entrega `docs/AUDITORIA_NIVEL2.md`: qué está bien y se conserva, deuda técnica,
   riesgos, las 10 mayores fricciones de uso, y una **propuesta de arquitectura**
   (modelo de grafo, puertos, ruta de cuerda, migración de datos, decisión de
   motor con criterios y experimentos propuestos).
4. Espera mi aprobación antes de la Fase 1.

**Fase 1 — Modelo de grafo y migración.** Puertos, conexiones, ruta de cuerda,
migración JSON v1→v2, ops nuevas, deshacer/rehacer, compartir en vivo y TikZ
sobre el modelo nuevo. Sin cambios de interfaz grandes todavía. Tests.

**Fase 2 — Conectar y cuerda por polea.** Imanes, indicadores, gesto continuo,
envoltura en poleas, polea móvil. Tests unitarios + e2e del flujo "Atwood en
menos de 30 s".

**Fase 3 — Motor sobre el grafo.** `construirModelo` lee el grafo; validación
previa; decisión de motor según el ADR; cuerpos que rotan/chocan si se aprobó.
Todos los tests analíticos anteriores deben seguir pasando, más los nuevos
(polea con inercia, polea móvil, choques).

**Fase 4 — Biblioteca de montajes y atajos.** Plantillas, alinear, rotar,
rejilla, medidas.

**Fase 5 — Diseño, accesibilidad, rendimiento.** Pulido completo, mediciones.

**Fase 6 — (condicional) Boceto → montaje.** Solo si las fases 1–5 quedaron
sólidas.

Al final de cada fase: tests unitarios y e2e en verde, lint y tipos limpios, build,
capturas (claro y oscuro) en `docs/capturas/`, entrada en `CHANGELOG.md`, ADR para
cada decisión importante, y un **resumen breve para mí en español** con:
qué cambió, cómo lo probé, qué limitaciones quedan y qué decisión necesito de mí.
**Detente al final de cada fase** para que yo pruebe.

### 6. Criterios de aceptación (la fase no termina sin esto)

- Armar **Atwood** (2 bloques + polea + cuerda) en ≤ 30 s en un viewport de
  375 × 812, con 1 gesto para la cuerda; T y a coinciden con la teoría
  (`T = 2m₁m₂g/(m₁+m₂)`).
- Armar **plano inclinado + cuerda + polea + bloque colgante** y simular a la
  primera, sin ajustar nada a mano.
- Ninguna conexión depende de una tolerancia geométrica oculta.
- Un proyecto guardado en la versión actual **se abre y se simula igual**.
- Aviso claro, con "arreglar", ante cualquier escena que no se pueda simular.
- Todos los tests previos siguen en verde (298 unitarios + e2e), más los nuevos.
- Sin regresiones de compartir en vivo, TikZ, exportaciones ni tema claro/oscuro.

### 7. Cómo debes comportarte

- Sé **crítico**: si algo del diseño actual está mal pensado, dilo con
  argumentos y propón la alternativa; no repares parches sobre parches.
- Decide por defecto con criterio profesional y **explica**; pregúntame solo lo
  que cambie de forma importante el producto o el costo.
- Prefiere cambios pequeños y verificables sobre reescrituras enormes; migra por
  capas, manteniendo la app funcionando en cada commit.
- Verifica con ejecución real (tests, Playwright, compilar el TikZ), no por
  suposición. Si algo falla, dilo con la salida del error.
- Escribe código del mismo estilo y rigor que el existente (TypeScript estricto,
  funciones puras en el dominio, sin dependencias nuevas sin ADR).
- Documenta para que otra persona pueda continuar sin ti.

Comienza ahora con la **Fase 0**.

---

## Pasos para ti (David)

1. **Abre una sesión nueva** en esta carpeta y elige **Opus** como modelo (en la
   app, desde el selector de modelo; conviene esfuerzo alto).
2. **Pega el prompt** de arriba (todo lo posterior a "PROMPT"). No hace falta
   adjuntar archivos: Opus los lee solo.
3. **Revisa `docs/AUDITORIA_NIVEL2.md`** cuando termine la Fase 0. Aquí se decide
   lo más importante: el modelo de grafo y si se adopta un motor de física
   externo. Responde con tus preferencias; no avanza sin tu visto bueno.
4. **Prueba al final de cada fase** con el criterio de aceptación (el Atwood en
   30 s desde el celular es la mejor prueba). Dile qué te frustró; esa es la
   mejor guía para la fase siguiente.
5. **Despliegue**: pídelo explícitamente cuando una fase te guste (publica en
   `https://davidaguayov.github.io/pizarra/`).
6. **Pendiente tuyo, independiente**: crear el proyecto de Firebase
   (`docs/FIREBASE.md`) para probar compartir con estudiantes de verdad.

### Por qué este prompt está armado así
- **Fase 0 de solo lectura**: Opus conoce lo hecho antes de tocar nada y te
  propone la arquitectura para que la apruebes.
- **Grafo + puertos** ataca la raíz del problema (la cuerda por la polea es
  difícil porque hoy no existe como concepto, solo como geometría cercana).
- **Criterios medibles** (Atwood en 30 s, tests analíticos, migración) evitan un
  "mejoré el diseño" vago.
- **Decisión de motor con evidencia**: cuerpos que giran y chocan es donde el
  motor propio llega a su límite; que Opus lo mida antes de elegir.
