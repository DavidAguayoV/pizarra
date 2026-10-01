/**
 * Tokens de diseño de la pizarra. Fuente de verdad en código; `tokens.css` los refleja
 * (una prueba verifica que no se desvíen; regenerar con `npm run tokens`). Ver docs/ESTILO_INSTA.md.
 *
 * Origen: estilo v2 del proyecto Insta (@problemasfisicauai, `motor/estilo_v2.py`).
 * El tema OSCURO usa esa paleta tal cual. El tema CLARO conserva los mismos tonos y la
 * misma asignación de roles, pero con luminosidad menor para alcanzar contraste AA
 * (≥ 4,5:1) sobre fondo blanco: es una variante del mismo sistema, no un estilo nuevo.
 */

/** Roles de color de la física. Los problemas nombran roles; el tema decide el color. */
export const ROLES_FISICOS = [
  'peso', 'potencial',                                // campo
  'normal', 'tension', 'aplicada', 'momento',         // contacto
  'friccion', 'termica', 'calor', 'trabajo',          // disipación
  'acel', 'velocidad', 'cinetica',                    // movimiento
  'dato', 'resultante',                               // neutro, acento
] as const;
export type RolFisico = (typeof ROLES_FISICOS)[number];

export interface Familias {
  /** Incógnita, resultado, paso actual. Lo que el ojo debe buscar. */
  acento: string;
  campo: string;
  contacto: string;
  disipacion: string;
  movimiento: string;
  neutro: string;
}

export interface PaletaTema {
  nombre: 'claro' | 'oscuro';
  fondo: string;
  panel: string;
  grilla: string;
  /** Línea cada 5 m (derivada: solo gráfica, sin texto encima). */
  grillaFuerte: string;
  texto: string;
  textoSuave: string;
  /** Azul de los subtítulos / elemento activo en los videos (#00AFD8 en oscuro). */
  activo: string;
  cuerpo: string;
  cuerpoBorde: string;
  familias: Familias;
}

/** Rol → familia, igual que en `estilo_v2.py`. */
export const FAMILIA_DE_ROL: Readonly<Record<RolFisico, keyof Familias>> = {
  peso: 'campo', potencial: 'campo',
  normal: 'contacto', tension: 'contacto', aplicada: 'contacto', momento: 'contacto',
  friccion: 'disipacion', termica: 'disipacion', calor: 'disipacion', trabajo: 'disipacion',
  acel: 'movimiento', velocidad: 'movimiento', cinetica: 'movimiento',
  dato: 'neutro', resultante: 'acento',
};

export const OSCURO: PaletaTema = {
  nombre: 'oscuro',
  fondo: '#0A1320',
  panel: '#15263D',
  grilla: '#18304D',
  grillaFuerte: '#2A4A70',
  texto: '#F4F7FB',
  textoSuave: '#8FA3BF',
  activo: '#00AFD8',
  cuerpo: '#1C3352',
  cuerpoBorde: '#8CB8E8',
  familias: {
    acento: '#FFC53D', campo: '#FF6B6B', contacto: '#4FC3F7',
    disipacion: '#B79CFF', movimiento: '#3DDC97', neutro: '#B8C7DA',
  },
};

export const CLARO: PaletaTema = {
  nombre: 'claro',
  fondo: '#FFFFFF',
  panel: '#F1F5F9',
  grilla: '#E2E8F0',
  grillaFuerte: '#C3CFDF',
  texto: '#0B1320',
  textoSuave: '#4A5A70',
  activo: '#00708F',
  cuerpo: '#E6EEF8',
  cuerpoBorde: '#2C3E57',
  familias: {
    acento: '#8A5A00', campo: '#C2343F', contacto: '#0B6FA8',
    disipacion: '#6B45C9', movimiento: '#0B7A4B', neutro: '#4A5A70',
  },
};

export const PALETAS = { claro: CLARO, oscuro: OSCURO } as const;

export function colorDeRol(tema: PaletaTema, rol: RolFisico): string {
  return tema.familias[FAMILIA_DE_ROL[rol]];
}

/** Tipografía heredada de los videos (Segoe UI Variable Display; fallback de sistema). */
export const TIPOGRAFIA = {
  texto: '"Segoe UI Variable Display", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif',
  /** Pendiente: fórmulas en sans (newtxsf en los videos). Ver docs/ESTILO_INSTA.md §5. */
  formulas: '"KaTeX_Main", "Times New Roman", serif',
} as const;

/** Variables CSS de un tema: `--pz-fondo`, `--pz-rol-peso`, `--pz-fam-acento`... */
export function variablesCss(tema: PaletaTema): Record<string, string> {
  const v: Record<string, string> = {
    '--pz-fondo': tema.fondo,
    '--pz-panel': tema.panel,
    '--pz-grilla': tema.grilla,
    '--pz-grilla-fuerte': tema.grillaFuerte,
    '--pz-texto': tema.texto,
    '--pz-texto-suave': tema.textoSuave,
    '--pz-activo': tema.activo,
    '--pz-cuerpo': tema.cuerpo,
    '--pz-cuerpo-borde': tema.cuerpoBorde,
  };
  for (const [fam, color] of Object.entries(tema.familias)) v[`--pz-fam-${fam}`] = color;
  for (const rol of ROLES_FISICOS) v[`--pz-rol-${rol}`] = colorDeRol(tema, rol);
  return v;
}
