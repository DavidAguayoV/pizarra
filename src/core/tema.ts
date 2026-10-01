/** Temas claro y oscuro. La preferencia se guarda; sin preferencia sigue al sistema. */

export type Tema = 'claro' | 'oscuro';
const CLAVE = 'pizarra.tema';

function leerGuardado(): Tema | null {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === 'claro' || v === 'oscuro' ? v : null;
  } catch {
    return null;
  }
}

export function temaActual(): Tema {
  const guardado = leerGuardado();
  if (guardado) return guardado;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
}

export function aplicarTema(tema: Tema): void {
  document.documentElement.dataset.theme = tema;
  try {
    localStorage.setItem(CLAVE, tema);
  } catch {
    /* almacenamiento bloqueado: el tema vale solo para esta sesión */
  }
}

export function alternarTema(): Tema {
  const siguiente: Tema = temaActual() === 'oscuro' ? 'claro' : 'oscuro';
  aplicarTema(siguiente);
  return siguiente;
}

/** Lee un token de color del CSS (para dibujar en canvas con el tema vigente). */
export function colorCss(nombre: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}
