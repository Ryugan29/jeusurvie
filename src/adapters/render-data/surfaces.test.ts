import { describe, expect, it } from 'vitest';
import { DEFAULT_SURFACE, isFoliageMaterial, surfaceFor, wetSurface, type Surface, type WetSurface } from './surfaces';

/** Un représentant de chaque réglage de la table des surfaces, plus la surface par défaut (« Atlas »). */
const SOLID_MATERIALS = ['Rocks', 'Bark_NormalTree', 'Mushrooms', 'MI_Hair_2', 'MI_Eyes', 'MI_Superhero_Female', 'Atlas'];
/** Humidités essayées : 0 (sec) à 1 (détrempé) par dixièmes. */
const WETNESS_STEPS = Array.from({ length: 11 }, (_, i) => i / 10);

// Mesure de l'éclairage reçu du ciel (pour verrouiller « mouillé ≠ plus de lumière ») : modèle de l'éclairage d'environnement d'un
// diélectrique sous un ciel uniforme de luminance 1. Il en reçoit une part DIFFUSE (couleur de matière × ce que le reflet n'a pas pris)
// et une part de REFLET (albédo directionnel du lobe spéculaire, qui monte quand la rugosité baisse). Le tout × environmentIntensity.
/** Réflectance d'un diélectrique de face (verre, eau, pierre, peau : ~4 %). */
const F0_DIELECTRIC = 0.04;
/** Angles de vue échantillonnés entre face (cos = 1) et rasant (cos = 0), pondérés par leur surface apparente. */
const VIEW_ANGLE_SAMPLES = 64;

/** Albédo du reflet vu sous `nDotV` : approximation analytique de la table « EnvBRDF » (Karis, UE4) des moteurs PBR, F90 = 1. */
function specularAlbedo(roughness: number, nDotV: number): number {
  const rx = 1 - roughness;
  const ry = 0.0425 - 0.0275 * roughness;
  const rz = 1.04 - 0.572 * roughness;
  const rw = -0.04 + 0.022 * roughness;
  const a004 = Math.min(rx * rx, 2 ** (-9.28 * nDotV)) * rx + ry;
  return F0_DIELECTRIC * (-1.04 * a004 + rz) + (1.04 * a004 + rw);
}

/** Albédo du reflet moyenné sur toutes les vues (poids cos θ : une sphère montre plus de face que de bord). */
function meanSpecularAlbedo(roughness: number): number {
  let sum = 0;
  let weights = 0;
  for (let i = 0; i < VIEW_ANGLE_SAMPLES; i++) {
    const nDotV = (i + 0.5) / VIEW_ANGLE_SAMPLES;
    sum += specularAlbedo(roughness, nDotV) * nDotV;
    weights += nDotV;
  }
  return sum / weights;
}

/** Éclairage de ciel renvoyé par la surface `s` de couleur `albedo` (0 = noire, 1 = blanche) : diffuse (assombrie par l'eau) + reflet. */
function skyLightReturned(s: WetSurface, albedo: number): number {
  const reflected = meanSpecularAlbedo(s.roughness);
  return s.environmentIntensity * (albedo * s.darken * (1 - reflected) + reflected);
}

