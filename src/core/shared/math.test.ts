import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { smoothstep } from './math';

describe('smoothstep (transition douce de 0 à 1)', () => {
  it('0 avant edge0, 1 après edge1, 0,5 au milieu', () => {
    expect(smoothstep(2, 4, 1)).toBe(0);
    expect(smoothstep(2, 4, 5)).toBe(1);
    expect(smoothstep(2, 4, 3)).toBe(0.5);
  });

  it('croissante et dans [0, 1]', () => {
    fc.assert(
      fc.property(fc.double({ min: -10, max: 10, noNaN: true }), fc.double({ min: 0, max: 5, noNaN: true }), (x, dx) => {
        const a = smoothstep(-3, 4, x), b = smoothstep(-3, 4, x + dx);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(1);
        expect(b).toBeGreaterThanOrEqual(a);
      }),
    );
  });
});
