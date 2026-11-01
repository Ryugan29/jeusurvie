import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hash2 } from './hash';

const int32 = fc.integer({ min: -0x80000000, max: 0x7fffffff });
const seed = fc.integer({ min: 0, max: 0xffffffff });

describe('hash2', () => {
  it('est déterministe et rend un entier non signé 32 bits', () => {
    fc.assert(
      fc.property(seed, int32, int32, int32, (s, x, z, salt) => {
        const h = hash2(s, x, z, salt);
        expect(h).toBe(hash2(s, x, z, salt));
        expect(Number.isInteger(h)).toBe(true);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(0xffffffff);
      }),
    );
  });

  it('répartit grossièrement uniformément des entrées voisines (16 paquets sur les bits de poids fort)', () => {
    const SAMPLES = 4096, BUCKETS = 16, expected = SAMPLES / BUCKETS;
    fc.assert(
      fc.property(seed, fc.integer({ min: -1_000_000, max: 1_000_000 }), int32, int32, (s, x0, z, salt) => {
        const buckets = new Array<number>(BUCKETS).fill(0);
        for (let i = 0; i < SAMPLES; i++) {
          const b = hash2(s, x0 + i, z, salt) >>> 28;
          buckets[b] = (buckets[b] ?? 0) + 1;
        }
        for (const count of buckets) {
          expect(count).toBeGreaterThan(expected * 0.6);
          expect(count).toBeLessThan(expected * 1.4);
        }
      }),
      { numRuns: 20 },
    );
  });

  it("distingue chaque argument : x et z ne sont pas interchangeables, seed et salt comptent", () => {
    fc.assert(
      fc.property(seed, int32, int32, int32, (s, x, z, salt) => {
        fc.pre(x !== z);
        const h = hash2(s, x, z, salt);
        expect(hash2(s, z, x, salt)).not.toBe(h);
        expect(hash2((s + 1) >>> 0, x, z, salt)).not.toBe(h);
        expect(hash2(s, x, z, (salt + 1) | 0)).not.toBe(h);
      }),
    );
  });

  it("n'a pas de point fixe à zéro : des entrées toutes nulles ne donnent pas 0", () => {
    expect(hash2(0, 0, 0, 0)).not.toBe(0);
  });
});
