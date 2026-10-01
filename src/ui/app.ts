import type { Camara, Punto } from '../core/camara';
import { acercarEn, camaraInicial, desplazar, mundoAPantalla, pantallaAMundo } from '../core/camara';
import { escenaInicial, OP_MARCA, reductoresEscena } from '../core/escena';
import type { Escena } from '../core/escena';
import { Store } from '../core/store';
import { alternarTema, colorCss, temaActual } from '../core/tema';

const UMBRAL_ARRASTRE_PX = 5;

function boton(texto: string, titulo: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = texto;
  b.title = titulo;
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Pantalla de la Etapa 0: lienzo con grilla en metros, clic = marca de prueba,
 * arrastre = desplazar, rueda = zoom. Sirve para verificar ops, deshacer/rehacer,
 * cámara y temas; la pizarra real llega en la Etapa 1.
 */
export function montarApp(raiz: HTMLElement): void {
  const store = new Store<Escena>(escenaInicial, reductoresEscena);
  let camara: Camara = camaraInicial();

  const barra = document.createElement('header');
  barra.className = 'barra';
  const titulo = document.createElement('h1');
  titulo.textContent = 'Pizarra de Física';
  const estado = document.createElement('span');
  estado.className = 'estado';
  estado.setAttribute('role', 'status');

  const bDeshacer = boton('Deshacer', 'Deshacer (Ctrl+Z)', () => store.deshacer());
  const bRehacer = boton('Rehacer', 'Rehacer (Ctrl+Y)', () => store.rehacer());
  const bVista = boton('Centrar', 'Volver a la vista inicial (0)', () => {
    camara = camaraInicial();
    pintar();
  });
  const bTema = boton('', 'Alternar tema claro / oscuro (T)', () => {
    alternarTema();
    actualizarBarra();
    pintar();
  });
  barra.append(titulo, bDeshacer, bRehacer, bVista, bTema, estado);

  const lienzo = document.createElement('canvas');
  lienzo.className = 'lienzo';
  lienzo.setAttribute('aria-label', 'Lienzo de la pizarra');
  raiz.append(barra, lienzo);
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');

  let ancho = 0;
  let alto = 0;
  const vista = () => ({ ancho, alto });

  function ajustarTamano(): void {
    const dpr = window.devicePixelRatio || 1;
    ancho = lienzo.clientWidth;
    alto = lienzo.clientHeight;
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    pintar();
  }

  function actualizarBarra(): void {
    bDeshacer.disabled = !store.puedeDeshacer;
    bRehacer.disabled = !store.puedeRehacer;
    bTema.textContent = temaActual() === 'oscuro' ? 'Tema claro' : 'Tema oscuro';
    const n = store.estado.marcas.length;
    estado.textContent = `${n} marca${n === 1 ? '' : 's'} · ${store.ops.length} ops · ${camara.escala.toFixed(0)} px/m`;
  }

  function pintar(): void {
    const c = ctx!;
    c.fillStyle = colorCss('--lienzo-fondo');
    c.fillRect(0, 0, ancho, alto);

    // Grilla: una línea por metro, más marcada cada 5 m; se omite si quedaría muy densa.
    const v = vista();
    const min = pantallaAMundo(camara, v, { x: 0, y: alto });
    const max = pantallaAMundo(camara, v, { x: ancho, y: 0 });
    if (camara.escala >= 12) {
      for (let x = Math.floor(min.x); x <= Math.ceil(max.x); x++) {
        const px = mundoAPantalla(camara, v, { x, y: 0 }).x;
        c.strokeStyle = colorCss(x % 5 === 0 ? '--grilla-fuerte' : '--grilla');
        c.lineWidth = x === 0 ? 2 : 1;
        c.beginPath();
        c.moveTo(px, 0);
        c.lineTo(px, alto);
        c.stroke();
      }
      for (let y = Math.floor(min.y); y <= Math.ceil(max.y); y++) {
        const py = mundoAPantalla(camara, v, { x: 0, y }).y;
        c.strokeStyle = colorCss(y % 5 === 0 ? '--grilla-fuerte' : '--grilla');
        c.lineWidth = y === 0 ? 2 : 1;
        c.beginPath();
        c.moveTo(0, py);
        c.lineTo(ancho, py);
        c.stroke();
      }
    }

    c.fillStyle = colorCss('--tinta');
    for (const m of store.estado.marcas) {
      const p = mundoAPantalla(camara, v, m);
      c.beginPath();
      c.arc(p.x, p.y, 7, 0, Math.PI * 2);
      c.fill();
    }
    actualizarBarra();
  }

  // --- Entrada: Pointer Events unificados (mouse, lápiz, dedo) ---
  let inicio: Punto | null = null;
  let ultimo: Punto | null = null;
  let arrastrando = false;

  lienzo.addEventListener('pointerdown', (e) => {
    lienzo.setPointerCapture(e.pointerId);
    inicio = ultimo = { x: e.offsetX, y: e.offsetY };
    arrastrando = false;
  });
  lienzo.addEventListener('pointermove', (e) => {
    if (!inicio || !ultimo) return;
    const p = { x: e.offsetX, y: e.offsetY };
    if (!arrastrando && Math.hypot(p.x - inicio.x, p.y - inicio.y) > UMBRAL_ARRASTRE_PX) {
      arrastrando = true;
    }
    if (arrastrando) {
      camara = desplazar(camara, p.x - ultimo.x, p.y - ultimo.y);
      pintar();
    }
    ultimo = p;
  });
  lienzo.addEventListener('pointerup', (e) => {
    if (inicio && !arrastrando) {
      store.emitir(OP_MARCA, pantallaAMundo(camara, vista(), { x: e.offsetX, y: e.offsetY }));
    }
    inicio = ultimo = null;
  });
  lienzo.addEventListener('pointercancel', () => {
    inicio = ultimo = null;
  });
  lienzo.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      camara = acercarEn(camara, vista(), { x: e.offsetX, y: e.offsetY }, Math.exp(-e.deltaY * 0.0015));
      pintar();
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) store.rehacer();
      else store.deshacer();
    } else if ((e.ctrlKey || e.metaKey) && k === 'y') {
      e.preventDefault();
      store.rehacer();
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey && k === 't') {
      alternarTema();
      pintar();
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey && k === '0') {
      camara = camaraInicial();
      pintar();
    }
  });

  store.suscribir(pintar);
  new ResizeObserver(ajustarTamano).observe(lienzo);
  ajustarTamano();
}
