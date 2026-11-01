import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, CHUNK_VERTS, chunkCoordOf, chunkKey, generateChunk } from './chunk';
import { heightAt } from './terrain';

const N = CHUNK_VERTS - 1;

describe('generateChunk', () => {
  it('deux chunks voisins ont exactement les mêmes hauteurs sur leur bord commun', () => {
    const a = generateChunk(12345, 0, 0), b = generateChunk(12345, 1, 0);
    for (let i = 0; i <= N; i++) expect(b.heights[i * (N + 1)]).toBe(a.heights[i * (N + 1) + N]);
  });

  it('deux chunks voisins en Z ont exactement les mêmes hauteurs sur leur bord commun', () => {
    const a = generateChunk(12345, 0, 0), b = generateChunk(12345, 0, 1);
    for (let i = 0; i <= N; i++) expect(b.heights[i]).toBe(a.heights[N * (N + 1) + i]);
  });

  it('bords communs identiques pour toute graine et tout chunk du monde (X et Z)', () => {
    const chunkCoord = fc.integer({ min: -125, max: 124 }); // ±8 km / 64 m
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), chunkCoord, chunkCoord, (seed, cx, cz) => {
        const a = generateChunk(seed, cx, cz), east = generateChunk(seed, cx + 1, cz), south = generateChunk(seed, cx, cz + 1);
        for (let i = 0; i <= N; i++) {
          expect(east.heights[i * (N + 1)]).toBe(a.heights[i * (N + 1) + N]);
          expect(south.heights[i]).toBe(a.heights[N * (N + 1) + i]);
        }
      }),
      { numRuns: 50 },
    );
  });

  it('contrat : chaque sommet vaut fround(heightAt) aux coordonnées monde (cx·64 + col·2, cz·64 + row·2)', () => {
    const chunkCoord = fc.integer({ min: -125, max: 124 });
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), chunkCoord, chunkCoord, (seed, cx, cz) => {
        const chunk = generateChunk(seed, cx, cz);
        expect(chunk.heights.length).toBe(CHUNK_VERTS * CHUNK_VERTS);
        for (let row = 0; row < CHUNK_VERTS; row++) {
          for (let col = 0; col < CHUNK_VERTS; col++) {
            const expected = Math.fround(heightAt(seed, cx * CHUNK_SIZE + col * 2, cz * CHUNK_SIZE + row * 2));
            expect(chunk.heights[row * CHUNK_VERTS + col]).toBe(expected);
          }
        }
      }),
      { numRuns: 30 },
    );
  });

  it('même graine ⇒ chunk identique', () => {
    const a = generateChunk(777, -3, 5), b = generateChunk(777, -3, 5);
    expect(b).toEqual(a);
    expect(b.genVersion).toBe(1);
  });

  it('graines différentes ⇒ au moins 90 % de hauteurs différentes', () => {
    const a = generateChunk(1, 2, -4), b = generateChunk(2, 2, -4);
    let different = 0;
    for (let i = 0; i < a.heights.length; i++) if (a.heights[i] !== b.heights[i]) different++;
    expect(different / a.heights.length).toBeGreaterThanOrEqual(0.9);
  });

  it('chunkKey : une clé texte unique par chunk', () => {
    expect(chunkKey(3, -2)).toBe('3,-2');
    expect(chunkKey(-3, 2)).not.toBe(chunkKey(3, -2));
  });

  it('chunkCoordOf : le chunk qui contient un point du monde (bord ouest/nord inclus)', () => {
    expect(chunkCoordOf(0, 0)).toEqual({ cx: 0, cz: 0 });
    expect(chunkCoordOf(63.999, 64)).toEqual({ cx: 0, cz: 1 });
    expect(chunkCoordOf(-0.001, -64)).toEqual({ cx: -1, cz: -1 });
    // Plus petit négatif représentable : la division s'arrondit à -0, le point est pourtant à l'ouest de 0.
    expect(chunkCoordOf(-Number.MIN_VALUE, 0)).toEqual({ cx: -1, cz: 0 });
    // -0 est l'origine : chunk 0 (et pas -0, qui donnerait une autre clé dans certains contextes).
    const origin = chunkCoordOf(-0, -0);
    expect(Object.is(origin.cx, 0) && Object.is(origin.cz, 0)).toBe(true);
    fc.assert(
      fc.property(fc.double({ min: -9000, max: 9000, noNaN: true }), fc.double({ min: -9000, max: 9000, noNaN: true }), (x, z) => {
        const { cx, cz } = chunkCoordOf(x, z);
        expect(x).toBeGreaterThanOrEqual(cx * CHUNK_SIZE);
        expect(x).toBeLessThan((cx + 1) * CHUNK_SIZE);
        expect(z).toBeGreaterThanOrEqual(cz * CHUNK_SIZE);
        expect(z).toBeLessThan((cz + 1) * CHUNK_SIZE);
      }),
    );
  });
});
