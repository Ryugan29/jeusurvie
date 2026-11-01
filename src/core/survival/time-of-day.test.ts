import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DAY_LENGTH_S, DUSK_LENGTH_S, NIGHT_LENGTH_S } from '../config/balance';
import { timeOfDay } from './time-of-day';

const CYCLE_S = DAY_LENGTH_S + NIGHT_LENGTH_S;

describe('timeOfDay', () => {
  it('le cycle dure environ 14 min de jour (dont 2 min de crépuscule) et 6 min de nuit', () => {
    expect(DAY_LENGTH_S).toBe(14 * 60);
    expect(DUSK_LENGTH_S).toBe(2 * 60);
    expect(NIGHT_LENGTH_S).toBe(6 * 60);
  });

  it.each([
    [0, 1, 'jour'],
    [DAY_LENGTH_S - DUSK_LENGTH_S - 0.001, 1, 'jour'],
    [DAY_LENGTH_S - DUSK_LENGTH_S, 1, 'crepuscule'],
    [DAY_LENGTH_S - 0.001, 1, 'crepuscule'],
    [DAY_LENGTH_S, 1, 'nuit'],
    [CYCLE_S - 0.001, 1, 'nuit'],
    [CYCLE_S, 2, 'jour'],
    [10 * CYCLE_S + DAY_LENGTH_S, 11, 'nuit'],
  ] as const)('à %s s : jour n°%s, phase %s', (elapsed, day, phase) => {
    const t = timeOfDay(elapsed);
    expect(t.day).toBe(day);
    expect(t.phase).toBe(phase);
  });

  it('dayFraction avance de 0 (lever du jour) à 1 (fin de la nuit) sur un cycle', () => {
    expect(timeOfDay(0).dayFraction).toBe(0);
    expect(timeOfDay(CYCLE_S / 2).dayFraction).toBeCloseTo(0.5, 12);
    expect(timeOfDay(CYCLE_S).dayFraction).toBe(0);
  });

  it('propriétés : jour entier ≥ 1, dayFraction dans [0, 1), phase cohérente avec dayFraction', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e7, noNaN: true }), (elapsed) => {
        const t = timeOfDay(elapsed);
        expect(Number.isInteger(t.day) && t.day >= 1).toBe(true);
        expect(t.dayFraction).toBeGreaterThanOrEqual(0);
        expect(t.dayFraction).toBeLessThan(1);
        const s = t.dayFraction * CYCLE_S;
        const expected = s < DAY_LENGTH_S - DUSK_LENGTH_S - 1e-6 ? 'jour' : s < DAY_LENGTH_S - 1e-6 ? 'crepuscule' : 'nuit';
        if (Math.abs(s - (DAY_LENGTH_S - DUSK_LENGTH_S)) > 1e-3 && Math.abs(s - DAY_LENGTH_S) > 1e-3) expect(t.phase).toBe(expected);
      }),
    );
  });

  it('un temps négatif ou non fini est traité comme 0 (jamais de NaN)', () => {
    expect(timeOfDay(-5)).toEqual(timeOfDay(0));
    expect(timeOfDay(Number.NaN)).toEqual(timeOfDay(0));
  });
});
