// Propriétés du relief. Les seuils viennent d'une mesure sur 3 000 graines (sonde jetable, 2026-10-30), avec une
// marge d'au moins 25 % : la mesure est rappelée à côté de chaque seuil.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PLAYER_MAX_SLOPE } from '../config/balance';
import { CHUNK_SIZE, CHUNK_VERTS } from './chunk';
import { EDGE_BAND_M, TERRAIN_V1, WORLD_RADIUS_M } from './params';
import { heightAt, terrainRegionsAt } from './terrain';

const VERTEX_SPACING = CHUNK_SIZE / (CHUNK_VERTS - 1);

const seed = fc.integer({ min: 0, max: 0xffffffff });
/** Coordonnées monde quelconques dans le carré englobant le monde. */
const worldCoord = fc.double({ min: -WORLD_RADIUS_M, max: WORLD_RADIUS_M, noNaN: true });

/**
 * Point (x, z) du monde jouable : à l'intérieur du disque r < R − bande du bord − marge.
 * La bande du bord (montagnes infranchissables, à venir) a ses propres règles de relief.
 */
function playablePoint(margin = 0): fc.Arbitrary<readonly [number, number]> {
  const r = WORLD_RADIUS_M - EDGE_BAND_M - margin;
  return fc
    .tuple(fc.double({ min: -r, max: r, noNaN: true }), fc.double({ min: -r, max: r, noNaN: true }))
    .filter(([x, z]) => x * x + z * z < r * r);
}

/** Point (x, z) à moins de r mètres de l'origine. */
function playablePointWithin(r: number): fc.Arbitrary<readonly [number, number]> {
  return fc
    .tuple(fc.double({ min: -r, max: r, noNaN: true }), fc.double({ min: -r, max: r, noNaN: true }))
    .filter(([x, z]) => x * x + z * z <= r * r);
}

/** Écart de hauteur le plus fort entre (x, z) et ses voisins à 2 m (en x et en z). */
function neighborStep(s: number, x: number, z: number): number {
  const h = heightAt(s, x, z);
  return Math.max(Math.abs(heightAt(s, x + VERTEX_SPACING, z) - h), Math.abs(heightAt(s, x, z + VERTEX_SPACING) - h));
}

/** Dénivelé (max − min) et sommet d'un carré de `size` m centré en (cx, cz), échantillonné en n × n points. */
function relief(s: number, cx: number, cz: number, size: number, n: number): { range: number; top: number } {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const h = heightAt(s, cx - size / 2 + (i * size) / (n - 1), cz - size / 2 + (j * size) / (n - 1));
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
  }
  return { range: hi - lo, top: hi };
}

