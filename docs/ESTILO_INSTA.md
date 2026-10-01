# Estilo heredado del proyecto Insta (@problemasfisicauai)

Auditoría hecha el 2026-10-01 (Etapa 0). La pizarra **no tiene identidad visual propia**: hereda la de los videos.
Cualquier desvío se consulta con David antes (prompt maestro §1b.6).

## Fuentes consultadas (proyecto Insta2)

Ruta base: `C:\Users\david\Dropbox\00_2026\II_Semestre\Proyecto_insta2\`

| Qué | Archivo |
|---|---|
| Guía de estilo v2 (zonas, paleta, tipografía, ritmo) | `GUIA_ESTILO_V2.md` |
| Paleta v2 y rol → color (valores vivos) | `motor/estilo_v2.py` (líneas 56–106) |
| Estilos base y firma | `motor/estilos.py` |
| Temas de color por curso | `motor/temas.py` |
| Personajes: ficha técnica | `assets_compartidos/personajes/FICHA_PERSONAJES.md` |
| Personajes: dibujo (fuente única) | `motor/personajes.py` (+ `personajes_perfil.py`) |
| Lámina y fotos de perfil | `assets_compartidos/personajes/`, `assets_compartidos/perfil/` |
| Firma | `assets_compartidos/firma.md` |

## Lo que se hereda tal cual

### Paleta (tema oscuro = paleta v2 sin cambios)

Un acento y cuatro familias semánticas. Los problemas nombran **roles**; el tema decide el color.

| Familia | Oscuro | Roles |
|---|---|---|
| Acento (incógnita, resultado, paso actual) | `#FFC53D` | `resultante` |
| Campo | `#FF6B6B` | `peso`, `potencial` |
| Contacto | `#4FC3F7` | `normal`, `tension`, `aplicada`, `momento` |
| Disipación | `#B79CFF` | `friccion`, `termica`, `calor`, `trabajo` |
| Movimiento | `#3DDC97` | `acel`, `velocidad`, `cinetica` |
| Neutro | `#B8C7DA` | `dato` |
| Activo (subtítulo, enfoque) | `#00AFD8` | — |
| Fondo | `#0A1320` (degradé a `#14263F`) | — |

Caso límite conocido en los videos: normal y tensión comparten color; el rótulo las distingue.
Los videos tienen además temas por curso (`temas.py`: FIS101 azul, FIS201 rojo, FIS301 ámbar…); la
pizarra **no** los usa por ahora (ver "Decisiones pendientes").

### Tipografía

Texto: Segoe UI Variable Display (negrita en títulos). Fórmulas: LaTeX con `newtxsf` (matemática sans).

### Orden de desarrollo (convención de contenido)

Fórmulas simbólicas primero, sustitución numérica solo en el penúltimo paso, resultado final.
Todo en español.

### Personajes

Cuatro, construidos solo con óvalos, un triángulo y arcos. Roles fijos:

| Personaje | Rol |
|---|---|
| Pingüino | protagonista: el cuerpo de la **incógnita** (o el único cuerpo) |
| Patito | acompañante: cuerpos con **datos conocidos** |
| Oso, mono | extras, solo si se piden |

Nunca tapan vectores ni cotas, siempre parados, contorno de grosor fijo (no escala con el tamaño).
Detalle completo y medidas en `assets/personajes/FICHA_PERSONAJES.md` (copia de la ficha original;
si difiere del código, manda el código del proyecto Insta).

### Firma

`@problemasfisicauai`, blanco al 55 %, esquina inferior izquierda (corto) o derecha (largo).
En la pizarra solo aplica a las exportaciones en formato de redes (Etapa 8).

## Vectores en la pizarra (Etapa 3)

