// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { crearMontaje } from '../src/grafo/montajes';
import { anunciarSeleccion, describirElemento, resumenEscena } from '../src/ui/describir';

describe('descripciones para lectores de pantalla', () => {
  const at = crearMontaje('atwood', { x: 0, y: 0 }, []);

  it('resume la escena por tipo, en singular y plural', () => {
    expect(resumenEscena([])).toBe('La pizarra está vacía.');
    expect(resumenEscena(at)).toBe('En la pizarra: 1 polea, 2 bloques y 1 cuerda.');
  });

  it('describe cada objeto con sus datos y dónde está, sin marcas de LaTeX', () => {
    const [pol, b1, , c] = at;
    expect(describirElemento(b1!)).toBe('Bloque m₁ de 2 kg en x = -0,25 m, y = -0,3 m');
    expect(describirElemento(pol!)).toBe('Polea de radio 0,25 m en x = 0 m, y = 1,5 m');
    expect(describirElemento(c!)).toBe('Cuerda que pasa por 1 polea, con 2 extremos unidos');
    const pl = crearMontaje('plano', { x: 0, y: 0 }, [], { conRoce: true })[0]!;
    expect(describirElemento(pl)).toBe('Plano inclinado de 4 m a 30°, con roce (μs 0,4, μk 0,3)');
  });

  it('el anuncio de la selección incluye las teclas', () => {
    expect(anunciarSeleccion([])).toBe('Nada seleccionado.');
    expect(anunciarSeleccion([at[1]!])).toContain('Flechas para mover');
    expect(anunciarSeleccion(at)).toMatch(/^4 elementos seleccionados/);
  });
});
