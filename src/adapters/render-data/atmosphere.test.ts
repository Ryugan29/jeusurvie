import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DAY_LENGTH_S, NIGHT_LENGTH_S } from '../../core/config/balance';
import { timeOfDay } from '../../core/survival/time-of-day';
import { WEATHER_PRESETS, type Weather, type WeatherKind } from '../../core/world/weather';
import {
  AMBIENT_HDR_GAIN,
  FOG_LIGHT_CEILING,
  SUN_HDR_GAIN,
  atmosphereFor,
  distanceFogDensity,
  lightningFlash,
  sceneBrightness,
  weatherGrade,
} from './atmosphere';
import { distanceFogVisibilityFor, fogAmount, fogDensityFor, hazeColor } from './fog';
import { gradeFor } from './grade';
import { lightingFor, luminance } from './lighting';

const CYCLE_S = DAY_LENGTH_S + NIGHT_LENGTH_S;
const hour = (fraction: number) => timeOfDay(fraction * CYCLE_S);
const light = (fraction: number) => lightingFor(hour(fraction));
const weather = (kind: WeatherKind, wetness = 0): Weather => ({ ...WEATHER_PRESETS[kind], wetness });
const saturation = (c: readonly number[]): number => Math.max(...c) - Math.min(...c);
const unit = fc.double({ min: 0, max: 1, noNaN: true });

