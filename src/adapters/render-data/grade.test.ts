import { describe, expect, it } from 'vitest';
import { DAY_LENGTH_S, NIGHT_LENGTH_S } from '../../core/config/balance';
import { timeOfDay } from '../../core/survival/time-of-day';
import { DAY_GRADE, gradeFor } from './grade';
import { lightingFor } from './lighting';

const CYCLE_S = DAY_LENGTH_S + NIGHT_LENGTH_S;
/** Étalonnage à une fraction du cycle (0,06 matin, 0,3 midi, 0,64 crépuscule, 0,85 nuit : les moments de la démo). */
const at = (fraction: number) => gradeFor(lightingFor(timeOfDay(fraction * CYCLE_S)));

describe('gradeFor (étalonnage qui suit l’heure, comme l’œil)', () => {
  it('à midi : l’étalonnage de jour, sans teinte ajoutée', () => {
    const noon = at(0.3);
    expect(noon.exposure).toBeCloseTo(DAY_GRADE.exposure, 6);
    expect(noon.saturation).toBeCloseTo(DAY_GRADE.saturation, 6);
    expect(noon.tint).toBeLessThan(2);
  });

  it('la nuit : couleurs éteintes (l’herbe ne reste pas jaune-vert sous la lune) et image plus sombre, mais lisible', () => {
    const night = at(0.85), noon = at(0.3);
    expect(night.saturation).toBeLessThan(noon.saturation - 30);
    expect(night.exposure).toBeLessThan(noon.exposure - 0.2);
    expect(night.exposure).toBeGreaterThan(0.7);
  });

  it('au crépuscule : l’image se réchauffe (teinte orangée), bien plus qu’au matin', () => {
    const dusk = at(0.64), morning = at(0.06);
    expect(dusk.tint).toBeGreaterThan(9); // en HDR + ACES la lumière dorée réchauffe déjà : la teinte globale reste modérée (elle grisait le ciel)
    expect(dusk.tint).toBeGreaterThan(morning.tint + 4);
    expect(dusk.hue).toBeGreaterThan(15);
    expect(dusk.hue).toBeLessThan(45); // orange, ni rouge ni jaune
  });

  it('au cœur de la nuit : une teinte bleutée (clair de lune), qui n’apparaît qu’une fois la nuit tombée', () => {
    const night = at(0.85);
    expect(night.tint).toBeGreaterThan(8);
    expect(night.hue).toBeGreaterThan(200);
    expect(night.hue).toBeLessThan(240);
    expect(at(0.71).tint).toBeLessThan(2); // entre le couchant et la nuit : ni orange ni bleu
  });

  it('à l’aube, tant que le soleil n’éclaire pas encore, pas de teinte orangée (elle suit la force du soleil)', () => {
    expect(at(0).tint).toBeLessThan(1);
    expect(at(0.06).tint).toBeGreaterThan(at(0.01).tint);
  });

  it('au crépuscule, couleurs plus franches qu’à midi : la teinte orangée ne délave pas l’herbe en vert olive', () => {
    expect(at(0.64).saturation).toBeGreaterThanOrEqual(at(0.3).saturation + 6);
  });

  it('sans saut : d’un instant à l’autre du cycle, l’étalonnage change peu', () => {
    for (let f = 0; f < 1; f += 0.002) {
      const a = at(f), b = at(f + 0.002);
      expect(Math.abs(a.exposure - b.exposure)).toBeLessThan(0.03);
      expect(Math.abs(a.saturation - b.saturation)).toBeLessThan(3);
      expect(Math.abs(a.tint - b.tint)).toBeLessThan(3);
    }
  });
});
