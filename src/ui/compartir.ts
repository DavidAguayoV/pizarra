import qrcode from 'qrcode-generator';
import type { Escena } from '../core/escena';
import type { Store } from '../core/store';
import { Difusor } from '../share/difusor';
import { enlaceSala } from '../share';
import { generarCodigo, normalizarCodigo } from '../share/protocolo';
import type { EstadoConexion } from '../share/protocolo';
import type { Transport } from '../share/transport';
import { copiarTexto } from '../export/descarga';

export interface Transmision {
  codigo: string;
  url: string;
  difusor: Difusor;
}

export const TEXTO_ESTADO: Record<EstadoConexion, string> = {
  conectando: 'Conectando…',
  conectado: 'Conectado',
  reconectando: 'Sin conexión: reintentando…',
  'sin-conexion': 'Sin conexión',
  'sin-sala': 'La sala no existe o se cerró',
};

/** SVG del código QR (negro sobre blanco, con margen: se lee bien también en el tema oscuro). */
export function qrSvg(texto: string): string {
  const q = qrcode(0, 'M');
  q.addData(texto);
  q.make();
  return q.createSvgTag({ cellSize: 8, margin: 4, scalable: true });
}

export interface OpcionesCompartir {
  store: Store<Escena>;
  transport: Transport;
  /** Se llama al empezar (con la transmisión) y al terminar (con null). */
  alCambiar: (t: Transmision | null) => void;
  avisar: (texto: string) => void;
}

/** Botón "Compartir" y su panel (código grande + QR, pensado para proyectar). */
export function crearCompartir(op: OpcionesCompartir): { boton: HTMLButtonElement; transmision: () => Transmision | null } {
  let actual: Transmision | null = null;
  let quitarEstado: (() => void) | null = null;

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.title = 'Compartir la pizarra en vivo con los estudiantes';

  const dialogo = document.createElement('dialog');
  dialogo.className = 'dialogo-compartir';
  dialogo.setAttribute('aria-label', 'Compartir en vivo');
  document.body.append(dialogo);

  function pintarBoton(): void {
    boton.textContent = actual ? `● En vivo ${actual.codigo}` : 'Compartir';
    boton.classList.toggle('en-vivo', actual !== null);
  }

  async function empezar(): Promise<void> {
    for (let intento = 0; intento < 5 && !actual; intento++) {
      const codigo = generarCodigo();
      try {
        const emisor = await op.transport.crearSala(codigo);
        const difusor = new Difusor(emisor, op.store);
        actual = { codigo, url: enlaceSala(codigo), difusor };
        quitarEstado = emisor.alEstado((e) => {
          const el = dialogo.querySelector('.estado-sala');
          if (el) el.textContent = TEXTO_ESTADO[e];
        });
        op.alCambiar(actual);
      } catch (err) {
        if (intento === 4) {
          op.avisar(err instanceof Error ? err.message : 'No se pudo crear la sala.');
          return;
        }
      }
    }
    pintar();
    pintarBoton();
  }

  function detener(): void {
    actual?.difusor.detener();
    quitarEstado?.();
    quitarEstado = null;
    actual = null;
    op.alCambiar(null);
    pintar();
    pintarBoton();
  }

  function pintar(): void {
    dialogo.replaceChildren();
    const cerrar = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Cerrar' });
    cerrar.className = 'cerrar-dialogo';
    cerrar.addEventListener('click', () => dialogo.close());

    const titulo = document.createElement('h2');
    titulo.textContent = 'Compartir en vivo';
    dialogo.append(cerrar, titulo);

    if (op.transport.nombre === 'local') {
      const aviso = document.createElement('p');
      aviso.className = 'nota-demo';
      aviso.textContent =
        'Modo demostración: la sala solo se ve en otras pestañas de este mismo navegador. Para clase real falta la configuración de Firebase (docs/FIREBASE.md).';
      dialogo.append(aviso);
    }

    if (!actual) {
      const p = document.createElement('p');
      p.textContent = 'Los estudiantes miran en su celular lo que dibujas. Solo tú puedes dibujar en la sala.';
      const crear = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Crear sala' });
      crear.addEventListener('click', () => void empezar());
      dialogo.append(p, crear, formularioUnirse());
      return;
    }

    const codigo = document.createElement('div');
    codigo.className = 'codigo-sala';
    codigo.setAttribute('aria-label', `Código de sala ${[...actual.codigo].join(' ')}`);
    codigo.textContent = actual.codigo;

    const qr = document.createElement('div');
    qr.className = 'qr-sala';
    qr.setAttribute('role', 'img');
    qr.setAttribute('aria-label', 'Código QR para entrar a la sala');
    qr.innerHTML = qrSvg(actual.url);

    const enlace = document.createElement('p');
    enlace.className = 'enlace-sala';
    enlace.textContent = actual.url;

    const estado = document.createElement('p');
    estado.className = 'estado-sala';
    estado.setAttribute('role', 'status');
    estado.textContent = TEXTO_ESTADO.conectado;

    const acciones = document.createElement('div');
    acciones.className = 'acciones-sala';
    const copiar = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Copiar enlace' });
    copiar.addEventListener('click', () => {
      const url = actual?.url ?? '';
      void copiarTexto(url).then((ok) => op.avisar(ok ? 'Enlace copiado.' : 'No se pudo copiar el enlace.'));
    });
    const terminar = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Dejar de compartir' });
    terminar.addEventListener('click', () => {
      detener();
    });
    acciones.append(copiar, terminar);
    dialogo.append(codigo, qr, enlace, estado, acciones);
  }

  function formularioUnirse(): HTMLElement {
    const f = document.createElement('form');
    f.className = 'unirse';
    const et = document.createElement('label');
    et.textContent = '¿Eres estudiante? Escribe el código de la sala ';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.maxLength = 8;
    inp.autocomplete = 'off';
    inp.setAttribute('aria-label', 'Código de la sala');
    inp.className = 'campo-codigo';
    et.append(inp);
    const ir = Object.assign(document.createElement('button'), { type: 'submit', textContent: 'Entrar' });
    f.append(et, ir);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const c = normalizarCodigo(inp.value);
      if (!c) {
        op.avisar('El código tiene 5 letras o números (sin 0, 1, O ni I).');
        return;
      }
      location.href = enlaceSala(c);
    });
    return f;
  }

  boton.addEventListener('click', () => {
    pintar();
    dialogo.showModal();
  });
  pintarBoton();
  return { boton, transmision: () => actual };
}
