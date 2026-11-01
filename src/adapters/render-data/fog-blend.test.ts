import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GAMMA, gammaToLinear, linearToGamma, pbrFoggedColor, standardFoggedColor } from './fog-blend';
import type { Rgb } from './palette';

/** Brume du brouillard : blanc-lavande (valeur « gamma », celle de scene.fogColor). */
const FOG_COLOR: Rgb = [0.78, 0.76, 0.86];
/** Un manteau sombre, tel que le matériau standard le calcule (valeurs « gamma »). */
const COAT_GAMMA: Rgb = [0.35, 0.25, 0.2];

const luma = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const mix = (a: number, b: number, t: number): number => a * (1 - t) + b * t;

/** Ce que Babylon 9.33 fait AUJOURD'HUI pour un PBR (fogFragment) : mix(brume, couleur LINÉAIRE, visibilité^2,2), brume non convertie. */
function babylonPbrFoggedColor(linear: Rgb, fogColor: Rgb, visibility: number): Rgb {
  const k = Math.pow(visibility, GAMMA);
  return [mix(fogColor[0], linear[0], k), mix(fogColor[1], linear[1], k), mix(fogColor[2], linear[2], k)];
}

/** Le même nombre à 1e-9 près en valeur relative (les couleurs HDR montent jusqu'à ~36 une fois en linéaire). */
function expectSameColor(actual: Rgb, expected: Rgb): void {
  for (let i = 0; i < 3; i++) expect(actual[i]).toBeCloseTo(expected[i]!, 9 - Math.max(0, Math.ceil(Math.log10(Math.max(1, Math.abs(expected[i]!))))));
}

describe('passage gamma ↔ linéaire (courbe approchée de Babylon : puissance 2,2)', () => {
  it('élève à la puissance 2,2 vers le linéaire, et à 1/2,2 en sens inverse', () => {
    expect(gammaToLinear([0.5, 1, 0])).toEqual([Math.pow(0.5, 2.2), 1, 0]);
    expect(linearToGamma([0.5, 1, 0])).toEqual([Math.pow(0.5, 1 / 2.2), 1, 0]);
  });

  it('les deux sens se compensent, y compris pour une couleur HDR (> 1)', () => {
    fc.assert(
      fc.property(fc.tuple(fc.double({ min: 0, max: 8, noNaN: true }), fc.double({ min: 0, max: 8, noNaN: true }), fc.double({ min: 0, max: 8, noNaN: true })), (c) => {
        expectSameColor(linearToGamma(gammaToLinear(c)), c);
      }),
    );
  });
});

describe('brume sur un matériau PBR = brume sur un matériau standard à la même distance', () => {
  it('même couleur à l’écran pour n’importe quelle couleur (HDR > 1 compris), brume et visibilité', () => {
    const channel = fc.double({ min: 0, max: 4, noNaN: true });
    fc.assert(
      fc.property(
        fc.tuple(channel, channel, channel),
        fc.tuple(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true })),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (colorGamma, fogColor, visibility) => {
          // Le standard calcule en « gamma » ; le PBR calcule en linéaire : même pixel, deux écritures.
          const standard = standardFoggedColor(colorGamma, fogColor, visibility);
          const pbr = pbrFoggedColor(gammaToLinear(colorGamma), fogColor, visibility);
          expectSameColor(pbr, standard);
        },
      ),
    );
  });

  it('exemple du brouillard : 19 % de brume à 6 m restent 19 % de brume (et non 37 %) sur l’héroïne', () => {
    const linear = gammaToLinear(COAT_GAMMA);
    expectSameColor(pbrFoggedColor(linear, FOG_COLOR, 0.81), standardFoggedColor(COAT_GAMMA, FOG_COLOR, 0.81));
    // La part de brume vue dans l’espace d’affichage est celle de la visibilité : 1 − 0,81.
    const seen = linearToGamma(pbrFoggedColor(linear, FOG_COLOR, 0.81));
    for (let i = 0; i < 3; i++) expect((seen[i]! - COAT_GAMMA[i]!) / (FOG_COLOR[i]! - COAT_GAMMA[i]!)).toBeCloseTo(1 - 0.81, 9);
  });

  it('visibilité 1 : la couleur reste intacte ; visibilité 0 : on voit la brume, convertie en linéaire comme sur un matériau standard', () => {
    const linear = gammaToLinear(COAT_GAMMA);
    expectSameColor(pbrFoggedColor(linear, FOG_COLOR, 1), linear);
    expectSameColor(pbrFoggedColor(linear, FOG_COLOR, 0), gammaToLinear(FOG_COLOR));
  });

  it('une couleur HDR (reflet vif, 6 en linéaire) se brume comme sur un standard', () => {
    const hdrLinear: Rgb = [6, 5, 4];
    expectSameColor(pbrFoggedColor(hdrLinear, FOG_COLOR, 0.5), standardFoggedColor(linearToGamma(hdrLinear), FOG_COLOR, 0.5));
  });

  it('fait voir le défaut de Babylon : à 6 m, la formule d’origine rend le PBR bien plus clair que le standard', () => {
    const linear = gammaToLinear(COAT_GAMMA);
    const standard = standardFoggedColor(COAT_GAMMA, FOG_COLOR, 0.81);
    const original = babylonPbrFoggedColor(linear, FOG_COLOR, 0.81);
    expect(luma(original)).toBeGreaterThan(2 * luma(standard)); // « silhouette blanc-lavande »
    expect(luma(pbrFoggedColor(linear, FOG_COLOR, 0.81))).toBeCloseTo(luma(standard), 9);
  });
});
