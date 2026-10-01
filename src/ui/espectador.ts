import type { Camara } from '../core/camara';
import { ESCALA_MAX, ESCALA_MIN } from '../core/camara';
import { escenaInicial, reductoresEscena } from '../core/escena';
import type { Escena } from '../core/escena';
import { Store } from '../core/store';
import { alternarTema, temaActual } from '../core/tema';
import { Entrada } from '../ink/entrada';
import type { VistaMsg } from '../share/protocolo';
import type { EstadoConexion } from '../share/protocolo';
import { Sincronizador } from '../share/sincronizador';
import type { Transport } from '../share/transport';
import { ReconstructorVivo } from '../share/vivo';
import { TEXTO_ESTADO } from './compartir';
import { Lienzo } from './lienzo';

/** Clave con la que el espectador pasa su copia a la pizarra propia (misma pestaña). */
export const CLAVE_COPIA = 'pizarra.copia';

/**
 * Encuadre que muestra TODA la región que ve el profesor en el tamaño de pantalla del
 * estudiante, centrada en el mismo punto. Así nada de lo que el profesor tiene a la vista
 * queda fuera, aunque el celular sea vertical y la sala proyecte en horizontal.
 */
export function camaraParaSeguir(v: VistaMsg, ancho: number, alto: number): Camara {
  const k = Math.min(ancho / v.ancho, alto / v.alto);
  const escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, v.escala * k));
  return { cx: v.cx, cy: v.cy, escala };
}

/**
 * Modo espectador: pensado para el celular en vertical. Solo mira. Con "Seguir al profesor"
 * encendido la vista acompaña su encuadre; mover o hacer zoom la desacopla.
 */
export async function montarEspectador(raiz: HTMLElement, codigo: string, transport: Transport): Promise<void> {
  const store = new Store<Escena>(escenaInicial, reductoresEscena, { autor: 'espectador' });
  let siguiendo = true;
  let vistaProfesor: VistaMsg | null = null;
  let estado: EstadoConexion = 'conectando';
  let cuantasOps = 0;

  const barra = document.createElement('header');
  barra.className = 'barra barra-espectador';
  const titulo = document.createElement('h1');
  titulo.textContent = `Sala ${codigo}`;
  const pastilla = document.createElement('span');
  pastilla.className = 'estado-conexion';
  pastilla.setAttribute('role', 'status');

  const bSeguir = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Seguir al profesor' });
  bSeguir.addEventListener('click', () => {
    siguiendo = !siguiendo;
    if (siguiendo) aplicarSeguimiento();
    pintarBarra();
  });
  const bCopiar = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Copiar a mi pizarra' });
  bCopiar.title = 'Pasa lo que hay ahora a una pizarra tuya, donde puedes dibujar sin afectar la clase';
  bCopiar.addEventListener('click', () => {
    try {
      sessionStorage.setItem(CLAVE_COPIA, JSON.stringify(store.ops));
    } catch {
      /* sin almacenamiento: se abre vacía */
    }
    location.href = location.pathname;
  });
  const bTema = Object.assign(document.createElement('button'), { type: 'button' });
  bTema.addEventListener('click', () => {
    alternarTema();
    L.invalidar();
    pintarBarra();
  });
  barra.append(titulo, pastilla, bSeguir, bCopiar, bTema);

  const aviso = document.createElement('div');
  aviso.className = 'aviso-sala';
  aviso.setAttribute('role', 'alert');

  const canvas = document.createElement('canvas');
  canvas.className = 'lienzo';
  canvas.setAttribute('aria-label', 'Pizarra del profesor (solo lectura)');
  raiz.append(barra, aviso, canvas);

  const L = new Lienzo(canvas, () => store.estado.elementos, { alTamano: () => aplicarSeguimiento() });

  function aplicarSeguimiento(): void {
    if (siguiendo && vistaProfesor && L.ancho > 0) L.ponerCamara(camaraParaSeguir(vistaProfesor, L.ancho, L.alto));
  }

  function pintarBarra(): void {
    bSeguir.setAttribute('aria-pressed', String(siguiendo));
    bSeguir.textContent = siguiendo ? 'Siguiendo al profesor' : 'Seguir al profesor';
    bTema.textContent = temaActual() === 'oscuro' ? 'Tema claro' : 'Tema oscuro';
    pastilla.textContent = `${TEXTO_ESTADO[estado]} · ${cuantasOps} ops`;
    pastilla.dataset['estado'] = estado;
    const problema = estado === 'reconectando' || estado === 'sin-conexion' || estado === 'sin-sala';
    aviso.textContent = problema ? TEXTO_ESTADO[estado] : '';
    aviso.hidden = !problema;
    bCopiar.disabled = store.ops.length === 0;
  }

  // Solo se mira: un dedo desplaza, dos dedos hacen zoom. Cualquier gesto desacopla.
  new Entrada(canvas, {
    camara: () => L.camara,
    ponerCamara: (c) => {
      siguiendo = false;
      L.ponerCamara(c);
      pintarBarra();
    },
    vista: () => L.vista,
    herramienta: () => 'mano',
    color: () => 'tinta',
    grosor: () => 0.02,
    tamTexto: () => 0.2,
    elementos: () => [],
    previsualizar: () => {},
    confirmar: () => {},
    borrar: () => {},
    pedirTexto: () => {},
  });

  const receptor = await transport.unirse(codigo);
  const sync = new Sincronizador({
    cargar: (ops) => store.cargar(ops),
    aplicar: (op) => store.aplicarExterna(op),
    pedirResync: () => receptor.resincronizar(),
  });
  const vivo = new ReconstructorVivo();

  store.suscribir(() => {
    cuantasOps = store.ops.length;
    L.invalidar();
    pintarBarra();
  });
  receptor.alSnapshot((s) => sync.alSnapshot(s));
  receptor.alOp((m) => sync.alOp(m));
  receptor.alVivo((l) => {
    if (l) {
      const r = vivo.aplicar(l);
      L.fijarVivo(r.elemento, r.ocultos);
    } else {
      vivo.limpiar();
      L.fijarVivo(null, new Set());
    }
  });
  receptor.alVista((v) => {
    vistaProfesor = v;
    aplicarSeguimiento();
  });
  receptor.alEstado((e) => {
    estado = e;
    pintarBarra();
  });
  pintarBarra();
  receptor.iniciar();
}
