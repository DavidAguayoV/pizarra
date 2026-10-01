/** Utilidades de navegador para entregar archivos. */

export function descargarBlob(nombre: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function descargarTexto(nombre: string, texto: string, mime = 'text/plain'): void {
  descargarBlob(nombre, new Blob([texto], { type: `${mime};charset=utf-8` }));
}

export function dataUrlABlob(src: string): Blob {
  const [cabecera, datos] = src.split(',', 2);
  const mime = /data:([^;]+)/.exec(cabecera ?? '')?.[1] ?? 'application/octet-stream';
  const bin = atob(datos ?? '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