describe('heightAt', () => {
  it('dépend de la graine', () => {
    fc.assert(
      fc.property(seed, worldCoord, worldCoord, (s, x, z) => {
        const other = (s + 1) >>> 0;
        const differs = [0, 13.7, 101.3].some((d) => heightAt(s, x + d, z + d) !== heightAt(other, x + d, z + d));
        expect(differs).toBe(true);
      }),
    );
  });

  describe('relief plausible et varié', () => {
    it('hauteur finie et dans les bornes déclarées par les paramètres (monde jouable)', () => {
      expect(TERRAIN_V1.minHeight).toBeLessThan(TERRAIN_V1.maxHeight);
      fc.assert(
        fc.property(seed, playablePoint(), (s, [x, z]) => {
          const h = heightAt(s, x, z);
          expect(Number.isFinite(h)).toBe(true);
          expect(h).toBeGreaterThanOrEqual(TERRAIN_V1.minHeight);
          expect(h).toBeLessThanOrEqual(TERRAIN_V1.maxHeight);
        }),
      );
    });

    // Mesuré : 4,19 m au plus (≈ 64°) sur 72 000 points. Seuil 6 m (pente 3, ≈ 72°) : au-delà, le maillage
    // afficherait une paroi lisse quasi verticale. Les pentes entre 1 (limite du joueur) et 3 existent : falaises.
    it('pas de mur : deux sommets voisins (2 m) diffèrent d’au plus 6 m', () => {
      fc.assert(
        fc.property(seed, playablePoint(VERTEX_SPACING), (s, [x, z]) => {
          expect(neighborStep(s, x, z)).toBeLessThanOrEqual(6);
        }),
        { numRuns: 300 },
      );
    });

    it('promesse du départ : aucune montagne à moins de startCalmRadius (450 m) de l’origine', () => {
      fc.assert(
        fc.property(seed, playablePointWithin(TERRAIN_V1.startCalmRadius), (s, [x, z]) => {
          expect(terrainRegionsAt(s, x, z).mountains).toBe(0);
        }),
      );
    });

    // Mesuré : écart ≤ 1,25 m sur 2 m (pente 0,63) dans les 450 m du départ. Seuil 1,8 m (pente 0,9) :
    // tout le terrain du départ reste praticable (pente du joueur : 1).
    it('autour du départ (450 m), tout est praticable : écart entre voisins ≤ 1,8 m (pente ≤ 0,9)', () => {
      expect(1.8 / VERTEX_SPACING).toBeLessThan(PLAYER_MAX_SLOPE);
      fc.assert(
        fc.property(seed, (s) => {
          for (let x = -450; x <= 450; x += 30) {
            for (let z = -450; z <= 450; z += 30) {
              if (x * x + z * z <= 450 * 450) expect(neighborStep(s, x, z)).toBeLessThanOrEqual(1.8);
            }
          }
        }),
        { numRuns: 15 },
      );
    });

    // Mesuré : au moins 14,1 m. Seuil 10 m.
    it('relief visible dès le départ : au moins 10 m de dénivelé sur 600 m autour de l’origine', () => {
      fc.assert(
        fc.property(seed, (s) => {
          expect(relief(s, 0, 0, 600, 16).range).toBeGreaterThanOrEqual(10);
        }),
        { numRuns: 40 },
      );
    });

    // Mesuré sur 9 × 9 fenêtres de 256 m espacées de 1,4 km : plaine la plus calme ≤ 5,7 m ; zone la plus accidentée
    // ≥ 67 m ; plus haut point ≥ 70 m (médiane 197 m, ≥ 180 m pour 68 % des graines). Seuils : 8 m, 50 m, 50 m.
    it('régions contrastées : des plaines calmes ET des montagnes, sur tout monde', () => {
      fc.assert(
        fc.property(seed, (s) => {
          let calm = Infinity, rugged = 0, top = -Infinity;
          for (let i = -4; i <= 4; i++) {
            for (let j = -4; j <= 4; j++) {
              const r = relief(s, i * 1400 + 37, j * 1400 - 53, 256, 5);
              calm = Math.min(calm, r.range);
              rugged = Math.max(rugged, r.range);
              top = Math.max(top, r.top);
            }
          }
          expect(calm).toBeLessThan(8);
          expect(rugged).toBeGreaterThan(50);
          expect(top).toBeGreaterThan(50);
        }),
        { numRuns: 10 },
      );
    });

    // Mesuré : le 3e plus faible écart-type des 9 fenêtres de 2 km vaut au moins 4,36 m. Seuil 3 m.
    it('dénivelé visible sur 2 km : au moins 7 fenêtres sur 9 ont un écart-type des hauteurs ≥ 3 m', () => {
      fc.assert(
        fc.property(seed, (s) => {
          const stds: number[] = [];
          for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
              let sum = 0, sumSq = 0, n = 0;
              for (let a = 0; a <= 10; a++) {
                for (let b = 0; b <= 10; b++) {
                  const h = heightAt(s, i * 3000 - 1000 + a * 200, j * 3000 - 1000 + b * 200);
                  sum += h;
                  sumSq += h * h;
                  n++;
                }
              }
              const mean = sum / n;
              stds.push(Math.sqrt(Math.max(0, sumSq / n - mean * mean)));
            }
          }
          expect(stds.filter((v) => v >= 3).length).toBeGreaterThanOrEqual(7);
        }),
        { numRuns: 15 },
      );
    });

    // Mesuré : au cœur des montagnes (présence ≥ 0,9), au moins 85 % des points sont praticables (pente ≤ 1),
    // et des pentes infranchissables existent pour un quart des graines. Seuil 60 % : il reste toujours des passages.
    it('en montagne, il reste des passages : au moins 60 % des points du cœur des montagnes sont praticables', () => {
      fc.assert(
        fc.property(seed, (s) => {
          let points = 0, walkable = 0;
          for (let i = -4; i <= 4; i++) {
            for (let j = -4; j <= 4; j++) {
              const cx = i * 1400 + 37, cz = j * 1400 - 53;
              if (terrainRegionsAt(s, cx, cz).mountains < 0.9) continue;
              for (let a = 0; a < 6; a++) {
                points++;
                if (neighborStep(s, cx + a * 17, cz - a * 11) <= PLAYER_MAX_SLOPE * VERTEX_SPACING) walkable++;
              }
            }
          }
          if (points >= 30) expect(walkable / points).toBeGreaterThanOrEqual(0.6);
        }),
        { numRuns: 10 },
      );
    });
  });
});
