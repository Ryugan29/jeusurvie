import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DAY_LENGTH_S, NIGHT_LENGTH_S } from '../../core/config/balance';
import { timeOfDay } from '../../core/survival/time-of-day';
import {
  HAZE_LIGHTEN,
  distanceFogVisibilityFor,
  fogAmount,
  fogDensityFor,
  fogVisibility,
  hazeColor,
  hazeHorizonWeight,
  heightFogAmount,
  heightFogFor,
} from './fog';
import { lightingFor, luminance } from './lighting';
import type { Rgb } from './palette';

const CYCLE_S = DAY_LENGTH_S + NIGHT_LENGTH_S;
const at = (fraction: number) => timeOfDay(fraction * CYCLE_S);
const saturation = (c: Rgb): number => Math.max(...c) - Math.min(...c);

describe('brume de distance exponentielle (EXP) : visibilité = exp(−d · densité)', () => {
  it('formule EXP (et non EXP2) : présente dès les distances moyennes', () => {
    expect(fogVisibility(200, 0.01)).toBeCloseTo(Math.exp(-2), 12);
  });

  it('la densité calculée donne exactement la visibilité voulue à la distance voulue', () => {
    fc.assert(
      fc.property(fc.double({ min: 50, max: 5000, noNaN: true }), fc.double({ min: 0.001, max: 0.9, noNaN: true }), (d, v) => {
        expect(fogVisibility(d, fogDensityFor(d, v))).toBeCloseTo(v, 9);
      }),
    );
  });

  it('réglage de la démo (vue 512 m, 8 % de visibilité au bord) : brume lisible à 100 m, montagnes lointaines encore lisibles', () => {
    const view = 512;
    const density = fogDensityFor(view, 0.08);
    expect(fogVisibility(view, density)).toBeCloseTo(0.08, 9); // le reste du bord se fond dans le bas du ciel (hazeHorizon)
    expect(fogVisibility(100, density)).toBeLessThan(0.65); // l'ancienne brume EXP2 laissait 81 % à 100 m
    expect(fogVisibility(300, density)).toBeGreaterThan(0.2); // une chaîne à 300 m reste lisible
    expect(fogVisibility(15, density)).toBeGreaterThan(0.9); // autour du joueur : net
  });

  it.each([
    [400, 0],
    [400, 1],
    [400, -0.1],
    [400, Number.NaN],
    [0, 0.03],
    [-5, 0.03],
    [Number.POSITIVE_INFINITY, 0.03],
  ])('refuse un réglage absurde (distance %s, visibilité %s) : erreur de programmation', (d, v) => {
    expect(() => fogDensityFor(d, v)).toThrow(RangeError);
  });
});

describe('fogAmount (part de brume à une distance = 1 − visibilité)', () => {
  it('nulle sur place, complémentaire de la visibilité, croissante avec la distance, toujours dans [0, 1]', () => {
    expect(fogAmount(0, 0.02)).toBe(0);
    expect(fogAmount(100, 0.02)).toBeCloseTo(1 - Math.exp(-2), 12);
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 5000, noNaN: true }),
        fc.double({ min: 0, max: 0.2, noNaN: true }),
        fc.double({ min: 0, max: 500, noNaN: true }),
        (d, density, dd) => {
          const a = fogAmount(d, density);
          expect(a).toBeGreaterThanOrEqual(0);
          expect(a).toBeLessThanOrEqual(1);
          expect(a + fogVisibility(d, density)).toBeCloseTo(1, 12);
          expect(fogAmount(d + dd, density)).toBeGreaterThanOrEqual(a);
        },
      ),
    );
  });

  it('exemple de réglage : 12 % de visibilité à 60 m, c’est 88 % de brume à 60 m et ~19 % à 6 m', () => {
    const density = fogDensityFor(60, 0.12);
    expect(fogAmount(60, density)).toBeCloseTo(0.88, 9);
    expect(fogAmount(6, density)).toBeCloseTo(1 - 0.12 ** 0.1, 9);
  });
});

describe('brume de hauteur (stagne dans les vallées)', () => {
  const p = { density: 0.01, thickness: 25 };

  it('près du joueur (6 m), elle reste légère (≤ 9 %) à toute heure, même au niveau de sa base : elle ne voile pas ce qui est proche', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), (f) => {
        expect(heightFogAmount(6, 0, heightFogFor(at(f)))).toBeLessThanOrEqual(0.09);
      }),
    );
  });

  it('nulle sous les pieds, croît avec la distance, décroît avec l’altitude, reste dans [0, 1]', () => {
    expect(heightFogAmount(0, 0, p)).toBe(0);
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 2000, noNaN: true }),
        fc.double({ min: 0, max: 500, noNaN: true }),
        fc.double({ min: 0.1, max: 100, noNaN: true }),
        (d, h, dd) => {
          const a = heightFogAmount(d, h, p);
          expect(a).toBeGreaterThanOrEqual(0);
          expect(a).toBeLessThanOrEqual(1);
          expect(heightFogAmount(d + dd, h, p)).toBeGreaterThanOrEqual(a);
          expect(heightFogAmount(d, h + dd, p)).toBeLessThanOrEqual(a);
        },
      ),
    );
  });

  it('au fond d’une vallée lointaine : dense ; sur une crête à la même distance : presque rien', () => {
    expect(heightFogAmount(300, 0, p)).toBeGreaterThan(0.9);
    expect(heightFogAmount(300, 120, p)).toBeLessThan(0.02);
  });

  it('dense le matin et le soir, légère à midi', () => {
    const morning = heightFogFor(at(0.04)), noon = heightFogFor(at(0.35)), dusk = heightFogFor(at(0.66));
    expect(morning.density).toBeGreaterThan(2 * noon.density);
    expect(dusk.density).toBeGreaterThan(2 * noon.density);
    expect(morning.thickness).toBeGreaterThan(noon.thickness);
  });

  it('varie sans saut au fil du cycle', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), (f) => {
        const a = heightFogFor(at(f)), b = heightFogFor(at((f + 1e-4) % 1));
        expect(Math.abs(a.density - b.density)).toBeLessThan(1e-4);
        expect(Math.abs(a.thickness - b.thickness)).toBeLessThan(0.05);
      }),
    );
  });
});

