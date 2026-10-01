# Exportación a TikZ

Código: `src/export/tikz.ts`. Pruebas: `tests/export.test.ts` (archivos de referencia en `tests/golden/`)
y compilación real con `pdflatex` (MiKTeX) del documento de ejemplo.

## Cómo se usa

Menú **Exportar**:

| Botón | Resultado |
|---|---|
| Copiar TikZ (fragmento) | Copia el `tikzpicture` al portapapeles, listo para Beamer o apuntes |
| Descargar .tex (fragmento) | El mismo `tikzpicture` en un archivo |
| Descargar .tex (documento) | `standalone` compilable con `pdflatex` |

El campo **Ancho TikZ (cm)** fija el ancho total de la figura (12 cm por defecto). La escala resultante
(cm por metro de pizarra) queda anotada en un comentario. Desde código también se puede fijar la escala
con `cmPorMetro`.

Si la pizarra tiene imágenes, el `.tex` las referencia con `\includegraphics{pizarra-imagen-N.png}` y se
descargan aparte: hay que dejarlas junto al `.tex`.

## Convenciones

* Coordenadas en **cm**, con el origen en la esquina inferior izquierda del contenido; `y` crece hacia arriba (igual que en la pizarra).
* Los colores se definen **dentro** de la figura, solo los usados, con nombre `pz<rol>` (`pztinta`, `pzcampo`,
  `pzcontacto`, `pzdisipacion`, `pzmovimiento`, `pzacento`, `pzneutro`). Usan **siempre la paleta clara**
  (papel blanco), aunque se dibuje en el tema oscuro. Son los mismos tonos de los videos (ver [ESTILO_INSTA.md](ESTILO_INSTA.md)).
* El código se agrupa por capas con comentarios: `colores`, `trazos libres`, `formas`, `texto`, `imágenes`,
  en el orden en que se dibujó.
* Todo comentario y texto de la figura está en español.

## Mapeo elemento → TikZ

| Elemento | TikZ |
|---|---|
| Trazo libre | Se simplifica con Ramer–Douglas–Peucker (tolerancia 0,2 mm) y se escribe como curva Bézier cúbica suave: `\draw[...] (p0) .. controls (c1) and (c2) .. (p1) ...;`. Dos puntos: `--`. Un punto: `\fill ... circle`. |
| Resaltador | Igual que un trazo, con `opacity=0.35`. |
| Línea | `\draw[...] (a) -- (b);` |
| Flecha | `\draw` del cuerpo hasta la base de la punta + `\fill` de un triángulo (la misma punta que se ve en pantalla). |
| Rectángulo | `\draw[...] (a) rectangle (b);` |
| Elipse | `\draw[...] (centro) ellipse (rx and ry);` |
| Texto | `\node[anchor=north west, align=left, font={\fontsize{..}{..}\selectfont}] at (..) {línea 1 \\ línea 2};` |
| Imagen | `\node[anchor=north west] at (..) {\includegraphics[width=..cm]{pizarra-imagen-N.png}};` |

### Texto

* Los caracteres especiales (`& % # _ { } ~ ^ \ $`) se escapan.
* Lo que va entre `$...$` se deja como **matemática**: escribir `$\vec{F}=m\vec{a}$` en la pizarra da
  la ecuación compuesta en LaTeX. Si los `$` no están balanceados, se escapan todos.
* El tamaño de letra se convierte a puntos según la escala de la figura.

## Límites conocidos

* **Presión del lápiz:** en TikZ y SVG el grosor de un trazo es el promedio de su presión; en pantalla y en PNG varía punto a punto.
* La caja del texto se estima (0,55 de altura de letra por carácter): el cálculo de límites y el borrador usan esa estimación; en el `.tex` el ancho real lo decide LaTeX.
* El grosor de línea nunca baja de 0,2 pt.
* Las puntas de flecha son triángulos propios, no las de `arrows.meta`: así la figura se ve igual en pantalla y en el documento sin cargar librerías.