describe('wetSurface (matière mouillée par la pluie)', () => {
  it('sèche : inchangée ; mouillée : plus lisse (elle luit), plus sombre, sans plus d’éclairage d’environnement', () => {
    const rock = surfaceFor('Rocks');
    expect(wetSurface(rock, 0)).toEqual({ ...rock, darken: 1 });
    const wet = wetSurface(rock, 1);
    expect(wet.roughness).toBeLessThan(rock.roughness * 0.6);
    expect(wet.roughness).toBeGreaterThan(0.1); // luisante, jamais un miroir
    expect(wet.environmentIntensity).toBeLessThanOrEqual(rock.environmentIntensity);
    expect(wet.darken).toBeLessThan(0.85);
    expect(wet.darken).toBeGreaterThan(0.5);
    expect(wet.metallic).toBe(rock.metallic);
  });

  it('une surface détrempée ne reçoit pas plus d’éclairage d’environnement qu’à sec (l’eau ne fabrique pas de lumière)', () => {
    for (const name of SOLID_MATERIALS) {
      const dry = surfaceFor(name);
      for (const wetness of WETNESS_STEPS) {
        expect(wetSurface(dry, wetness).environmentIntensity, `${name} à ${wetness}`).toBeLessThanOrEqual(dry.environmentIntensity);
      }
    }
  });

  it('la brillance ne crée pas de lumière : une matière claire ou moyenne renvoie moins de ciel mouillée que sèche, à toute humidité', () => {
    for (const name of SOLID_MATERIALS) {
      const dry = surfaceFor(name);
      for (const albedo of [0.2, 0.4, 0.7, 1]) {
        const dryLight = skyLightReturned(wetSurface(dry, 0), albedo);
        for (const wetness of WETNESS_STEPS) {
          expect(skyLightReturned(wetSurface(dry, wetness), albedo), `${name}, albédo ${albedo}, humidité ${wetness}`).toBeLessThanOrEqual(dryLight + 1e-12);
        }
      }
    }
  });

  it('même une matière presque noire ne gagne qu’un liseré de reflet (la brillance voulue), jamais un éclat qui l’éclaircit', () => {
    const MAX_GAIN = 0.025; // mesuré : ≤ 0,019 du ciel (cheveux, écorce, roche noirs détrempés) ; 1 = tout le ciel renvoyé
    for (const name of SOLID_MATERIALS) {
      const dry = surfaceFor(name);
      for (const albedo of [0, 0.03, 0.06, 0.1]) {
        const gain = skyLightReturned(wetSurface(dry, 1), albedo) - skyLightReturned(wetSurface(dry, 0), albedo);
        expect(gain, `${name}, albédo ${albedo}`).toBeLessThan(MAX_GAIN);
      }
    }
  });

  it('une matière déjà très lisse (yeux) ne devient pas un miroir mouillée, et aucune ne devient plus rugueuse', () => {
    const eyes = surfaceFor('MI_Eyes');
    for (const wetness of WETNESS_STEPS) {
      const wet = wetSurface(eyes, wetness);
      expect(wet.roughness, `yeux à ${wetness}`).toBeGreaterThanOrEqual(0.1);
      expect(wet.roughness, `yeux à ${wetness}`).toBeLessThanOrEqual(eyes.roughness);
    }
    const veryGlossy: Surface = { metallic: 0, roughness: 0.05, environmentIntensity: 0.8 }; // déjà sous le plancher : mouiller ne la rugosifie pas
    for (const wetness of WETNESS_STEPS) expect(wetSurface(veryGlossy, wetness).roughness).toBe(veryGlossy.roughness);
  });

  it('progressive et bornée (humidité hors de [0, 1] ramenée dedans)', () => {
    const bark = surfaceFor('Bark');
    expect(wetSurface(bark, 0.5).roughness).toBeLessThan(bark.roughness);
    expect(wetSurface(bark, 0.5).roughness).toBeGreaterThan(wetSurface(bark, 1).roughness);
    expect(wetSurface(bark, 7)).toEqual(wetSurface(bark, 1));
    expect(wetSurface(bark, -2)).toEqual(wetSurface(bark, 0));
  });
});

describe('surfaces physiques (PBR des matériaux solides)', () => {
  it('feuillage, herbe, plantes et fleurs restent hors PBR ; écorces, roches, champignons, personnages y passent', () => {
    for (const name of ['Grass', 'Leaves', 'Leaves_NormalTree', 'Leaf_Pine_C', 'Flowers', 'Clover_1', 'Fern_1', 'Plant_7', 'Petal_2', 'Bush_Leaves']) {
      expect(isFoliageMaterial(name), name).toBe(true);
    }
    for (const name of ['Bark_NormalTree', 'Bark_TwistedTree', 'Rocks', 'PathRocks', 'Mushrooms', 'MI_Superhero_Female', 'MI_Hair_2', 'Atlas']) {
      expect(isFoliageMaterial(name), name).toBe(false);
    }
  });

  it('diélectriques, la pierre et l’écorce mates, les yeux brillants', () => {
    for (const name of ['Rocks', 'PathRocks', 'Bark_DeadTree', 'Mushrooms', 'MI_Eyes', 'MI_Hair_2', 'MI_Superhero_Female', 'Atlas']) {
      const s = surfaceFor(name);
      expect(s.metallic, name).toBe(0);
      expect(s.roughness, name).toBeGreaterThan(0);
      expect(s.roughness, name).toBeLessThanOrEqual(1);
      expect(s.environmentIntensity, name).toBeGreaterThan(0);
      expect(s.environmentIntensity, name).toBeLessThanOrEqual(1);
    }
    expect(surfaceFor('Bark_NormalTree').roughness).toBeGreaterThanOrEqual(0.85);
    expect(surfaceFor('Rocks').roughness).toBeGreaterThanOrEqual(0.75);
    expect(surfaceFor('MI_Eyes').roughness).toBeLessThan(surfaceFor('MI_Superhero_Female').roughness);
  });

  it('un matériau inconnu prend la surface par défaut (satinée)', () => {
    expect(surfaceFor('Atlas')).toBe(DEFAULT_SURFACE);
  });
});
