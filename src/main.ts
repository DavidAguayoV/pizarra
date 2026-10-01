import './styles.css';
import { aplicarTema, temaActual } from './core/tema';
import type { Op } from './core/ops';
import { elegirTransport } from './share';
import { normalizarCodigo } from './share/protocolo';
import { montarApp } from './ui/app';
import { CLAVE_COPIA, montarEspectador } from './ui/espectador';

aplicarTema(temaActual(), false); // sin guardar: seguir al sistema hasta que se elija otro
const raiz = document.getElementById('app');
if (!raiz) throw new Error('Falta el contenedor #app');

const sala = new URLSearchParams(location.search).get('sala');

/** Copia que dejó el modo espectador ("Copiar a mi pizarra"); se usa una sola vez. */
function copiaPendiente(): Op[] | undefined {
  try {
    const t = sessionStorage.getItem(CLAVE_COPIA);
    if (!t) return undefined;
    sessionStorage.removeItem(CLAVE_COPIA);
    const ops = JSON.parse(t) as Op[];
    return Array.isArray(ops) ? ops : undefined;
  } catch {
    return undefined;
  }
}

if (sala !== null) {
  const codigo = normalizarCodigo(sala);
  if (!codigo) {
    raiz.innerHTML =
      '<main class="mensaje"><h1>Código de sala no válido</h1><p>El código tiene 5 letras o números (sin 0, 1, O ni I).</p><p><a href=".">Ir a la pizarra</a></p></main>';
  } else {
    void montarEspectador(raiz, codigo, elegirTransport());
  }
} else {
  montarApp(raiz, { ops: copiaPendiente() });
}
