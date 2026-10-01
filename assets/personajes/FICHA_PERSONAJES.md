# Personajes de @problemasfisicauai — ficha técnica

*2026-09-26. Fuente única del dibujo: `motor/personajes.py`. Lámina:
`lamina_construccion_personajes.png` (esta carpeta). Si esta ficha y el código no
coinciden, manda el código.*

## 1. Reglas comunes a los cuatro

| Qué | Regla |
|---|---|
| Construcción | Solo formas geométricas simples: óvalos (elipses), un triángulo (pico del pingüino), arcos (boca del mono y del oso) y una espiral (cola del mono). Sin trazos a mano. |
| Proporción | Cuerpo = óvalo de ancho **w** y alto **h**, con **w = 0,9 h** (máximo 0,95 h: siempre más alto que ancho, "parado"). En una fila de personajes: ancho ∝ masa^(1/3), alto = 1,24 × ancho. |
| Medidas | Todas en fracciones de *w* y *h*, medidas desde el centro del óvalo (+x a la derecha, +y hacia arriba). |
| Tamaño de referencia | Se dibujan con h ≈ 1,6 unidades y **se escalan enteros** (incluido el contorno). Los ojos tienen tope de tamaño: si se dibuja un personaje grande sin escalar, los ojos quedan diminutos. |
| Contorno | 2,6 px el cuerpo; 2,2 px brazos, alas y orejas; 2 px mechones y patas. Color claro de su propia paleta (no negro). |
| Ojos | Óvalo negro `#0B1320` de 2r × 2,3r, con r = 0,075 w + 0,01 (oso: 0,065 w + 0,01). Brillo blanco: círculo de radio 0,38 r, corrido (−0,35 r; +0,45 r) desde el centro del ojo. |
| Mejillas | Óvalo rosado `#FF8FAB` al 55 % de opacidad, 0,15 w × 0,07 h. |
| Mirada | Cara corrida 0,06–0,07 w a la derecha: miran en el sentido habitual del movimiento. |
| Animación | Parpadeo cada 3,4 s (0,14 s cerrados: el ojo baja al 12 % y el brillo se apaga). Bamboleo ±0,075 rad por cada 0,32 u de avance, girando sobre los pies. En un plano inclinado se inclinan con el plano. |
| Rótulo | La masa (`m_1`) va en la panza, en tinta `#12384A`. |
| Roles fijos | Pingüino = el cuerpo de la **incógnita** (o el único cuerpo). Patito = cuerpos con **datos conocidos**. Oso y mono = extras, solo si se piden. |
| Qué no hacen nunca | Tapar una flecha o una cota; salir de su caja; aparecer de perfil o de espalda (solo existe la vista frontal). |

## 2. Pingüino — protagonista

| Pieza | Forma | Tamaño | Posición (centro) | Color |
|---|---|---|---|---|
| Cuerpo | óvalo | w × h | (0; 0) | `#2C3E57` azul pizarra, contorno `#A9D8EA` celeste |
| Mechón | 2 óvalos | (0,07 w + 0,02) × 0,16 h | (0,04 w − 0,05; h/2 + 0,03) girado +29°, y (0,04 w + 0,02; h/2 + 0,03) girado −6° | cuerpo, contorno 2 px |
| Panza | óvalo | 0,70 w × 0,66 h | (+0,05 w; −0,14 h) | `#F6F1E7` crema |
| Cara ("corazón") | 2 óvalos | 0,40 w × 0,36 h c/u | (0,07 w ± 0,15 w; 0,16 h) | crema |
| Ojos | óvalos | 2r × 2,3r | (0,07 w ± 0,16 w; 0,17 h) | `#0B1320` + brillo blanco |
| Mejillas | óvalos | 0,15 w × 0,07 h | ojo ± 0,07 w hacia afuera; 0,04 h | `#FF8FAB` 55 % |
| Pico | triángulo redondeado | base 0,15 w, alto 0,09 h | vértices (0,07 w ± 0,075 w; 0,11 h) y (0,08 w; 0,02 h) | `#FF9F1C` naranjo |
| Aletas | óvalos | (0,19 w + 0,02) × 0,44 h | punta en (± (w/2 + 0,07); −0,12 h), inclinadas 35,5° hacia afuera | cuerpo, contorno 2,2 px |
| Patas | óvalos | 0,30 w × 0,13 | (± 0,19 w + 0,03; −h/2 + 0,03) | naranjo |

