import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { wishDirection } from './intent';

const none = { forward: false, back: false, left: false, right: false };

describe('wishDirection (ZQSD relatif à la caméra)', () => {
  it('aucune touche : immobile', () => {
    expect(wishDirection(none, 1.2)).toEqual({ dx: 0, dz: 0 });
  });

  it('avancer suit le regard ; droite est à droite (lacet 0 : avant = +Z, droite = +X)', () => {
    const f = wishDirection({ ...none, forward: true }, 0);
    expect(f.dx).toBeCloseTo(0, 12);
    expect(f.dz).toBeCloseTo(1, 12);
    const r = wishDirection({ ...none, right: true }, 0);
    expect(r.dx).toBeCloseTo(1, 12);
    expect(r.dz).toBeCloseTo(0, 12);
  });

  it('diagonale normalisée (pas plus rapide en biais) ; touches opposées s’annulent', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean(), fc.double({ min: -10, max: 10, noNaN: true }), (forward, back, left, right, yaw) => {
        const { dx, dz } = wishDirection({ forward, back, left, right }, yaw);
        const len = Math.hypot(dx, dz);
        const moving = forward !== back || left !== right;
        expect(len).toBeCloseTo(moving ? 1 : 0, 9);
      }),
    );
  });
});
