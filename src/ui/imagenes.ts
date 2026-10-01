/** Imágenes pegadas o arrastradas a la pizarra (por ejemplo el enunciado de un problema). */

export const LADO_MAX_PX = 1600;

export interface ImagenCargada {
  src: string;
  /** Tamaño en píxeles tras reducirla. */
  ancho: number;
  alto: number;
}

/** Reduce la imagen a `LADO_MAX_PX` y la convierte en data URL (PNG si es PNG, si no JPEG). */
export async function cargarImagen(archivo: Blob): Promise<ImagenCargada> {
  if (!archivo.type.startsWith('image/')) throw new Error('El archivo no es una imagen.');
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(archivo);
  } catch {
    throw new Error('No se pudo leer la imagen.');
  }
  const k = Math.min(1, LADO_MAX_PX / Math.max(bmp.width, bmp.height));
  const ancho = Math.max(1, Math.round(bmp.width * k));
  const alto = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = alto;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  ctx.drawImage(bmp, 0, 0, ancho, alto);
  bmp.close();
  const png = archivo.type === 'image/png';
  return { src: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9), ancho, alto };
}

/** Primera imagen que haya en los archivos o en el portapapeles, si la hay. */
export function primeraImagen(fuente: DataTransfer | null): File | null {
  if (!fuente) return null;
  for (const f of Array.from(fuente.files)) if (f.type.startsWith('image/')) return f;
  for (const it of Array.from(fuente.items)) {
    if (it.kind === 'file' && it.type.startsWith('image/')) return it.getAsFile();
  }
  return null;
}