Rasgo distintivo: la cara en forma de corazón (dos óvalos crema) y el mechón de dos plumas.

## 3. Pato — acompañante

| Pieza | Forma | Tamaño | Posición | Color |
|---|---|---|---|---|
| Cuerpo | óvalo | w × h | (0; 0) | `#FFD23F` amarillo, contorno `#FFF1B5` |
| Mechón | 3 óvalos | (0,08 w + 0,02) × 0,17 h | (0,02 w + {−0,07; 0; +0,07}; h/2 + 0,02), girados +32°, 0°, −32° | amarillo |
| Panza | óvalo | 0,64 w × 0,52 h | (+0,04 w; −0,20 h) | `#FFE98F` |
| Ojos | óvalos | r = 0,075 w + 0,01 | (0,07 w ± 0,16 w; 0,20 h) | negro + brillo |
| Mejillas | óvalos | 0,15 w × 0,07 h | (0,07 w ± 0,25 w; 0,07 h) | rosado 55 % |
| Pico superior | óvalo | 0,34 w × 0,11 h | (0,08 w; 0,09 h) | `#FF8C1A` |
| Pico inferior | óvalo | 0,26 w × 0,09 h | (0,08 w; 0,045 h), detrás del superior | `#E0661A` |
| Alas | óvalos | (0,22 w + 0,02) × 0,44 h | como las aletas del pingüino | `#F6B81E` |
| Patas palmeadas | óvalos | 0,32 w × 0,14 | (± 0,19 w + 0,03; −h/2 + 0,03) | `#FF8C1A` |

Rasgo distintivo: pico ancho de dos tonos y mechón de tres plumas.

## 4. Mono — extra

| Pieza | Forma | Tamaño | Posición | Color |
|---|---|---|---|---|
| Cola | curva + espiral | radio 0,17 w que se achica a la mitad en 1,8π rad; trazo 7 px | sale de (−0,36 w; −0,30 h), se enrosca en torno a (−0,66 w; +0,02 h) | `#7A4A2E` |
| Orejas | óvalos | 0,30 w × 0,26 h (interior 0,17 w × 0,15 h) | (± 0,47 w; 0,20 h) | cuerpo; interior `#E8B48A` |
| Pelitos | 2 óvalos | (0,07 w + 0,02) × 0,15 h | (0,02 w + {−0,05; +0,03}; h/2 + 0,02), girados +29° y −11° | cuerpo |
| Cuerpo | óvalo | w × h | (0; 0) | `#7A4A2E` chocolate, contorno `#E3B98F` |
| Panza | óvalo | 0,58 w × 0,46 h | (+0,04 w; −0,23 h) | `#F2D0A9` beige |
| Cara ("corazón") | 2 óvalos | 0,34 w × 0,28 h | (0,06 w ± 0,14 w; 0,19 h) | beige |
| Hocico | óvalo | 0,52 w × 0,24 h | (0,06 w; 0,06 h) | beige |
| Ojos | óvalos | r = 0,075 w + 0,01, separación ± 0,14 w | (0,06 w ± 0,14 w; 0,19 h) | negro + brillo |
| Narinas | 2 puntos | radio 0,018 w + 0,006 | (0,06 w ± 0,04 w; 0,10 h) | `#4A2A18` |
| Sonrisa | arco | radio 0,10 w, de 207° a 333° | centro (0,06 w; 0,08 h); trazo 3 px | `#4A2A18` |
| Mejillas | óvalos | 0,15 w × 0,07 h | (0,06 w ± 0,24 w; 0,06 h) | rosado 55 % |
| Brazos | óvalos + mano redonda | (0,20 w + 0,02) × 0,44 h; mano radio 0,075 w + 0,02 | como las aletas | cuerpo; mano beige |
| Pies | óvalos | 0,28 w × 0,13 | (± 0,19 w + 0,03; −h/2 + 0,03) | beige |