El color de un vector sale de su **rol**, con la misma asignación de los videos (familias de la tabla de arriba), y cada
rol trae una letra y una unidad por defecto: peso `m\vec{g}` (N), normal `\vec{N}`, tensión `\vec{T}`, roce `\vec{f}`,
fuerza aplicada `\vec{F}`, velocidad `\vec{v}` (m/s), aceleración `\vec{a}` (m/s²), momento `\vec{p}`,
resultante `\vec{R}`. El color **no es lo único** que distingue un vector: lleva su letra. Normal y tensión comparten color
(como en los videos); la etiqueta las distingue. Los videos no definen un estilo de trazo por fuerza, así que no se
inventó ninguno: queda como decisión pendiente (punto 4 de la lista siguiente).

## Cómo se adaptó al tema CLARO

La paleta v2 está pensada para fondo oscuro: el ámbar `#FFC53D` sobre blanco da 1,5:1 (ilegible).
El tema claro **conserva el tono y la asignación de roles**, solo baja la luminosidad hasta superar
AA (≥ 4,5:1) sobre blanco y sobre el panel `#F1F5F9`:

| Familia | Oscuro | Claro | Contraste claro / blanco |
|---|---|---|---|
| Acento | `#FFC53D` | `#8A5A00` | 5,93 |
| Campo | `#FF6B6B` | `#C2343F` | 5,44 |
| Contacto | `#4FC3F7` | `#0B6FA8` | 5,45 |
| Disipación | `#B79CFF` | `#6B45C9` | 6,33 |
| Movimiento | `#3DDC97` | `#0B7A4B` | 5,39 |
| Neutro | `#B8C7DA` | `#4A5A70` | 7,03 |
| Activo | `#00AFD8` | `#00708F` | 5,65 |

El borde de cuerpos del tema claro usa `#2C3E57` (el azul pizarra del cuerpo del pingüino).
Una prueba (`tests/tokens.test.ts`) exige AA para cada rol en ambos temas y que el tema oscuro
siga idéntico a `estilo_v2.py`.

**Implementación:** `src/ui/tokens.ts` (fuente de verdad) → `npm run tokens` genera `src/ui/tokens.css`. La grilla fuerte (`grillaFuerte`, cada 5 m) es el único token derivado que no existe en los videos.

## Recursos faltantes y decisiones pendientes (para David)

1. **Fuente.** Segoe UI Variable Display solo existe en Windows 11; en celulares y Mac cae a la fuente
   del sistema, así que el espectador móvil no vería la misma tipografía. No se puede incrustar Segoe.
   ¿Se acepta el *fallback* de sistema o se elige una fuente abierta equivalente para incrustar?
2. **Fórmulas.** Los videos usan `newtxsf` (sans). KaTeX no la trae; lo más cercano es `\mathsf`/
   `KaTeX_SansSerif`. ¿Se acepta esa aproximación para las etiquetas en pantalla? (En TikZ sí se puede
   mantener LaTeX real.)
3. **Personajes en vector.** Solo existen como código Manim (`personajes.py`) y PNG. Para dibujarlos en la
   pizarra hay que portar su geometría a SVG/Canvas. La ficha especifica toda la geometría, así que es
   factible sin tocar el diseño; hace falta tu autorización para esa **traducción** (prompt maestro §1b.2).
   Mientras tanto se versionaron la lámina de construcción y las cuatro fotos de perfil.
4. **Convención de línea por fuerza.** Los videos definen color y letra, pero no estilo de trazo (sólido,
   guiones…). El prompt pide no depender solo del color. ¿Definimos un patrón de trazo por familia o
   se confía en etiqueta + color?
5. **Aprobar el tema claro derivado** (tabla anterior): es lo único realmente nuevo en la paleta.
6. **Temas por curso.** ¿La pizarra debe tomar el color de curso (FIS101 azul, FIS201 rojo…) o usar la
   paleta de marca única?
7. **Repositorio público y personajes.** GitHub Pages gratis exige repo público: las imágenes de los
   personajes quedarían públicas. La ficha ya advierte de la incertidumbre de autoría/registro (DDI, INAPI).
   Confirmar que está bien publicarlos antes del primer *push*.
