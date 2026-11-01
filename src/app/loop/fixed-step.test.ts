import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SIM_HZ } from '../../core/config/balance';
import { advance, MAX_FRAME_MS } from './fixed-step';

const STEP = 1000 / SIM_HZ;

describe('advance (pas fixe)', () => {
  it('une image de la durée d’un tick donne exactement un tick', () => {
    const r = advance(0, STEP, STEP, 5);
    expect(r.steps).toBe(1);
    expect(r.accMs).toBeCloseTo(0, 9);
  });

  it('les petites images s’accumulent jusqu’au tick suivant', () => {
    let acc = 0;
    const steps: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = advance(acc, 10, STEP, 5);
      steps.push(r.steps);
      acc = r.accMs;
    }
    expect(steps).toEqual([0, 0, 0, 1]);
    expect(acc).toBeCloseTo(40 - STEP, 9);
  });

  it(`une image très longue est plafonnée à ${250} ms et à maxSteps ticks, sans retard qui s’accumule`, () => {
    expect(MAX_FRAME_MS).toBe(250);
    const r = advance(0, 5000, STEP, 5);
    expect(r.steps).toBe(5);
    expect(r.accMs).toBeLessThan(STEP);
  });

  it('une durée négative ou non finie compte pour 0', () => {
    expect(advance(7, -20, STEP, 5)).toEqual(advance(7, 0, STEP, 5));
    expect(advance(7, Number.NaN, STEP, 5)).toEqual(advance(7, 0, STEP, 5));
  });

  it('propriétés : 0 ≤ ticks ≤ maxSteps, 0 ≤ alpha < 1, et sans plafond le temps est conservé', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: STEP, maxExcluded: true, noNaN: true }),
        fc.double({ min: 0, max: 400, noNaN: true }),
        fc.integer({ min: 1, max: 8 }),
        (acc, frame, maxSteps) => {
          const r = advance(acc, frame, STEP, maxSteps);
          expect(r.steps).toBeGreaterThanOrEqual(0);
          expect(r.steps).toBeLessThanOrEqual(maxSteps);
          expect(r.alpha).toBeGreaterThanOrEqual(0);
          expect(r.alpha).toBeLessThan(1);
          expect(r.alpha).toBeCloseTo(r.accMs / STEP, 9);
          const capped = Math.min(frame, MAX_FRAME_MS);
          if (acc + capped < (maxSteps + 1) * STEP) expect(r.steps * STEP + r.accMs).toBeCloseTo(acc + capped, 6);
        },
      ),
    );
  });
});
