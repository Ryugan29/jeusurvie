import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DAY_LENGTH_S, NIGHT_LENGTH_S } from '../../core/config/balance';
import { timeOfDay } from '../../core/survival/time-of-day';
import type { Rgb } from './palette';
import { LIGHTING_KEY_TIMES, lightingFor, NIGHT_MIN_LUMINANCE, luminance, shadowStrength, skyColorAt, skyWeight, type Lighting } from './lighting';

const CYCLE_S = DAY_LENGTH_S + NIGHT_LENGTH_S;
const at = (fraction: number): Lighting => lightingFor(timeOfDay(fraction * CYCLE_S));
const colors = (l: Lighting) => [l.skyZenith, l.skyHorizon, l.fogColor, l.sunColor, l.ambientColor, l.ambientGroundColor, l.cloudLight, l.cloudShade];
const saturation = (c: Rgb): number => Math.max(...c) - Math.min(...c);
const sunVector = (l: Lighting) => [l.sunDirection.x * l.sunIntensity, l.sunDirection.y * l.sunIntensity, l.sunDirection.z * l.sunIntensity];

function expectClose(a: Lighting, b: Lighting, tol: number): void {
  colors(a).forEach((c, i) => c.forEach((v, k) => expect(Math.abs(v - colors(b)[i]![k]!)).toBeLessThan(tol)));
  expect(Math.abs(a.sunIntensity - b.sunIntensity)).toBeLessThan(tol);
  expect(Math.abs(a.ambientIntensity - b.ambientIntensity)).toBeLessThan(tol);
  for (const k of ['starVisibility', 'sunGlow', 'rayStrength'] as const) expect(Math.abs(a[k] - b[k]), k).toBeLessThan(tol);
  sunVector(a).forEach((v, k) => expect(Math.abs(v - sunVector(b)[k]!)).toBeLessThan(2 * tol));
}

