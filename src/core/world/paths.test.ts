import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { pathAt } from './paths';

const seed = fc.integer({ min: 0, max: 0xffffffff });
const coord = fc.double({ min: -8000, max: 8000, noNaN: true });
const SEED = 12345;

/** Intervalles [début, fin] (m) le long d'une droite où pathAt dépasse `level`, pas de `step` m. */
function runs(s: number, from: [number, number], dir: [number, number], length: number, level: number, step: number): [number, number][] {
  const out: [number, number][] = [];
  let start: number | undefined;
  for (let t = 0; t <= length; t += step) {
    const inside = pathAt(s, from[0] + dir[0] * t, from[1] + dir[1] * t) > level;
    if (inside && start === undefined) start = t;
    if (!inside && start !== undefined) {
      out.push([start, t - step]);
      start = undefined;
    }
  }
  return out;
}

/**
 * Largeurs (m), perpendiculaires au sentier, de tous les sentiers franchis par la ligne z = z0 : la ligne x les coupe
 * en biais (largeur wx = w / |sin θ|), la ligne z aussi (wz = w / |cos θ|) → 1 / w² = 1 / wx² + 1 / wz².
 */
function widthsAlongX(s: number, z0: number, level: number): number[] {
  const out: number[] = [];
  for (const [a, b] of runs(s, [0, z0], [1, 0], 1500, level, 0.05)) {
    const wx = b - a + 0.05;
    const cx = (a + b) / 2;
    // Même sentier, mesuré selon z : on cherche l'intervalle de la droite verticale x = cx qui contient z0.
    const vertical = runs(s, [cx, z0 - 12], [0, 1], 24, level, 0.05).find(([c, d]) => c <= 12 && d >= 12);
    if (vertical === undefined) continue;
    const wz = vertical[1] - vertical[0] + 0.05;
    out.push(1 / Math.sqrt(1 / (wx * wx) + 1 / (wz * wz)));
  }
  return out;
}

describe('pathAt (sentiers de terre : 1 au milieu du sentier, 0 hors sentier)', () => {
  it('déterministe, et toujours dans [0, 1]', () => {
    fc.assert(
      fc.property(seed, coord, coord, (s, x, z) => {
        const p = pathAt(s, x, z);
        expect(pathAt(s, x, z)).toBe(p);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('continu : pas de saut entre deux points à 0,5 m', () => {
    fc.assert(
      fc.property(seed, coord, coord, fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }), (s, x, z, ux, uz) => {
        const len = Math.sqrt(ux * ux + uz * uz);
        fc.pre(len > 0.1);
        // Pente maximale du profil : ≈ 1,1 par mètre → ≤ 0,55 sur 0,5 m ; un saut vaudrait 1.
        expect(Math.abs(pathAt(s, x + (0.5 * ux) / len, z + (0.5 * uz) / len) - pathAt(s, x, z))).toBeLessThan(0.7);
      }),
      { numRuns: 300 },
    );
  });

  it('continu aussi sur les bords de sentier : le long de longues droites, 0,5 m d’écart ne change jamais la valeur de plus de 0,7', () => {
    let onEdges = 0;
    for (const [from, dir] of [[[-1000, 0], [1, 0]], [[0, -1000], [0, 1]], [[-800, -800], [0.7071, 0.7071]]] as const) {
      let previous = pathAt(SEED, from[0], from[1]);
      for (let t = 0.5; t <= 2000; t += 0.5) {
        const p = pathAt(SEED, from[0] + dir[0] * t, from[1] + dir[1] * t);
        expect(Math.abs(p - previous)).toBeLessThan(0.7);
        if (p > 0 && p < 1) onEdges++;
        previous = p;
      }
    }
    expect(onEdges).toBeGreaterThan(100); // le test traverse bien des bords de sentier
  });

  it('un sentier croise bien le point en son milieu : la valeur y atteint 1', () => {
    let best = 0;
    for (let x = 0; x < 600; x += 0.05) best = Math.max(best, pathAt(SEED, x, 0));
    expect(best).toBe(1);
  });

  it('largeur visible (niveau 0,5) de 2 à 3 m, bord adouci (la valeur ne passe pas de 0 à 1 d’un coup)', () => {
    const widths = [0, 53, 97, 151, 203].flatMap((z0) => widthsAlongX(SEED, z0, 0.5));
    expect(widths.length).toBeGreaterThan(8);
    widths.sort((a, b) => a - b);
    const median = widths[Math.floor(widths.length / 2)]!;
    expect(median).toBeGreaterThan(2);
    expect(median).toBeLessThan(3);
    // Bord adouci : la zone où la valeur est entre 0,1 et 0,9 est large (≥ 0,6 m de plus que le cœur à 0,9).
    const core = [0, 53, 97].flatMap((z0) => widthsAlongX(SEED, z0, 0.9)).sort((a, b) => a - b);
    const wide = [0, 53, 97].flatMap((z0) => widthsAlongX(SEED, z0, 0.1)).sort((a, b) => a - b);
    expect(wide[Math.floor(wide.length / 2)]! - core[Math.floor(core.length / 2)]!).toBeGreaterThan(0.6);
  });

  it('une part raisonnable du sol est en sentier : de 3 à 10 % (valeur > 0,5), pour plusieurs graines', () => {
    for (const s of [SEED, 1, 777, 4000000000]) {
      let inside = 0, total = 0;
      // Pas de 8 m : 62 500 points par graine suffisent pour une proportion, et le test reste sous le délai en suite complète.
      for (let x = -1000; x < 1000; x += 8) {
        for (let z = -1000; z < 1000; z += 8) {
          total++;
          if (pathAt(s, x + 0.31, z + 0.17) > 0.5) inside++;
        }
      }
      expect(inside / total).toBeGreaterThan(0.03);
      expect(inside / total).toBeLessThan(0.1);
    }
  });

  it('en marchant 150 m, on croise presque toujours un sentier (au moins 80 % des promenades)', () => {
    const directions: [number, number][] = [[1, 0], [0, 1], [0.7071, 0.7071], [0.7071, -0.7071]];
    for (const s of [SEED, 1, 777]) {
      let crossed = 0;
      const walks = 120;
      for (let i = 0; i < walks; i++) {
        const from: [number, number] = [((i * 7919) % 4000) - 2000, ((i * 104729) % 4000) - 2000];
        if (runs(s, from, directions[i % 4]!, 150, 0.5, 1).length > 0) crossed++;
      }
      expect(crossed / walks).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('pas de quadrillage : les sentiers ne suivent pas les axes (autant de croisements selon x que selon z)', () => {
    let alongX = 0, alongZ = 0;
    for (let k = 0; k < 20; k++) {
      alongX += runs(SEED, [-1000, k * 100 - 1000], [1, 0], 2000, 0.5, 0.5).length;
      alongZ += runs(SEED, [k * 100 - 1000, -1000], [0, 1], 2000, 0.5, 0.5).length;
    }
    expect(alongX).toBeGreaterThan(40);
    expect(alongZ).toBeGreaterThan(40);
    expect(Math.abs(alongX - alongZ) / (alongX + alongZ)).toBeLessThan(0.25);
  });

  it('une même graine donne les mêmes sentiers ; deux graines différentes en donnent d’autres', () => {
    const map = (s: number): number[] => {
      const out: number[] = [];
      for (let i = 0; i < 400; i++) out.push(pathAt(s, i * 3.7 - 700, (i * 17) % 900 - 450));
      return out;
    };
    expect(map(SEED)).toEqual(map(SEED));
    expect(map(SEED)).not.toEqual(map(SEED + 1));
  });
});
