import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { biomeAt, START_BIOME_RADIUS_M } from './biome';

const seed = fc.integer({ min: 0, max: 0xffffffff });
const coord = fc.double({ min: -8000, max: 8000, noNaN: true });

/** 1 000 positions déterministes réparties dans le disque de départ (spirale de Vogel, sans trigonométrie). */
function startPositions(): readonly (readonly [number, number])[] {
  const out: [number, number][] = [];
  // Directions précalculées sur un cercle (8 secteurs × 125 rayons), opérations de base seulement.
  const dirs: readonly (readonly [number, number])[] = [[1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]];
  for (let i = 0; i < 1000; i++) {
    const [dx, dz] = dirs[i % 8]!;
    const r = START_BIOME_RADIUS_M * Math.sqrt((Math.floor(i / 8) + 0.5) / 125);
    out.push([dx * r, dz * r]);
  }
  return out;
}

describe('biomeAt (forêt tempérée / biome froid)', () => {
  it('déterministe, poids du froid et humidité dans [0, 1]', () => {
    fc.assert(
      fc.property(seed, coord, coord, (s, x, z) => {
        const b = biomeAt(s, x, z);
        expect(b).toEqual(biomeAt(s, x, z));
        for (const v of [b.cold, b.humidity]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }),
    );
  });

  // Mesuré : saut maximal 0,031 sur 2 m (3 000 graines × 40 points).
  it('mélange continu près des frontières : jamais de saut entre deux points distants de 2 m', () => {
    fc.assert(
      fc.property(seed, coord, coord, (s, x, z) => {
        expect(Math.abs(biomeAt(s, x + 2, z).cold - biomeAt(s, x, z).cold)).toBeLessThan(0.05);
      }),
    );
  });

  it('le point de départ est en forêt', () => {
    fc.assert(
      fc.property(seed, (s) => {
        expect(biomeAt(s, 0, 0).cold).toBeLessThan(0.2);
      }),
    );
  });

  it('les deux biomes sont garantis dans le rayon de départ (critère S1 : sur 1 000 positions, les deux dominent quelque part)', () => {
    const positions = startPositions();
    fc.assert(
      fc.property(seed, (s) => {
        let forest = 0, cold = 0;
        for (const [x, z] of positions) {
          const c = biomeAt(s, x, z).cold;
          if (c < 0.5) forest++;
          else cold++;
        }
        // Mesuré sur 3 000 graines : au moins 252 positions froides sur 1 000 (la forêt domine au centre).
        expect(forest).toBeGreaterThanOrEqual(150);
        expect(cold).toBeGreaterThanOrEqual(150);
      }),
      { numRuns: 50 },
    );
  });

  it('ailleurs dans le monde, les deux biomes existent aussi (pas seulement près du départ)', () => {
    fc.assert(
      fc.property(seed, (s) => {
        let forest = 0, cold = 0;
        for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) {
          if (i * i + j * j < 4) continue;
          if (biomeAt(s, i * 1000, j * 1000).cold < 0.5) forest++;
          else cold++;
        }
        expect(forest).toBeGreaterThan(0);
        expect(cold).toBeGreaterThan(0);
      }),
      { numRuns: 30 },
    );
  });
});
