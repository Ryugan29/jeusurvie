import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { erodedFbm2, fbm2, gradientNoise2, gradientNoise2D, ridgedFbm2, ridgedMultifractal2 } from './noise';

const seed = fc.integer({ min: 0, max: 0xffffffff });
const lattice = fc.integer({ min: -100_000, max: 100_000 });
const coord = fc.double({ min: -100_000, max: 100_000, noNaN: true });
/** Point franchement à l'intérieur d'une maille (évite les nœuds et les nombres dénormalisés). */
const inCell = fc.tuple(lattice, fc.double({ min: 0.1, max: 0.9, noNaN: true })).map(([i, f]) => i + f);

describe('gradientNoise2', () => {
  it('vaut exactement 0 sur les nœuds entiers de la grille', () => {
    fc.assert(
      fc.property(seed, lattice, lattice, (s, x, z) => {
        expect(gradientNoise2(s, x, z, 0)).toBe(0);
      }),
    );
  });

  it('reste dans [-1, 1]', () => {
    fc.assert(
      fc.property(seed, coord, coord, (s, x, z) => {
        const n = gradientNoise2(s, x, z, 0);
        expect(n).toBeGreaterThanOrEqual(-1);
        expect(n).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('varie entre les nœuds (écart-type nettement non nul sur une zone)', () => {
    fc.assert(
      fc.property(seed, (s) => {
        let sum = 0, sumSq = 0;
        const COUNT = 400;
        for (let i = 0; i < COUNT; i++) {
          const n = gradientNoise2(s, (i % 20) * 0.73 + 0.31, Math.floor(i / 20) * 0.61 + 0.17, 0);
          sum += n;
          sumSq += n * n;
        }
        const mean = sum / COUNT;
        expect(sumSq / COUNT - mean * mean).toBeGreaterThan(0.01);
      }),
      { numRuns: 20 },
    );
  });

  it('est continu : un petit pas donne un petit écart', () => {
    const h = 1e-3;
    fc.assert(
      fc.property(seed, coord, coord, (s, x, z) => {
        const n = gradientNoise2(s, x, z, 0);
        expect(Math.abs(gradientNoise2(s, x + h, z, 0) - n)).toBeLessThanOrEqual(4 * h);
        expect(Math.abs(gradientNoise2(s, x, z + h, 0) - n)).toBeLessThanOrEqual(4 * h);
      }),
    );
  });
});

describe('fbm2', () => {
  const params = fc.record({
    octaves: fc.integer({ min: 1, max: 8 }),
    lacunarity: fc.constantFrom(2, 2.5, 3),
    gain: fc.constantFrom(0.4, 0.5, 0.6),
  });

  it('deux sels différents donnent deux bruits différents (cartes indépendantes pour une même graine)', () => {
    fc.assert(
      fc.property(seed, inCell, inCell, (s, x, z) => {
        const p = { octaves: 3, lacunarity: 2, gain: 0.5 };
        expect(fbm2(s, x, z, p, 1)).not.toBe(fbm2(s, x, z, p, 2));
      }),
    );
  });

  it('reste dans [-1, 1] et est déterministe', () => {
    fc.assert(
      fc.property(seed, coord, coord, params, (s, x, z, p) => {
        const n = fbm2(s, x, z, p, 0);
        expect(n).toBe(fbm2(s, x, z, p, 0));
        expect(n).toBeGreaterThanOrEqual(-1);
        expect(n).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('les octaves ajoutent du détail (5 octaves ≠ 1 octave hors des nœuds)', () => {
    fc.assert(
      fc.property(seed, inCell, inCell, (s, x, z) => {
        const one = fbm2(s, x, z, { octaves: 1, lacunarity: 2, gain: 0.5 }, 0);
        expect(fbm2(s, x, z, { octaves: 5, lacunarity: 2, gain: 0.5 }, 0)).not.toBe(one);
      }),
    );
  });

  it("n'aligne pas les octaves : pas de valeur figée aux nœuds entiers communs, quelle que soit la graine", () => {
    fc.assert(
      fc.property(seed, lattice, lattice, (s, x, z) => {
        expect(fbm2(s, x, z, { octaves: 5, lacunarity: 2, gain: 0.5 }, 0)).not.toBe(0);
      }),
    );
  });

  it.each([0, 65, 1.5, -1, Number.NaN])("refuse un nombre d'octaves hors de 1..64 entier (%s)", (octaves) => {
    expect(() => fbm2(1, 0.5, 0.5, { octaves, lacunarity: 2, gain: 0.5 }, 0)).toThrow(RangeError);
  });

  it.each([1, 64])('accepte %s octave(s)', (octaves) => {
    expect(Number.isFinite(fbm2(1, 0.5, 0.5, { octaves, lacunarity: 2, gain: 0.5 }, 0))).toBe(true);
  });
});

describe('ridgedFbm2 (bruit à crêtes, pour les montagnes)', () => {
  const p = { octaves: 4, lacunarity: 2, gain: 0.5 };

  it('reste dans [0, 1] et est déterministe', () => {
    fc.assert(
      fc.property(seed, coord, coord, (s, x, z) => {
        const r = ridgedFbm2(s, x, z, p, 0);
        expect(r).toBe(ridgedFbm2(s, x, z, p, 0));
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('avec une octave : (1 − |fbm|)², donc maximal (crête) là où le bruit s’annule', () => {
    fc.assert(
      fc.property(seed, inCell, inCell, (s, x, z) => {
        const one = { octaves: 1, lacunarity: 2, gain: 0.5 };
        const n = fbm2(s, x, z, one, 7);
        expect(ridgedFbm2(s, x, z, one, 7)).toBeCloseTo((1 - Math.abs(n)) * (1 - Math.abs(n)), 12);
      }),
    );
  });

  it('a des crêtes marquées : sur une zone, des valeurs proches de 1 et d’autres nettement plus basses', () => {
    fc.assert(
      fc.property(seed, (s) => {
        let lo = 1, hi = 0;
        for (let i = 0; i < 400; i++) {
          const r = ridgedFbm2(s, (i % 20) * 0.37 + 0.11, Math.floor(i / 20) * 0.41 + 0.07, p, 0);
          lo = Math.min(lo, r);
          hi = Math.max(hi, r);
        }
        expect(hi).toBeGreaterThan(0.75);
        expect(hi - lo).toBeGreaterThan(0.35);
      }),
      { numRuns: 20 },
    );
  });
});

describe('gradientNoise2D (valeur + dérivées analytiques)', () => {
  it('la valeur est exactement celle de gradientNoise2', () => {
    fc.assert(
      fc.property(seed, coord, coord, (s, x, z) => {
        expect(gradientNoise2D(s, x, z, 3).value).toBe(gradientNoise2(s, x, z, 3));
      }),
    );
  });

  it('les dérivées correspondent aux différences finies', () => {
    const h = 1e-5;
    fc.assert(
      fc.property(seed, inCell, inCell, (s, x, z) => {
        const d = gradientNoise2D(s, x, z, 3);
        expect(d.dx).toBeCloseTo((gradientNoise2(s, x + h, z, 3) - gradientNoise2(s, x - h, z, 3)) / (2 * h), 5);
        expect(d.dz).toBeCloseTo((gradientNoise2(s, x, z + h, 3) - gradientNoise2(s, x, z - h, 3)) / (2 * h), 5);
      }),
    );
  });
});

describe('ridgedMultifractal2 (crêtes à poids : le détail suit la crête)', () => {
  const p = { octaves: 6, lacunarity: 2, gain: 0.5 };

  it('reste dans [0, 1] et est déterministe', () => {
    fc.assert(
      fc.property(seed, coord, coord, (s, x, z) => {
        const r = ridgedMultifractal2(s, x, z, p, 0);
        expect(r).toBe(ridgedMultifractal2(s, x, z, p, 0));
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('le détail ne dépasse jamais la crête de la première octave : nul loin des crêtes, plein sur les crêtes', () => {
    fc.assert(
      fc.property(seed, inCell, inCell, (s, x, z) => {
        const first = ridgedFbm2(s, x, z, { octaves: 1, lacunarity: 2, gain: 0.5 }, 0);
        expect(ridgedMultifractal2(s, x, z, p, 0)).toBeLessThanOrEqual(first + 1e-12);
      }),
    );
  });
});

describe('erodedFbm2 (fBm « érodé » : moins de détail sur les pentes)', () => {
  it('avec une octave : même signe que le fBm, jamais plus grand (atténué par sa propre pente)', () => {
    fc.assert(
      fc.property(seed, inCell, inCell, (s, x, z) => {
        const one = { octaves: 1, lacunarity: 2, gain: 0.5 };
        const raw = fbm2(s, x, z, one, 5), value = erodedFbm2(s, x, z, one, 5);
        expect(Math.abs(value)).toBeLessThanOrEqual(Math.abs(raw) + 1e-12);
        expect(value * raw).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('reste dans [-1, 1] et est déterministe', () => {
    const p = { octaves: 5, lacunarity: 2, gain: 0.5 };
    fc.assert(
      fc.property(seed, coord, coord, (s, x, z) => {
        const e = erodedFbm2(s, x, z, p, 2);
        expect(e).toBe(erodedFbm2(s, x, z, p, 2));
        expect(e).toBeGreaterThanOrEqual(-1);
        expect(e).toBeLessThanOrEqual(1);
      }),
    );
  });
});
