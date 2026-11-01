import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { heightInQuad, quadTriangles } from './triangulation';

// -0 et +0 sont la même hauteur : on compare numériquement (===), pas avec Object.is.
const h = fc.double({ min: -100, max: 100, noNaN: true });
const unit = fc.double({ min: 0, max: 1, noNaN: true });

describe('triangulation des chunks (partagée par le maillage et le sol)', () => {
  it('chaque quad est coupé par UNE diagonale fixe, du coin (col,row) au coin (col+1,row+1)', () => {
    const V = 33;
    const t = quadTriangles(4, 7, V);
    const a = 7 * V + 4, b = a + 1, c = a + V, d = c + 1;
    expect([...t].sort((p, q) => p - q)).toEqual([a, a, b, c, d, d]);
    expect(t.slice(0, 3)).toContain(a);
    expect(t.slice(0, 3)).toContain(d);
    expect(t.slice(3, 6)).toContain(a);
    expect(t.slice(3, 6)).toContain(d);
  });

  it('ordre des sommets = face visible vue de dessus en repère main gauche : produit vectoriel standard vers le bas', () => {
    const V = 3;
    const pos = (i: number): [number, number, number] => [(i % V) * 2, 0, Math.floor(i / V) * 2];
    const t = quadTriangles(1, 1, V);
    for (const tri of [t.slice(0, 3), t.slice(3, 6)]) {
      const [p0, p1, p2] = tri.map(pos) as [[number, number, number], [number, number, number], [number, number, number]];
      const e1 = [p1[0] - p0[0], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[2] - p0[2]];
      const crossY = e1[1]! * e2[0]! - e1[0]! * e2[1]!;
      expect(crossY).toBeLessThan(0);
    }
  });

  it('heightInQuad passe exactement par les 4 coins', () => {
    fc.assert(
      fc.property(h, h, h, h, (h00, h10, h01, h11) => {
        expect(heightInQuad(h00, h10, h01, h11, 0, 0) === h00).toBe(true);
        expect(heightInQuad(h00, h10, h01, h11, 1, 0)).toBeCloseTo(h10, 9);
        expect(heightInQuad(h00, h10, h01, h11, 0, 1)).toBeCloseTo(h01, 9);
        expect(heightInQuad(h00, h10, h01, h11, 1, 1)).toBeCloseTo(h11, 9);
      }),
    );
  });

  it('est continue sur la diagonale et linéaire par morceaux de part et d’autre', () => {
    fc.assert(
      fc.property(h, h, h, h, unit, (h00, h10, h01, h11, t) => {
        const onDiag = h00 + t * (h11 - h00);
        expect(heightInQuad(h00, h10, h01, h11, t, t)).toBeCloseTo(onDiag, 9);
        expect(heightInQuad(h00, h10, h01, h11, t, t * 0.999999)).toBeCloseTo(onDiag, 3);
        expect(heightInQuad(h00, h10, h01, h11, t * 0.999999, t)).toBeCloseTo(onDiag, 3);
      }),
    );
  });
});
