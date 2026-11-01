import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { WEATHER_DRYING_S, WEATHER_KINDS, WEATHER_PRESETS, WEATHER_SEGMENT_S, weatherAt, weatherKindAt } from './weather';

const seed = fc.integer({ min: 0, max: 0xffffffff });
const time = fc.double({ min: 0, max: 1e7, noNaN: true });
const FIELDS = ['cloudCover', 'rain', 'storm', 'fog', 'wind', 'wetness'] as const;

describe('weatherAt (météo du monde, fonction pure de la graine et du temps de jeu)', () => {
  it('déterministe, toutes les grandeurs dans [0, 1]', () => {
    fc.assert(
      fc.property(seed, time, (s, t) => {
        const w = weatherAt(s, t);
        expect(weatherAt(s, t)).toEqual(w);
        for (const k of FIELDS) {
          expect(w[k]).toBeGreaterThanOrEqual(0);
          expect(w[k]).toBeLessThanOrEqual(1);
        }
      }),
    );
  });

  it('la partie commence par du beau temps (premier épisode clair, tel quel)', () => {
    fc.assert(
      fc.property(seed, (s) => {
        expect(weatherKindAt(s, 0)).toBe('clair');
        expect(weatherAt(s, 10)).toEqual({ ...WEATHER_PRESETS.clair, wetness: 0 });
      }),
    );
  });

  it('aucun saut : en 1 s de jeu, aucune grandeur ne bouge de plus de 3 %', () => {
    fc.assert(
      fc.property(seed, time, (s, t) => {
        const a = weatherAt(s, t), b = weatherAt(s, t + 1);
        for (const k of FIELDS) expect(Math.abs(a[k] - b[k])).toBeLessThan(0.03);
      }),
    );
  });

  it('au cœur d’un épisode, la météo est exactement celle du type annoncé (hors humidité du sol)', () => {
    fc.assert(
      fc.property(seed, fc.integer({ min: 0, max: 5000 }), (s, i) => {
        const t = (i + 0.3) * WEATHER_SEGMENT_S;
        expect(weatherAt(s, t)).toMatchObject(WEATHER_PRESETS[weatherKindAt(s, t)]);
      }),
    );
  });

  it('variée : sur 200 épisodes, chaque type de temps apparaît, l’orage reste plus rare que le temps clair', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 200; i++) {
      const k = weatherKindAt(12345, (i + 0.5) * WEATHER_SEGMENT_S);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const k of WEATHER_KINDS) expect(counts.get(k) ?? 0).toBeGreaterThan(0);
    expect(counts.get('orage')!).toBeLessThan(counts.get('clair')!);
  });

  it('le sol sèche après la pluie : mouillé pendant une averse, sec au cœur d’un épisode sec qui suit un épisode sec', () => {
    const mid = (i: number): number => (i + 0.5) * WEATHER_SEGMENT_S;
    let i = 1;
    while (weatherKindAt(7, mid(i)) !== 'pluie') i++;
    expect(weatherAt(7, mid(i)).wetness).toBeGreaterThan(0.7);
    let j = 2;
    while (!(WEATHER_PRESETS[weatherKindAt(7, mid(j - 1))].rain === 0 && WEATHER_PRESETS[weatherKindAt(7, mid(j))].rain === 0)) j++;
    expect(weatherAt(7, mid(j)).wetness).toBe(0);
  });

  it('la pluie mouille le sol au moins autant qu’elle tombe', () => {
    fc.assert(
      fc.property(seed, time, (s, t) => {
        const w = weatherAt(s, t);
        expect(w.wetness).toBeGreaterThanOrEqual(w.rain - 1e-9);
      }),
    );
  });
});

describe('séchage du sol et valeurs absurdes', () => {
  it('après la fin de la pluie, le sol ne fait que sécher, et il est sec WEATHER_DRYING_S secondes plus tard', () => {
    // Fin d'un épisode pluvieux suivi d'un épisode sec : la pluie s'arrête à la fin du fondu (début de l'épisode sec).
    let i = 1;
    while (!(WEATHER_PRESETS[weatherKindAt(3, (i + 0.5) * WEATHER_SEGMENT_S)].rain > 0 && WEATHER_PRESETS[weatherKindAt(3, (i + 1.5) * WEATHER_SEGMENT_S)].rain === 0)) i++;
    const rainEnd = (i + 1) * WEATHER_SEGMENT_S;
    expect(weatherAt(3, rainEnd).rain).toBe(0);
    let previous = weatherAt(3, rainEnd).wetness;
    expect(previous).toBeGreaterThan(0.2);
    for (let t = rainEnd + 5; t <= rainEnd + WEATHER_DRYING_S; t += 5) {
      const w = weatherAt(3, t).wetness;
      expect(w, `à +${t - rainEnd} s`).toBeLessThanOrEqual(previous);
      previous = w;
    }
    expect(weatherAt(3, rainEnd + WEATHER_DRYING_S).wetness).toBe(0);
  });

  it('un temps absurde (NaN, négatif, infini) donne une météo valide, celle du début de partie', () => {
    for (const t of [Number.NaN, -50, Number.NEGATIVE_INFINITY]) expect(weatherAt(9, t)).toEqual(weatherAt(9, 0));
    for (const v of Object.values(weatherAt(9, Number.POSITIVE_INFINITY))) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('enchaînement des épisodes', () => {
  it('pas d’orage qui éclate d’un ciel clair ou du brouillard : l’épisode d’avant est déjà nuageux ou pluvieux', () => {
    fc.assert(
      fc.property(seed, fc.integer({ min: 1, max: 5000 }), (s, i) => {
        if (weatherKindAt(s, (i + 0.5) * WEATHER_SEGMENT_S) !== 'orage') return;
        expect(['nuageux', 'bruine', 'pluie', 'orage']).toContain(weatherKindAt(s, (i - 0.5) * WEATHER_SEGMENT_S));
      }),
      { numRuns: 2000 },
    );
  });
});
