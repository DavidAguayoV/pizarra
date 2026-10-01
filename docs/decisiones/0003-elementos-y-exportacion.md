# ADR 0003 — Elementos en metros con color por rol; exportación desde los mismos datos

**Fecha:** 2026-10-01 · **Estado:** aceptada

**Contexto.** La pizarra debe verse bien en tema claro y oscuro, exportar a TikZ/SVG/PNG sin perder calidad
y servir de base a vectores y simulación (Etapas 3–5), que necesitan coordenadas reales.

**Decisión.**
1. Los elementos viven en **metros** y su grosor también; el zoom no degrada nada.
2. El color es un **rol de tinta** (`tinta`, `campo`, `contacto`…), no un hex. Cada tema lo resuelve; las exportaciones usan la paleta clara.
3. Un elemento completo es **una op** (`elemento/agregar`); el borrador borra objetos enteros (`elemento/borrar`).
4. PNG, SVG y TikZ salen de la misma lista de elementos; ninguna etapa cierra sin exportar a TikZ.
5. El JSON guarda el **registro de ops** (no solo la escena): conserva el historial y es lo que se transmitirá en la Etapa 2.

**Consecuencias.** Un trazo largo viaja entero al soltar (la transmisión de trazos en curso se hará aparte, por lotes).
El borrador no recorta trazos (borra el objeto completo): es predecible y reversible con una sola op. Si se quiere
recortar, será una herramienta nueva.