Rasgo distintivo: cara en corazón con hocico ancho, orejas laterales y cola en espiral.

## 5. Oso — extra

| Pieza | Forma | Tamaño | Posición | Color |
|---|---|---|---|---|
| Orejas | óvalos | 0,30 w × 0,27 h (interior 0,16 w × 0,14 h) | (± 0,30 w + 0,03; 0,42 h) | cuerpo; interior `#E6A98A` |
| Cuerpo | óvalo | w × h | (0; 0) | `#B8804F` caramelo, contorno `#F1D2B0` |
| Panza | óvalo | 0,62 w × 0,50 h | (+0,04 w; −0,21 h) | `#F3DEC0` crema |
| Ojos | óvalos | r = 0,065 w + 0,01 (más chicos) | (0,07 w ± 0,19 w; 0,20 h) | negro + brillo |
| Hocico | óvalo | 0,36 w × 0,20 h | (0,07 w; 0,07 h) | crema |
| Nariz | óvalo | 0,13 w × 0,075 h | (0,07 w; 0,115 h) | `#3A2418` |
| Boca en "w" | 2 arcos | radio 0,05 w, de 198° a 342° | centros (0,07 w ± 0,045 w; 0,065 h); trazo 2,5 px | `#3A2418` |
| Mejillas | óvalos | 0,15 w × 0,07 h | (0,07 w ± 0,27 w; 0,10 h) | rosado 55 % |
| Brazos | óvalos + mano | (0,24 w + 0,02) × 0,44 h | como las aletas | cuerpo; mano crema |
| Patitas | óvalos + almohadilla | 0,30 w × 0,15 (almohadilla 0,14 w × 0,07) | (± 0,20 w + 0,03; −h/2 + 0,04) | cuerpo; almohadilla crema |

Rasgo distintivo: orejas redondas arriba, ojos más chicos y más separados, boca en "w".

## 6. Archivos

| Archivo | Qué es |
|---|---|
| `motor/personajes.py` | el código que los dibuja (fuente única) |
| `assets_compartidos/personajes/lamina_construccion_personajes.png` | esta ficha en imagen |
| `assets_compartidos/personajes/lamina_construccion.py` | script que regenera la lámina |
| `assets_compartidos/perfil/` | fotos de perfil, banners y sus scripts |
| `skill/video-fisica-uai/referencias/personajes.md` | cómo pedirlos en un YAML |

## 7. Autoría y protección (orientación general, no asesoría legal)

* **Origen:** los cuatro se construyeron desde cero en código (`motor/personajes.py`,
  2026-09-25) a partir de indicaciones del profesor ("tiernos, bonitos, gorditos", roles
  fijos, paleta). No se calcó ni se tomó como modelo ninguna imagen ni personaje existente.
  El historial de esos pedidos y de las iteraciones sirve como registro del proceso creativo.
* El estilo "kawaii" (cuerpo redondo, ojos grandes con brillo, mejillas rosadas) es genérico y
  lo usan muchos personajes. Un estilo no es plagio, pero conviene compararlos con los
  pingüinos más conocidos (Pudgy Penguins, Pingu, Club Penguin, Tux) antes de registrar algo.
* Ver en la conversación del 2026-09-26: registro de derechos de autor (DDI), marca (INAPI),
  el uso de la sigla "UAI" y la autoría con herramientas de IA.
