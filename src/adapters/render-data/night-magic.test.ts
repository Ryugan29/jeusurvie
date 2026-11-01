import { describe, expect, it } from 'vitest';
import { timeOfDay } from '../../core/survival/time-of-day';
import { DAY_LENGTH_S, NIGHT_LENGTH_S } from '../../core/config/balance';
import { lightingFor } from './lighting';
import { FIREFLIES, fireflyCount, mushroomGlow, nightMagic } from './night-magic';

const at = (fraction: number) => lightingFor(timeOfDay(fraction * (DAY_LENGTH_S + NIGHT_LENGTH_S)));

describe('magie de la nuit (lucioles, champignons luisants)', () => {
  it('rien de jour (matin, midi, crépuscule), pleine au cœur de la nuit', () => {
    for (const f of [0.06, 0.3, 0.5, 0.64]) {
      expect(nightMagic(at(f)), `${f}`).toBe(0);
      expect(fireflyCount(at(f))).toBe(0);
      expect(mushroomGlow(at(f))).toEqual([0, 0, 0]);
    }
    expect(nightMagic(at(0.85))).toBe(1);
    expect(fireflyCount(at(0.85))).toBe(FIREFLIES.count);
  });

  it('monte et descend sans saut le long du cycle', () => {
    let previous = nightMagic(at(0));
    for (let f = 0.001; f <= 1; f += 0.001) {
      const v = nightMagic(at(f));
      expect(Math.abs(v - previous), `${f}`).toBeLessThan(0.05);
      previous = v;
    }
  });

  it('les champignons luisent en cyan (bleu > rouge), sans dépasser 1', () => {
    const [r, g, b] = mushroomGlow(at(0.85));
    expect(b).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(r);
    expect(Math.max(r, g, b)).toBeLessThanOrEqual(1);
  });
});