describe('atmosphereFor (heure + météo + éclairs → lumière de la scène, en HDR)', () => {
  it('par temps clair, sans éclair : la lumière de l’heure, soleil renforcé (HDR), couleurs inchangées', () => {
    const l = light(0.3);
    const a = atmosphereFor(l, weather('clair'), 0);
    expect(a.light.sunIntensity).toBeCloseTo(l.sunIntensity * SUN_HDR_GAIN, 6);
    expect(a.light.ambientIntensity).toBeCloseTo(l.ambientIntensity * AMBIENT_HDR_GAIN, 6);
    expect(a.light.skyZenith).toEqual(l.skyZenith);
    expect(a.light.skyHorizon).toEqual(l.skyHorizon);
    expect(a.light.sunColor).toEqual(l.sunColor);
    expect(a.light.fogColor).toEqual(l.fogColor);
    expect(a.fogDensityFactor).toBe(1);
    expect(a.fogBankDensity).toBe(0);
    expect(a.flash).toBe(0);
  });

  it('contraste « de cinéma » à midi : le soleil éclaire au moins 3 fois plus que l’ambiance (ombres franches, colorées)', () => {
    const a = atmosphereFor(light(0.3), weather('clair'), 0).light;
    expect((a.sunIntensity * luminance(a.sunColor)) / (a.ambientIntensity * luminance(a.ambientColor))).toBeGreaterThanOrEqual(3);
  });

  it('ciel couvert : soleil voilé, ciel grisé, plus d’étoiles ni de rayons ; l’orage est plus sombre que la pluie', () => {
    for (const f of [0.1, 0.3, 0.85]) {
      const l = light(f);
      const clear = atmosphereFor(l, weather('clair'), 0).light;
      const rain = atmosphereFor(l, weather('pluie'), 0).light;
      const storm = atmosphereFor(l, weather('orage'), 0).light;
      expect(rain.sunIntensity, `soleil à ${f}`).toBeLessThanOrEqual(clear.sunIntensity * 0.35);
      expect(saturation(rain.skyZenith), `ciel à ${f}`).toBeLessThan(saturation(clear.skyZenith));
      expect(rain.rayStrength).toBeLessThan(0.05);
      expect(storm.starVisibility).toBe(0);
      expect(luminance(storm.skyZenith)).toBeLessThan(luminance(rain.skyZenith));
      expect(luminance(storm.cloudLight)).toBeLessThan(luminance(rain.cloudLight));
    }
  });

  it('un éclair illumine le ciel et la scène, proportionnellement à son éclat', () => {
    const l = light(0.85), w = weather('orage');
    const dark = atmosphereFor(l, w, 0), half = atmosphereFor(l, w, 0.5), full = atmosphereFor(l, w, 1);
    expect(luminance(half.light.skyZenith)).toBeGreaterThan(luminance(dark.light.skyZenith));
    expect(luminance(full.light.skyZenith)).toBeGreaterThan(luminance(half.light.skyZenith));
    expect(full.light.ambientIntensity).toBeGreaterThan(dark.light.ambientIntensity + 1);
    expect(full.flash).toBe(1);
  });

  it('la pluie épaissit un peu la brume de l’heure, le brouillard y ajoute sa propre brume ; jamais de couleur négative ni de brume plus légère', () => {
    const l = light(0.3);
    const rain = atmosphereFor(l, weather('pluie'), 0).fogDensityFactor;
    expect(rain).toBeGreaterThan(1.5);
    expect(rain).toBeLessThan(10);
    expect(atmosphereFor(l, weather('brouillard'), 0).fogBankDensity).toBeGreaterThan(0.02);
    const anyWeather = fc.record({ cloudCover: unit, rain: unit, storm: unit, fog: unit, wind: unit, wetness: unit });
    fc.assert(
      fc.property(anyWeather, unit, (w, f) => {
        const a = atmosphereFor(l, w, f);
        expect(a.fogDensityFactor).toBeGreaterThanOrEqual(1);
        expect(a.fogBankDensity).toBeGreaterThanOrEqual(0);
        for (const c of [a.light.skyZenith, a.light.skyHorizon, a.light.fogColor, a.light.ambientColor, a.light.cloudShade]) {
          for (const v of c) expect(v).toBeGreaterThanOrEqual(0);
        }
        expect(a.light.sunIntensity).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('nuages de pluie : dessous plus sombres que par temps nuageux, gris ardoise (bleutés), bords clairs bien distincts', () => {
    for (const f of [0.1, 0.3, 0.6]) {
      const l = light(f);
      const cloudy = atmosphereFor(l, weather('nuageux'), 0).light;
      const rain = atmosphereFor(l, weather('pluie'), 0).light;
      expect(luminance(rain.cloudShade), `ombre à ${f}`).toBeLessThan(luminance(cloudy.cloudShade) * 0.8);
      expect(rain.cloudShade[2], `ardoise à ${f}`).toBeGreaterThan(rain.cloudShade[0]);
      expect(luminance(rain.cloudLight) / luminance(rain.cloudShade), `relief à ${f}`).toBeGreaterThan(1.8);
      // Les nuages se détachent du ciel couvert derrière eux (sinon on ne voit qu'un gris uniforme, « pas de nuages »).
      expect(luminance(rain.cloudShade), `détachés du ciel à ${f}`).toBeLessThan(luminance(rain.skyZenith) * 0.7);
    }
  });

  it('transmet la météo utile au rendu : nuages, pluie, sol mouillé, vent', () => {
    const a = atmosphereFor(light(0.3), weather('pluie', 0.8), 0);
    expect(a.cloudCover).toBe(WEATHER_PRESETS.pluie.cloudCover);
    expect(a.rain).toBe(WEATHER_PRESETS.pluie.rain);
    expect(a.wetness).toBe(0.8);
    expect(a.wind).toBe(WEATHER_PRESETS.pluie.wind);
  });
});

describe('brume par brouillard et par pluie (retour de José : le démon à 6 m et l’héroïne étaient délavés)', () => {
  /** Matin, midi, crépuscule, nuit (fractions du cycle). */
  const HOURS = [0.04, 0.3, 0.66, 0.85];
  /** Distance (m) où la brume de l'heure atteint sa visibilité : sans relief lointain (vue 512 m) et avec (4000 m, comme la scène). */
  const REFERENCES_M = [512, 4000];
  /** Le démon est à 6 m du joueur ; au-delà de 60 m, un brouillard plein noie tout. */
  const NEAR_M = 6, FAR_M = 60;
  /** Objectifs : brouillard plein ≤ 25 % de brume à 6 m, ≥ 85 % à 60 m ; pluie, bruine, orage ≤ 10 % à 6 m. */
  const FOG_NEAR_MAX = 0.25, FOG_FAR_MIN = 0.85, RAIN_NEAR_MAX = 0.1;

  /** Part de brume à `distanceM`, calculée comme la scène la règle : brume de l'heure (réglée sur `referenceM`) + météo. */
  function fogShare(distanceM: number, kind: WeatherKind, fraction: number, referenceM: number): number {
    const t = hour(fraction);
    const a = atmosphereFor(lightingFor(t), weather(kind), 0);
    return fogAmount(distanceM, distanceFogDensity(a, fogDensityFor(referenceM, distanceFogVisibilityFor(t))));
  }

  it('brouillard plein : ce qui est tout près garde sa couleur (≤ 25 % de brume à 6 m), à toute heure et avec ou sans relief lointain', () => {
    for (const f of HOURS) {
      for (const ref of REFERENCES_M) {
        expect(fogShare(NEAR_M, 'brouillard', f, ref), `à ${f}, référence ${ref} m`).toBeLessThanOrEqual(FOG_NEAR_MAX);
      }
    }
  });

  it('brouillard plein : le loin se noie franchement (≥ 85 % de brume à 60 m, tout disparu à 120 m), à toute heure', () => {
    for (const f of HOURS) {
      for (const ref of REFERENCES_M) {
        expect(fogShare(FAR_M, 'brouillard', f, ref), `à ${f}, référence ${ref} m`).toBeGreaterThanOrEqual(FOG_FAR_MIN);
        expect(fogShare(2 * FAR_M, 'brouillard', f, ref), `à ${f}, référence ${ref} m`).toBeGreaterThanOrEqual(0.97);
      }
    }
  });

  it('le brouillard voile bien plus que la bruine, la pluie et l’orage, qui ne touchent presque pas ce qui est proche (≤ 10 % à 6 m)', () => {
    for (const f of HOURS) {
      for (const ref of REFERENCES_M) {
        for (const kind of ['bruine', 'pluie', 'orage'] as const) {
          expect(fogShare(NEAR_M, kind, f, ref), `${kind} à ${f}, référence ${ref} m`).toBeLessThanOrEqual(RAIN_NEAR_MAX);
          expect(fogShare(FAR_M, kind, f, ref), `${kind} à ${f}, référence ${ref} m`).toBeLessThan(fogShare(FAR_M, 'brouillard', f, ref));
        }
      }
    }
  });

  it('par temps clair ou nuageux, la brume de l’heure est strictement inchangée', () => {
    for (const f of HOURS) {
      const t = hour(f), hourDensity = fogDensityFor(4000, distanceFogVisibilityFor(t));
      for (const kind of ['clair', 'nuageux'] as const) {
        expect(distanceFogDensity(atmosphereFor(lightingFor(t), weather(kind), 0), hourDensity), `${kind} à ${f}`).toBe(hourDensity);
      }
    }
  });

  it('la météo ne rend jamais la brume plus légère que celle de l’heure, et plus de brouillard ne l’allège jamais', () => {
    const anyWeather = fc.record({ cloudCover: unit, rain: unit, storm: unit, fog: unit, wind: unit, wetness: unit });
    fc.assert(
      fc.property(anyWeather, unit, fc.double({ min: 1e-5, max: 0.01, noNaN: true }), fc.double({ min: 0, max: 0.5, noNaN: true }), (w, f, hourDensity, more) => {
        const l = light(f);
        const base = distanceFogDensity(atmosphereFor(l, w, 0), hourDensity);
        expect(base).toBeGreaterThanOrEqual(hourDensity);
        const foggier = distanceFogDensity(atmosphereFor(l, { ...w, fog: Math.min(1, w.fog + more) }, 0), hourDensity);
        expect(foggier).toBeGreaterThanOrEqual(base);
      }),
    );
  });

  it('brouillard plein : la brume n’est jamais nettement plus claire que le décor éclairé (≤ FOG_LIGHT_CEILING × lumière du sol), éclairs compris', () => {
    // Borne : le décor renvoie 0,4 à 0,6 de la lumière reçue (herbe 0,6 ; roche 0,5 ; terre 0,4), la neige 0,95. Une brume à
    // 0,75 est un voile plus clair que l'herbe, mais plus sombre que la neige : elle voile sans blanchir le décor.
    expect(FOG_LIGHT_CEILING).toBeLessThanOrEqual(0.75);
    const fullFog = fc.record({ cloudCover: unit, rain: unit, storm: unit, fog: fc.constant(1), wind: unit, wetness: unit });
    fc.assert(
      fc.property(fullFog, unit, unit, (w, f, flash) => {
        const l = atmosphereFor(light(f), w, flash).light;
        expect(luminance(hazeColor(l))).toBeLessThanOrEqual(FOG_LIGHT_CEILING * sceneBrightness(l) + 1e-9);
      }),
    );
  });

  it('brouillard plein : de jour, le plafond ramène la brume juste dessous (voile lumineux, pas un gouffre sombre) ; la nuit elle est déjà plus sombre', () => {
    for (const f of [0.04, 0.3, 0.66]) {
      const l = atmosphereFor(light(f), weather('brouillard'), 0).light;
      const ratio = luminance(hazeColor(l)) / sceneBrightness(l);
      expect(ratio, `à ${f}`).toBeGreaterThanOrEqual(FOG_LIGHT_CEILING - 0.02);
      expect(ratio, `à ${f}`).toBeLessThanOrEqual(FOG_LIGHT_CEILING + 1e-9);
    }
    const night = atmosphereFor(light(0.85), weather('brouillard'), 0).light;
    expect(luminance(hazeColor(night)) / sceneBrightness(night)).toBeLessThan(FOG_LIGHT_CEILING);
  });

  it('sans brouillard, le plafond ne joue pas : la couleur de brume de l’heure reste intacte à toute heure par temps clair', () => {
    for (const f of HOURS) {
      expect(atmosphereFor(light(f), weather('clair'), 0).light.fogColor, `à ${f}`).toEqual(light(f).fogColor);
    }
  });
});

describe('sceneBrightness (lumière de la scène, 0 à 1 : dose ce qui doit s’éteindre la nuit, comme la pluie)', () => {
  it('pleine de jour, faible la nuit, plus forte pendant un éclair, toujours dans [0, 1]', () => {
    const noon = sceneBrightness(atmosphereFor(light(0.3), weather('clair'), 0).light);
    const night = sceneBrightness(atmosphereFor(light(0.85), weather('clair'), 0).light);
    expect(noon).toBeGreaterThan(0.8);
    expect(noon).toBeLessThanOrEqual(1);
    expect(night).toBeLessThan(0.5);
    expect(night).toBeLessThan(noon / 2);
    expect(night).toBeGreaterThan(0);
    expect(sceneBrightness(atmosphereFor(light(0.85), weather('orage'), 1).light)).toBeGreaterThan(night);
  });
});

describe('weatherGrade (étalonnage selon la météo)', () => {
  it('pluie et brouillard ternissent les couleurs ; un éclair surexpose brièvement', () => {
    const l = light(0.3), g = gradeFor(l);
    expect(weatherGrade(g, atmosphereFor(l, weather('clair'), 0))).toEqual(g);
    expect(weatherGrade(g, atmosphereFor(l, weather('pluie'), 0)).saturation).toBeLessThan(g.saturation - 10);
    expect(weatherGrade(g, atmosphereFor(l, weather('brouillard'), 0)).saturation).toBeLessThan(g.saturation - 5);
    expect(weatherGrade(g, atmosphereFor(l, weather('orage'), 1)).exposure).toBeGreaterThan(g.exposure * 1.2);
  });
});

describe('lightningFlash (éclairs d’orage, purement visuels)', () => {
  const seed = fc.integer({ min: 0, max: 0xffffffff });
  const time = fc.double({ min: 0, max: 1e7, noNaN: true });

  it('aucun éclair sans orage', () => {
    fc.assert(fc.property(seed, time, (s, t) => {
      expect(lightningFlash(s, t, 0)).toBe(0);
    }));
  });

  it('dans [0, 1], déterministe', () => {
    fc.assert(
      fc.property(seed, time, unit, (s, t, storm) => {
        const f = lightningFlash(s, t, storm);
        expect(lightningFlash(s, t, storm)).toBe(f);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('en plein orage, plusieurs éclairs par minute, mais le ciel reste sombre la plupart du temps', () => {
    let lit = 0, strikes = 0, prev = 0;
    const samples = 6000; // 10 min à 0,1 s
    for (let i = 0; i < samples; i++) {
      const f = lightningFlash(99, i * 0.1, 1);
      if (f > 0.5) lit++;
      if (f > 0.5 && prev <= 0.5) strikes++;
      prev = f;
    }
    expect(strikes).toBeGreaterThan(20);
    expect(lit / samples).toBeLessThan(0.1);
  });
});