describe('lightingFor (ambiances jour / crépuscule / nuit)', () => {
  it('varie sans saut tout au long du cycle', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), (f) => {
        expectClose(at(f), at((f + 1e-4) % 1), 0.01);
      }),
    );
  });

  it.each([
    ['jour → crépuscule', (DAY_LENGTH_S - 120) / CYCLE_S],
    ['crépuscule → nuit', DAY_LENGTH_S / CYCLE_S],
    ['nuit → jour (aube)', 1],
  ])('sans saut à la transition %s', (_label, f) => {
    expectClose(at(f - 1e-6), at(f % 1), 0.001);
  });

  it('la nuit reste lisible : la lumière d’ambiance ne descend jamais sous le plancher', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), (f) => {
        const l = at(f);
        expect(l.ambientIntensity * luminance(l.ambientColor)).toBeGreaterThanOrEqual(NIGHT_MIN_LUMINANCE);
      }),
    );
  });

  it('couleurs dans [0, 1], soleil (ou lune) éclairant vers le bas avec une direction unitaire', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), (f) => {
        const l = at(f);
        for (const c of colors(l)) for (const v of c) expect(v >= 0 && v <= 1).toBe(true);
        const d = l.sunDirection;
        expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9);
        expect(d.y).toBeLessThan(0);
        expect(l.sunIntensity).toBeGreaterThanOrEqual(0);
        for (const k of ['starVisibility', 'sunGlow', 'rayStrength'] as const) {
          expect(l[k]).toBeGreaterThanOrEqual(0);
          expect(l[k]).toBeLessThanOrEqual(1);
        }
      }),
    );
  });

  it('ambiances reconnaissables : midi lumineux, crépuscule chaud, nuit bleutée et plus sombre', () => {
    const noon = at(0.3), dusk = at(0.66), night = at(0.85);
    expect(noon.sunIntensity).toBeGreaterThan(0.7);
    expect(dusk.skyHorizon[0]).toBeGreaterThan(dusk.skyHorizon[2] + 0.3);
    expect(night.skyZenith[2]).toBeGreaterThan(night.skyZenith[0]);
    expect(night.ambientColor[2]).toBeGreaterThan(night.ambientColor[0]);
    expect(luminance(night.skyHorizon)).toBeLessThan(luminance(noon.skyHorizon) / 3);
  });

  it('instants clés strictement croissants, de 0 à 1', () => {
    expect(LIGHTING_KEY_TIMES[0]).toBe(0);
    expect(LIGHTING_KEY_TIMES[LIGHTING_KEY_TIMES.length - 1]).toBe(1);
    for (let i = 1; i < LIGHTING_KEY_TIMES.length; i++) expect(LIGHTING_KEY_TIMES[i]!).toBeGreaterThan(LIGHTING_KEY_TIMES[i - 1]!);
  });

  it('la lune est au plus haut à minuit (milieu de la nuit), plein sud-nord : aucune composante est-ouest', () => {
    const midnight = at((DAY_LENGTH_S + NIGHT_LENGTH_S / 2) / CYCLE_S);
    expect(Math.abs(midnight.sunDirection.x)).toBeLessThan(1e-9);
    for (let s = DAY_LENGTH_S + 1; s < CYCLE_S; s += 7) {
      expect(at(s / CYCLE_S).sunDirection.y).toBeGreaterThanOrEqual(midnight.sunDirection.y - 1e-12);
    }
  });

  it('le soleil n’est jamais au zénith : élévation maximale entre 50° et 55°, atteinte vers midi', () => {
    const sin50 = Math.sin((50 * Math.PI) / 180), sin55 = Math.sin((55 * Math.PI) / 180);
    let highest = 0;
    for (let s = 0; s < DAY_LENGTH_S; s += 5) highest = Math.max(highest, -at(s / CYCLE_S).sunDirection.y);
    expect(highest).toBeGreaterThanOrEqual(sin50);
    expect(highest).toBeLessThanOrEqual(sin55);
  });

  it('ombre jamais démesurée : tant que le soleil éclaire nettement, elle ne dépasse pas 2× la taille du perso', () => {
    for (let s = 0; s < DAY_LENGTH_S; s += 5) {
      const l = at(s / CYCLE_S);
      if (l.sunIntensity < 0.2) continue;
      const d = l.sunDirection;
      expect(Math.hypot(d.x, d.z) / -d.y).toBeLessThanOrEqual(2);
    }
  });

  it('l’azimut tourne : lumière venant de l’est le matin, de l’ouest l’après-midi, du sud vers midi', () => {
    const morning = at(0.1), noon = at(DAY_LENGTH_S / 2 / CYCLE_S), afternoon = at(0.5);
    expect(morning.sunDirection.x).toBeLessThan(-0.3); // la lumière va vers l'ouest : le soleil est à l'est
    expect(afternoon.sunDirection.x).toBeGreaterThan(0.3);
    expect(Math.abs(noon.sunDirection.x)).toBeLessThan(0.05);
    expect(noon.sunDirection.z).toBeGreaterThan(0.3); // soleil au sud (−Z), la lumière va vers +Z
  });

  it('à midi, le relief se lit : une pente de 30° face au soleil est nettement plus claire qu’une pente dos au soleil', () => {
    const noon = at(DAY_LENGTH_S / 2 / CYCLE_S);
    const toSun = { x: -noon.sunDirection.x, y: -noon.sunDirection.y, z: -noon.sunDirection.z };
    const lit = (l: Lighting, n: { x: number; y: number; z: number }): number => {
      const sx = -l.sunDirection.x, sy = -l.sunDirection.y, sz = -l.sunDirection.z;
      return (
        l.ambientIntensity * luminance(l.ambientColor) * (0.5 + 0.5 * n.y) +
        l.sunIntensity * luminance(l.sunColor) * Math.max(0, n.x * sx + n.y * sy + n.z * sz)
      );
    };
    const brightness = (n: { x: number; y: number; z: number }): number => lit(noon, n);
    const tilt = Math.sin(Math.PI / 6), up = Math.cos(Math.PI / 6);
    const horiz = Math.hypot(toSun.x, toSun.z);
    const facing = { x: (toSun.x / horiz) * tilt, y: up, z: (toSun.z / horiz) * tilt };
    const away = { x: -facing.x, y: up, z: -facing.z };
    expect(brightness(facing) / brightness(away)).toBeGreaterThanOrEqual(1.6);
    // … et midi reste lumineux sans brûler le sol : le plat reçoit au moins autant que le matin, mais pas plus de 1
    // (au-delà, les couleurs du sol saturent vers le blanc et le terrain paraît plat).
    const flat = { x: 0, y: 1, z: 0 };
    expect(brightness(flat)).toBeGreaterThanOrEqual(lit(at(0.1), flat));
    expect(brightness(flat)).toBeGreaterThanOrEqual(0.85);
    expect(brightness(flat)).toBeLessThanOrEqual(1);
  });

  it('à midi, même une pente face au soleil ne dépasse pas 1.15 : aucune zone du sol ne sature', () => {
    const noon = at(DAY_LENGTH_S / 2 / CYCLE_S);
    const toSun = { x: -noon.sunDirection.x, y: -noon.sunDirection.y, z: -noon.sunDirection.z };
    const tilt = Math.sin(Math.PI / 6), up = Math.cos(Math.PI / 6), horiz = Math.hypot(toSun.x, toSun.z);
    const n = { x: (toSun.x / horiz) * tilt, y: up, z: (toSun.z / horiz) * tilt };
    const bright =
      noon.ambientIntensity * luminance(noon.ambientColor) * (0.5 + 0.5 * n.y) +
      noon.sunIntensity * luminance(noon.sunColor) * Math.max(0, n.x * toSun.x + n.y * toSun.y + n.z * toSun.z);
    expect(bright).toBeLessThanOrEqual(1.15);
  });
});

