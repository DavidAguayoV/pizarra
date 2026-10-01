# Firebase: guía paso a paso

La pizarra comparte en vivo con **Firebase Realtime Database** (plan gratuito, sin tarjeta). Mientras no
haya configuración, el botón *Compartir* funciona en **modo demostración** (solo entre pestañas del mismo
navegador). Esta guía deja la clase real funcionando. Toma unos 10 minutos y se hace una sola vez.

> Probado hasta ahora: toda la lógica de sincronización contra una base en memoria (pruebas automáticas) y
> el flujo completo entre pestañas con el transporte local. **Lo que falta verificar es el contacto con el
> servicio real**: al terminar el paso 7 hay una lista de comprobación para hacerlo.

## 1. Crear el proyecto

1. Entra a <https://console.firebase.google.com> con tu cuenta de Google.
2. **Agregar proyecto** → nombre, por ejemplo `pizarra-fisica`.
3. Desactiva Google Analytics (no hace falta) y crea el proyecto.

## 2. Crear la base de datos

1. Menú **Compilación → Realtime Database → Crear base de datos**.
2. Ubicación: la que ofrezca por defecto (Estados Unidos) está bien.
3. Modo: **bloqueado** (las reglas del paso 3 la abren solo lo necesario).
4. Anota la URL que aparece arriba (algo como `https://pizarra-fisica-default-rtdb.firebaseio.com`).

## 3. Reglas de seguridad

Pestaña **Reglas** → reemplaza todo por el contenido de [`database.rules.json`](../database.rules.json) → **Publicar**.

Qué hacen, en simple:

* **Leer**: cualquiera que conozca el código de sala puede leer *esa* sala. No se puede listar las salas.
* **Escribir**: solo quien creó la sala (su `auth.uid` queda guardado en `meta/owner`). Nadie más puede
  modificar ni borrar. Un estudiante que entra solo mira.
* El código debe tener el formato válido (5 caracteres sin `0 O 1 I`) y los mensajes tienen tamaño máximo.

## 4. Inicio de sesión anónimo

1. **Compilación → Authentication → Comenzar → Sign-in method → Anónimo → Habilitar**.
2. **Authentication → Configuración → Dominios autorizados → Agregar dominio**: `davidaguayov.github.io`
   (`localhost` ya viene incluido para probar en tu computador).

No se pide ningún dato a nadie: el profesor recibe un identificador anónimo que lo hace dueño de la sala.

## 5. Registrar la aplicación web

1. **Configuración del proyecto** (engranaje) → pestaña **General** → *Tus apps* → ícono **`</>`** (Web).
2. Apodo: `pizarra`. No actives Firebase Hosting.
3. Copia el objeto `firebaseConfig` que muestra.

## 6. Pegar la configuración

En [`src/share/firebaseBd.ts`](../src/share/firebaseBd.ts) reemplaza `CONFIG_FIREBASE = null` por:

```ts
export const CONFIG_FIREBASE: ConfigFirebase | null = {
  apiKey: '...',
  authDomain: '...firebaseapp.com',
  databaseURL: 'https://...firebaseio.com',
  projectId: '...',
  appId: '...',
};
```

(También puedes pasarme esos cinco valores y lo hago yo.) Haz *commit* y *push*: la CI despliega.

Estos valores **no son secretos**: van dentro del código de la página, como en cualquier app web con
Firebase. Lo que protege los datos son las reglas del paso 3. Recomendación extra: en
<https://console.cloud.google.com/apis/credentials> restringe la *API key* a los sitios
`https://davidaguayov.github.io/*` y `http://localhost:*`.

## 7. Lista de comprobación (con el servicio real)

1. Abre <https://davidaguayov.github.io/pizarra/> → **Compartir → Crear sala**. Ya **no** debe aparecer el aviso de "Modo demostración".
2. En el celular (con datos móviles, no el wifi de la sala) escanea el QR. Debe decir **Conectado** y mostrar lo dibujado.
3. Dibuja en el computador: el trazo debe aparecer en el celular **mientras lo haces**.
4. Apaga el wifi del celular 20 segundos, dibuja varios trazos y vuelve a conectar: debe avisar "Sin conexión: reintentando…" y luego ponerse al día solo.
5. **Dejar de compartir**: el celular debe avisar que la sala se cerró.
6. En la consola de Firebase → Realtime Database → Datos, la sala `rooms/CODIGO` debe desaparecer al cerrarla.
7. Con otro navegador, intenta escribir en esa sala desde la consola del navegador: debe ser rechazado (*permission denied*).

## Límites del plan gratuito (Spark)

| Recurso | Límite | Qué significa |
|---|---|---|
| Conexiones simultáneas | **100** | Profesor + ~99 estudiantes. Para 60 sobra. Si se pasa, los nuevos no entran. |
| Descarga | 10 GB al mes | Una clase de 60 estudiantes usa del orden de decenas de MB (ver `PROTOCOLO_COMPARTIR.md`). |
| Almacenamiento | 1 GB | La sala se borra al dejar de compartir. |

Si algún día se necesita más (varias secciones a la vez, cursos masivos): plan **Blaze** (pago por uso, pide
tarjeta) o cambiar de servicio. El código está preparado para eso: todo pasa por la interfaz `Transport`
(`src/share/transport.ts`), así que cambiar a **Supabase Realtime** o a **Cloudflare Durable Objects**
es escribir otro transporte, sin tocar la pizarra.

## Mantenimiento

* Una sala queda en la base solo mientras el profesor comparte. Si cierra la pestaña sin pulsar *Dejar de
  compartir*, la sala queda (con su fecha `creado`) y se puede borrar a mano desde la consola.
* Una pizarra con muchas imágenes pesadas puede acercarse al máximo de 10 MB por escritura de Realtime
  Database; las imágenes se reducen a 1600 px antes de insertarse para evitarlo.
