import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LENS, lensRainTarget, stepLensWetness } from './lens-drops';

const unit = fc.double({ min: 0, max: 1, noNaN: true });
const pitch = fc.double({ min: -1.5, max: 1.5, noNaN: true });

describe('lensRainTarget (gouttes que la pluie dépose sur l’objectif)', () => {
  it('aucune goutte sans pluie ; toujours dans [0, 1]', () => {
    fc.assert(
      fc.property(unit, pitch, (rain, p) => {
        expect(lensRainTarget(0, p)).toBe(0);
        const t = lensRainTarget(rain, p);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('des gouttes dès qu’il pleut, même caméra baissée ; davantage quand on lève les yeux au ciel', () => {
    // −0,35 rad : la caméra levée au maximum (MIN_PITCH de app/camera/camera-rig).
    const down = lensRainTarget(1, 0.6), level = lensRainTarget(1, 0), up = lensRainTarget(1, -0.35);
    expect(down).toBeGreaterThan(0.3);
    expect(level).toBeGreaterThan(down);
    expect(up).toBeGreaterThan(level);
    expect(up).toBeCloseTo(1, 6);
  });

  it('plus il pleut, plus il y a de gouttes', () => {
    fc.assert(
      fc.property(pitch, (p) => {
        expect(lensRainTarget(0.3, p)).toBeLessThan(lensRainTarget(0.9, p));
      }),
    );
  });
});

describe('stepLensWetness (l’objectif se mouille vite et sèche lentement)', () => {
  it('se rapproche de la cible sans la dépasser, reste dans [0, 1]', () => {
    fc.assert(
      fc.property(unit, unit, fc.double({ min: 0, max: 5, noNaN: true }), (current, target, dt) => {
        const next = stepLensWetness(current, target, dt);
        expect(next).toBeGreaterThanOrEqual(Math.min(current, target) - 1e-12);
        expect(next).toBeLessThanOrEqual(Math.max(current, target) + 1e-12);
      }),
    );
  });

  it('mouillé en quelques LENS.wetUpS sous la pluie ; il sèche plus lentement qu’il ne se mouille', () => {
    let w = 0, wetHalf = 0;
    for (let t = 0; t < LENS.wetUpS * 4; t += 1 / 60) {
      w = stepLensWetness(w, 1, 1 / 60);
      if (wetHalf === 0 && w > 0.5) wetHalf = t;
    }
    expect(w).toBeGreaterThan(0.9);
    let dryHalf = 0;
    for (let t = 0; t < LENS.dryS * 4; t += 1 / 60) {
      w = stepLensWetness(w, 0, 1 / 60);
      if (dryHalf === 0 && w < 0.5) dryHalf = t;
    }
    expect(w).toBeLessThan(0.1);
    expect(dryHalf).toBeGreaterThan(wetHalf * 2);
  });

  it('une durée nulle ou absurde ne change rien', () => {
    for (const dt of [0, -1, Number.NaN]) expect(stepLensWetness(0.4, 1, dt)).toBe(0.4);
  });
});