describe('ciel et lumière « fantasy colorée » (aperçus du pack Quaternius)', () => {
  it('midi : ciel de diffusion — zénith bleu franc, horizon blanc-bleuté plus clair et moins saturé (ADR 0012)', () => {
    const noon = at(0.3);
    const [zr, zg, zb] = noon.skyZenith;
    expect(zb).toBeGreaterThan(zg);
    expect(zg).toBeGreaterThan(zr);
    expect(zb).toBeGreaterThan(0.7);
    expect(saturation(noon.skyZenith)).toBeGreaterThan(0.5);
    expect(saturation(noon.skyZenith)).toBeLessThan(0.85); // pas le cyan saturé d'une illustration
    const [r, g, b] = noon.skyHorizon;
    expect(b).toBeGreaterThan(r + 0.2);
    expect(g).toBeGreaterThan(r + 0.08);
    expect(luminance(noon.skyHorizon)).toBeGreaterThan(luminance(noon.skyZenith));
    expect(saturation(noon.skyHorizon)).toBeLessThan(saturation(noon.skyZenith));
  });

  it('crépuscule doré, jamais rose : soleil, horizon et brume en orange (rouge > vert > bleu), le vert reste fort', () => {
    const dusk = at(0.66);
    for (const c of [dusk.sunColor, dusk.skyHorizon, dusk.fogColor]) {
      expect(c[0]).toBeGreaterThan(c[1]);
      expect(c[1]).toBeGreaterThan(c[2] + 0.12);
    }
    expect(dusk.skyHorizon[1]).toBeGreaterThan(0.55);
    expect(dusk.sunColor[1]).toBeGreaterThan(0.55);
  });

  it('matin doux et chaud : lumière dorée et brume pêche (rouge nettement au-dessus du bleu), ciel qui reste bleu, soleil qui éclaire déjà', () => {
    const morning = at(0.06);
    for (const c of [morning.sunColor, morning.fogColor]) expect(c[0]).toBeGreaterThan(c[2] + 0.15);
    expect(morning.skyZenith[2]).toBeGreaterThan(morning.skyZenith[0] + 0.4); // un ciel gris-lilas viendrait du mélange orange et bleu
    expect(morning.sunIntensity).toBeGreaterThan(0.25); // le soleil se lève : il monte vers 0,5 à 0,08
  });

  it('ambiance du jour : le haut vient du ciel (bleuté), le bas est un rebond chaud de l’herbe (jaune-vert, plus sombre)', () => {
    for (const f of [0.1, 0.3, 0.5]) {
      const l = at(f);
      expect(l.ambientColor[2], `haut à ${f}`).toBeGreaterThanOrEqual(l.ambientColor[0]);
      const [r, g, b] = l.ambientGroundColor;
      expect(r, `bas à ${f}`).toBeGreaterThan(b + 0.1);
      expect(g, `bas à ${f}`).toBeGreaterThan(b + 0.1);
      expect(luminance(l.ambientGroundColor)).toBeLessThan(luminance(l.ambientColor));
    }
  });

  it('nuages : blancs le jour, dorés au crépuscule, sombres et bleutés la nuit ; leur face à l’ombre est toujours plus sombre', () => {
    const noon = at(0.3), dusk = at(0.66), night = at(0.85);
    expect(luminance(noon.cloudLight)).toBeGreaterThan(0.9);
    expect(dusk.cloudLight[0]).toBeGreaterThan(dusk.cloudLight[2] + 0.2);
    expect(luminance(night.cloudLight)).toBeLessThan(0.4);
    expect(night.cloudLight[2]).toBeGreaterThan(night.cloudLight[0]);
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), (f) => {
        const l = at(f);
        expect(luminance(l.cloudShade)).toBeLessThan(luminance(l.cloudLight));
      }),
    );
  });

  it('étoiles : invisibles le jour, pleinement visibles au cœur de la nuit', () => {
    expect(at(0.3).starVisibility).toBe(0);
    expect(at(0.06).starVisibility).toBe(0);
    expect(at(0.64).starVisibility).toBe(0);
    expect(at(0.85).starVisibility).toBe(1);
  });

  it('rayons de soleil discrets : présents le jour, plus marqués au matin et au crépuscule qu’à midi, nuls la nuit', () => {
    const morning = at(0.08), noon = at(0.3), dusk = at(0.66), night = at(0.85);
    expect(noon.rayStrength).toBeGreaterThan(0);
    expect(morning.rayStrength).toBeGreaterThan(noon.rayStrength);
    expect(dusk.rayStrength).toBeGreaterThan(noon.rayStrength);
    expect(night.rayStrength).toBe(0);
    expect(Math.max(morning.rayStrength, dusk.rayStrength)).toBeLessThanOrEqual(0.8); // discrets
  });

  it('halo du soleil : marqué le jour, plus faible pour la lune', () => {
    expect(at(0.3).sunGlow).toBeGreaterThan(at(0.85).sunGlow);
    expect(at(0.85).sunGlow).toBeGreaterThan(0);
  });
});

