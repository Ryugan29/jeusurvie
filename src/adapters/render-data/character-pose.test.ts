import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { meshPositionForFeet } from './character-pose';

describe('meshPositionForFeet (le bas du modèle touche le sol)', () => {
  it('place l’origine du modèle de sorte que son point le plus bas soit exactement aux pieds', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        (x, y, z, meshMinY) => {
          const p = meshPositionForFeet({ x, y, z }, meshMinY);
          expect(p.x).toBe(x);
          expect(p.z).toBe(z);
          expect(p.y + meshMinY).toBeCloseTo(y, 9);
        },
      ),
    );
  });
});
