import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { surfaceVariation } from './surface';

const seed = fc.integer({ min: 0, max: 0xffffffff });
const coord = fc.double({ min: -8000, max: 8000, noNaN: true });

describe('surfaceVariation (variations d’aspect du sol, sans effet sur les hauteurs)', () => {
  it('déterministe, chaque valeur dans [-1, 1]', () => {
    fc.assert(
      fc.property(seed, coord, coord, (s, x, z) => {
        const v = surfaceVariation(s, x, z);
        expect(v).toEqual(surfaceVariation(s, x, z));
        for (const k of [v.patch, v.snowJitter]) {
          expect(k).toBeGreaterThanOrEqual(-1);
          expect(k).toBeLessThanOrEqual(1);
        }
      }),
    );
  });

  it('plaques de grande taille : presque identique à 2 m, nettement différent quelque part à 100 m', () => {
    fc.assert(
      fc.property(seed, coord, coord, (s, x, z) => {
        // Borne : étirement 2 × pente max du bruit 2,75 × fréquence 1/90 × Σ(gain·lacunarité)^o (3) / Σgain^o (1,75)
        // ≈ 0,105 par mètre, soit ≤ 0,21 sur 2 m.
        expect(Math.abs(surfaceVariation(s, x + 2, z).patch - surfaceVariation(s, x, z).patch)).toBeLessThan(0.25);
      }),
    );
    fc.assert(
      fc.property(seed, (s) => {
        let lo = 1, hi = -1;
        for (let i = 0; i < 40; i++) {
          const p = surfaceVariation(s, i * 100 + 13, 7).patch;
          lo = Math.min(lo, p);
          hi = Math.max(hi, p);
        }
        expect(hi - lo).toBeGreaterThan(0.4);
      }),
      { numRuns: 20 },
    );
  });

  it('plaques et limite de neige indépendantes l’une de l’autre', () => {
    fc.assert(
      fc.property(seed, coord, coord, (s, x, z) => {
        const v = surfaceVariation(s, x + 0.37, z + 0.61);
        fc.pre(v.patch !== 0);
        expect(v.snowJitter).not.toBe(v.patch);
      }),
    );
  });
});