describe('skyColorAt (dégradé du ciel)', () => {
  const l = at(0.3);
  it('horizon en bas, zénith en haut, montée rapide au-dessus de l’horizon (racine de la hauteur)', () => {
    expect(skyColorAt(l, 0)).toEqual(l.skyHorizon);
    expect(skyColorAt(l, 1)).toEqual(l.skyZenith);
    const quarter = skyColorAt(l, 0.25);
    for (let k = 0; k < 3; k++) expect(quarter[k]).toBeCloseTo((l.skyHorizon[k]! + l.skyZenith[k]!) / 2, 12);
  });
  it('skyWeight : racine de la hauteur, bornée à [0, 1] (utilisé tel quel par le rendu)', () => {
    expect([skyWeight(-1), skyWeight(0), skyWeight(0.25), skyWeight(1), skyWeight(4)]).toEqual([0, 0, 0.5, 1, 1]);
  });
  it('sous l’horizon : couleur de l’horizon ; au-delà du zénith : zénith', () => {
    expect(skyColorAt(l, -0.5)).toEqual(l.skyHorizon);
    expect(skyColorAt(l, 2)).toEqual(l.skyZenith);
  });
});

describe('shadowStrength (force de l’ombre projetée du personnage)', () => {
  it('marquée le jour, faible la nuit, nulle quand l’astre est couché', () => {
    expect(shadowStrength(at(0.35))).toBeGreaterThan(0.5);
    expect(shadowStrength(at(0.85))).toBeLessThan(0.25);
    expect(shadowStrength(at(0))).toBe(0);
  });

  it('bien visible au matin et au crépuscule, même si le soleil y est remonté (ombres courtes)', () => {
    expect(shadowStrength(at(0.06))).toBeGreaterThan(0.5);
    expect(shadowStrength(at(0.64))).toBeGreaterThan(0.3);
  });

  it('dans [0, 1] et sans saut au fil du cycle', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), (f) => {
        const a = shadowStrength(at(f));
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
        expect(Math.abs(shadowStrength(at((f + 1e-4) % 1)) - a)).toBeLessThan(0.01);
      }),
    );
  });
});

describe('lumière peinte : soleil chaud, ombres froides (fantasy colorée)', () => {
  const warmth = (c: Rgb): number => c[0] - c[2];
  const day = { matin: 0.08, midi: 0.3, 'avant le crépuscule': 0.55, crépuscule: 0.66 };

  it('de jour, le soleil est nettement plus chaud que l’ambiance : ce qui est éclairé tire sur l’or, l’ombre sur le bleu', () => {
    for (const [name, f] of Object.entries(day)) {
      const l = at(f);
      expect(warmth(l.sunColor) - warmth(l.ambientColor), name).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('l’ombre est bleutée le jour (bleu nettement au-dessus du rouge), bleu profond au crépuscule (pas violette : avec le vert, elle donnait de l’olive)', () => {
    for (const [name, f] of Object.entries(day)) {
      const a = at(f).ambientColor;
      expect(a[2], name).toBeGreaterThan(a[0] + 0.15);
    }
    const dusk = at(0.66).ambientColor;
    expect(dusk[1]).toBeGreaterThanOrEqual(dusk[0]);
    expect(dusk[2]).toBeGreaterThan(dusk[0] + 0.3);
  });
});
