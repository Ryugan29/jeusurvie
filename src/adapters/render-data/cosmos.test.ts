import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DAY_LENGTH_S, NIGHT_LENGTH_S } from '../../core/config/balance';
import { timeOfDay } from '../../core/survival/time-of-day';
import { AURORA_MIN, cosmosFor } from './cosmos';

const CYCLE_S = DAY_LENGTH_S + NIGHT_LENGTH_S;
const at = (seconds: number) => cosmosFor(timeOfDay(seconds));

describe('cosmosFor (voûte céleste : rotation des étoiles et de la planète, aurores)', () => {
  it('la voûte fait un tour complet par cycle jour + nuit, en tournant toujours dans le même sens, sans saut', () => {
    expect(at(0).rotation).toBeCloseTo(0, 9);
    expect(at(CYCLE_S / 4).rotation).toBeCloseTo(Math.PI / 2, 6);
    expect(at(CYCLE_S / 2).rotation).toBeCloseTo(Math.PI, 6);
    fc.assert(
      fc.property(fc.double({ min: 0, max: CYCLE_S * 50, noNaN: true }), (t) => {
        const a = at(t).rotation, b = at(t + 1).rotation;
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(2 * Math.PI);
        // 1 s plus tard : un tout petit pas en avant (ou le passage de 2π à 0, le même angle).
        const step = (b - a + 2 * Math.PI) % (2 * Math.PI);
        expect(step).toBeLessThan(0.01);
      }),
    );
  });

  it('des aurores chaque nuit, plus ou moins fortes selon la nuit, la même force toute une nuit', () => {
    const strengths = new Set<number>();
    for (let day = 0; day < 12; day++) {
      const night = at(day * CYCLE_S + 0.85 * CYCLE_S).aurora;
      expect(night).toBeGreaterThanOrEqual(AURORA_MIN);
      expect(night).toBeLessThanOrEqual(1);
      expect(at(day * CYCLE_S + 0.75 * CYCLE_S).aurora).toBe(night);
      strengths.add(Number(night.toFixed(3)));
    }
    expect(strengths.size).toBeGreaterThan(4);
    expect(AURORA_MIN).toBeGreaterThanOrEqual(0.5); // toujours visibles : José veut les voir
  });

  it('déterministe', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e6, noNaN: true }), (t) => {
        expect(at(t)).toEqual(at(t));
      }),
    );
  });
});