describe('hazeColor (teinte de la brume)', () => {
  it('plus claire et plus désaturée que l’horizon du ciel, à toute heure (sinon elle se confond avec lui)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), (f) => {
        const l = lightingFor(at(f));
        const haze = hazeColor(l);
        expect(luminance(haze)).toBeGreaterThan(luminance(l.skyHorizon));
        expect(saturation(haze)).toBeLessThan(saturation(l.skyHorizon));
        for (const v of haze) expect(v >= 0 && v <= 1).toBe(true);
      }),
    );
  });

  it('perspective aérienne : bleutée à midi, pêche au matin, dorée au crépuscule — jamais grise aux moments clés', () => {
    const noon = hazeColor(lightingFor(at(0.3))), morning = hazeColor(lightingFor(at(0.06))), dusk = hazeColor(lightingFor(at(0.66)));
    expect(noon[2]).toBeGreaterThan(noon[0] + 0.1);
    expect(noon[2]).toBeGreaterThanOrEqual(noon[1]);
    expect(morning[0]).toBeGreaterThan(morning[2] + 0.1);
    expect(dusk[0]).toBeGreaterThan(dusk[2] + 0.2);
    for (const f of [0.06, 0.3, 0.55, 0.64]) expect(saturation(hazeColor(lightingFor(at(f)))), `à ${f}`).toBeGreaterThan(0.12);
  });

  it('éclaircit la couleur de brume d’exactement HAZE_LIGHTEN vers le blanc (la désaturation garde la luminance) : l’atmosphère s’en sert pour plafonner la brume', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), (f) => {
        const l = lightingFor(at(f));
        const lum = luminance(l.fogColor);
        expect(luminance(hazeColor(l))).toBeCloseTo(lum + HAZE_LIGHTEN * (1 - lum), 9);
      }),
    );
  });

  it('garde la teinte de l’ambiance (bleutée la nuit, chaude au crépuscule)', () => {
    const night = hazeColor(lightingFor(at(0.85))), dusk = hazeColor(lightingFor(at(0.66)));
    expect(night[2]).toBeGreaterThan(night[0]);
    expect(dusk[0]).toBeGreaterThan(dusk[2]);
  });
});

describe('hazeHorizonWeight (bas du ciel fondu dans la brume : le bord du monde chargé ne se voit pas)', () => {
  it('1 à l’horizon et en dessous, 0 dès 15 % de la hauteur du dôme, décroissant entre les deux', () => {
    expect(hazeHorizonWeight(-0.2)).toBe(1);
    expect(hazeHorizonWeight(0)).toBe(1);
    expect(hazeHorizonWeight(0.15)).toBe(0);
    expect(hazeHorizonWeight(0.5)).toBe(0);
    fc.assert(
      fc.property(fc.double({ min: 0, max: 0.15, noNaN: true }), fc.double({ min: 0, max: 0.05, noNaN: true }), (h, dh) => {
        expect(hazeHorizonWeight(h + dh)).toBeLessThanOrEqual(hazeHorizonWeight(h));
      }),
    );
  });
});

describe('distanceFogVisibilityFor (visibilité restante au bord de la vue, selon l’heure)', () => {
  it('brume légère à midi, dense le matin et le soir, et toujours dans ]0, 1[', () => {
    const noon = distanceFogVisibilityFor(at(0.35)), morning = distanceFogVisibilityFor(at(0.04)), dusk = distanceFogVisibilityFor(at(0.66));
    expect(noon).toBeGreaterThan(2 * morning);
    expect(noon).toBeGreaterThan(2 * dusk);
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), (f) => {
        const v = distanceFogVisibilityFor(at(f));
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThan(1);
        expect(Math.abs(distanceFogVisibilityFor(at((f + 1e-4) % 1)) - v)).toBeLessThan(0.005);
      }),
    );
  });
});

describe('retour de José : brume de montagne au matin trop forte', () => {
  it('au matin, une chaîne à 300 m reste lisible (≥ 30 % de visibilité, vue 512 m)', () => {
    const density = fogDensityFor(512, distanceFogVisibilityFor(at(0.04)));
    expect(fogVisibility(300, density)).toBeGreaterThanOrEqual(0.3);
  });

  it('au matin, la brume de hauteur reste dense au fond des vallées mais légère à 60 m au-dessus', () => {
    const morning = heightFogFor(at(0.04));
    expect(heightFogAmount(300, 5, morning)).toBeGreaterThanOrEqual(0.75);
    expect(heightFogAmount(300, 60, morning)).toBeLessThanOrEqual(0.15);
  });
});
