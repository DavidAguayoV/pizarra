# ADR 0004 — Compartir en vivo: Realtime Database con SDK diferido, QR con librería mínima

**Fecha:** 2026-10-01 · **Estado:** aceptada (pendiente de verificar contra el servicio real)

**Contexto.** Un profesor transmite a ≥ 60 celulares desde un sitio estático, sin servidor propio y sin costo.

**Decisión.**
1. **Transporte intercambiable** (`Transport`): Firebase Realtime Database en producción, BroadcastChannel para
   desarrollo y demostración sin cuenta. La lógica (difusor, sincronizador, trazo en vivo) no conoce ninguno de los dos.
2. **Firebase por SDK oficial (`firebase`, Apache-2.0), cargado con `import()` dinámico**: solo se descarga al
   compartir. Peso medido: el paquete principal pasó de ~14 a ~27 KB gzip (compartir + QR); los fragmentos de
   Firebase suman ~90 KB gzip y solo los baja quien comparte con la nube. Se descartó la API REST + SSE a mano (cero dependencias) porque
   obligaría a reimplementar autenticación anónima con renovación de token y reconexión; el SDK ya lo resuelve.
3. **QR con `qrcode-generator` (MIT)**: unos 10 KB gzip dentro del paquete principal, sin dependencias. Escribir un
   codificador QR propio es fácil de hacer mal y difícil de verificar.
4. **Todo lo estructurado viaja como texto JSON** dentro de la base (evita las particularidades de Realtime Database con arrays y claves).
5. **Adaptador `BD`** entre el transporte y el SDK: permite probar toda la lógica con una base en memoria.
6. Autenticación **anónima**; el dueño de la sala es el `auth.uid` de quien la crea. Lectura pública por código, escritura solo del dueño.

**Alternativas.** WebRTC directo (sin servidor, pero falla con firewalls de universidad y no escala a 60);
Supabase o Cloudflare (válidos, requieren más montaje; quedan como reemplazo posible detrás de `Transport`).

**Consecuencias.** Hay que crear el proyecto de Firebase (guía en `docs/FIREBASE.md`). Las reglas de seguridad no se
verifican en CI (requieren el emulador). El límite de 100 conexiones simultáneas del plan gratuito es el techo real.
