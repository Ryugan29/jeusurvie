import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DAY_LENGTH_S, NIGHT_LENGTH_S } from '../../core/config/balance';
import { timeOfDay } from '../../core/survival/time-of-day';
import { WEATHER_KINDS, WEATHER_PRESETS, type WeatherKind } from '../../core/world/weather';
import { atmosphereFor } from './atmosphere';
import { CLEAR_NOON_LIGHT_PER_SKY, IBL_MAX, SIDE_FACE_MAX_RATIO, SIDE_FACE_SUN_SHARE, groundLight, iblIntensityFor, sideFaceLight, skyLuminance } from './environment-light';
import { lightingFor, luminance, type Lighting } from './lighting';
import { DEFAULT_SURFACE, surfaceFor, wetSurface, type WetSurface } from './surfaces';

const CYCLE_S = DAY_LENGTH_S + NIGHT_LENGTH_S;
/** Heures de la mesure (fraction du cycle) : matin, midi, crépuscule, cœur de la nuit. */
const MORNING = 0.06, NOON = 0.3, DUSK = 0.64, NIGHT = 0.85;
const DAY_HOURS = [MORNING, NOON, DUSK] as const;

/** Lumière de la scène à cette heure (fraction du cycle), par ce temps (sol sec), pendant cet éclair. */
const sceneLight = (fraction: number, kind: WeatherKind, flash = 0): Lighting =>
  atmosphereFor(lightingFor(timeOfDay(fraction * CYCLE_S)), { ...WEATHER_PRESETS[kind], wetness: 0 }, flash).light;
/** Même chose pour un ciel plus ou moins couvert, sans pluie ni orage ni brouillard (seule la couverture varie). */
const coveredLight = (fraction: number, cloudCover: number): Lighting =>
  atmosphereFor(lightingFor(timeOfDay(fraction * CYCLE_S)), { cloudCover, rain: 0, storm: 0, fog: 0, wind: 0, wetness: 0 }, 0).light;

/**
 * Approximation (celle de la mesure en jeu) du rapport entre la lumière reçue par un personnage (face verticale : demi-ambiance
 * ciel + sol, soleil de côté, reflet du ciel) et par le sol plat (ambiance + soleil selon sa hauteur), `ibl` réglant le reflet du ciel.
 * `surface` : la matière du personnage (sa part de reflet), mouillée ou non : l'eau l'assombrit (`darken`), elle ne change pas le sol ici.
 */
function characterToGroundRatio(l: Lighting, ibl: number, surface: WetSurface = wetSurface(DEFAULT_SURFACE, 0)): number {
  const character = sideFaceLight(l) + surface.environmentIntensity * skyLuminance(l) * ibl;
  return (character * surface.darken) / groundLight(l);
}
/** Au-delà, le personnage ressort trop clair, délavé, sans contraste avec le décor. */
const MAX_CHARACTER_TO_GROUND = 1.1;

/** Matières solides du jeu (une par réglage de la table des surfaces) : roche, écorce, champignon, cheveux, peau, démon, défaut. */
const BODY_MATERIALS = ['Rocks', 'Bark_NormalTree', 'Mushrooms', 'MI_Hair_2', 'MI_Superhero_Female', 'Demon', 'Atlas'];
/** Le matin élargi, en fractions du cycle : de 0,90 (la lune est basse, l'aube approche) au 0,15 (soleil haut), de 0,01 en 0,01. */
const MORNING_FRACTIONS = [...Array.from({ length: 10 }, (_, i) => (90 + i) / 100), ...Array.from({ length: 16 }, (_, i) => i / 100)];
/** Lumière ET humidité de la scène à cette heure, comme en jeu avec un temps imposé : sol mouillé autant qu'il pleut. */
const sceneAndWetness = (fraction: number, kind: WeatherKind): { light: Lighting; wetness: number } => {
  const a = atmosphereFor(lightingFor(timeOfDay(fraction * CYCLE_S)), { ...WEATHER_PRESETS[kind], wetness: WEATHER_PRESETS[kind].rain }, 0);
  return { light: a.light, wetness: a.wetness };
};

describe('iblIntensityFor (le reflet du ciel suit la lumière réelle de la scène)', () => {
  describe('sideFaceLight (lumière reçue par une face verticale, un personnage vu de côté)', () => {
    const base = sceneLight(NOON, 'clair');
    const noSun: Lighting = { ...base, sunIntensity: 0 };
    const bright = (l: Lighting): number => l.sunIntensity * luminance(l.sunColor);

    it('sans astre : la moyenne de l’ambiance du ciel (dessus) et de celle du sol (dessous)', () => {
      const up = noSun.ambientIntensity * luminance(noSun.ambientColor), down = noSun.ambientIntensity * luminance(noSun.ambientGroundColor);
      expect(sideFaceLight(noSun)).toBeCloseTo((up + down) / 2, 9);
    });

    it('astre rasant l’horizon : sa part de côté s’ajoute en entier (× SIDE_FACE_SUN_SHARE)', () => {
      const low: Lighting = { ...base, sunDirection: { x: 1, y: 0, z: 0 } };
      expect(sideFaceLight(low) - sideFaceLight(noSun)).toBeCloseTo(bright(low) * SIDE_FACE_SUN_SHARE, 9);
    });

    it('astre au zénith : rien ne frappe les faces verticales', () => {
      const overhead: Lighting = { ...base, sunDirection: { x: 0, y: -1, z: 0 } };
      expect(sideFaceLight(overhead)).toBeCloseTo(sideFaceLight(noSun), 9);
    });

    it('plus l’astre est bas, plus il frappe la face verticale (à puissance égale)', () => {
      const at = (y: number): number => sideFaceLight({ ...base, sunDirection: { x: Math.sqrt(1 - y * y), y: -y, z: 0 } });
      expect(at(0.2)).toBeGreaterThan(at(0.5));
      expect(at(0.5)).toBeGreaterThan(at(0.9));
    });
  });

  it('plein jour clair, à midi : 1, le rendu validé par beau temps est inchangé (à 3 % près)', () => {
    expect(iblIntensityFor(sceneLight(NOON, 'clair'))).toBeGreaterThanOrEqual(0.97);
    expect(iblIntensityFor(sceneLight(NOON, 'clair'))).toBeLessThanOrEqual(1.03);
  });

  it('le repère de plein jour est bien « lumière du sol / luminance du ciel » de midi clair', () => {
    const noon = sceneLight(NOON, 'clair');
    expect(groundLight(noon) / skyLuminance(noon)).toBeCloseTo(CLEAR_NOON_LIGHT_PER_SKY, 1);
  });

  it('en pleine journée (soleil haut), le plafond « combler seulement » ne joue pas : le reflet suit la lumière, par tout temps', () => {
    // De 0,10 à 0,50 du cycle, les faces verticales reçoivent bien moins que le sol : il y a de la place pour tout le reflet.
    for (const kind of WEATHER_KINDS) {
      for (let hour = 0.1; hour <= 0.5; hour += 0.04) {
        const l = sceneLight(hour, kind);
        const followsLight = Math.min(IBL_MAX, groundLight(l) / (CLEAR_NOON_LIGHT_PER_SKY * skyLuminance(l)));
        expect(iblIntensityFor(l), `${kind} à ${hour.toFixed(2)}`).toBeCloseTo(followsLight, 9);
      }
    }
  });

  it('la lune basse avant l’aube frappe déjà les faces verticales : le reflet est réduit pour ne pas les rendre plus claires que le sol', () => {
    const l = sceneLight(0.95, 'clair');
    const followsLight = groundLight(l) / (CLEAR_NOON_LIGHT_PER_SKY * skyLuminance(l));
    expect(iblIntensityFor(l)).toBeLessThan(followsLight * 0.5);
    expect(iblIntensityFor(l)).toBeGreaterThan(0); // le personnage garde un liseré de ciel
  });

  it('un soleil qui baisse ou un ciel qui se couvre baisse le reflet : le matin et le crépuscule sont plus bas que midi', () => {
    const noon = iblIntensityFor(sceneLight(NOON, 'clair'));
    expect(iblIntensityFor(sceneLight(MORNING, 'clair'))).toBeLessThan(noon * 0.7);
    expect(iblIntensityFor(sceneLight(DUSK, 'clair'))).toBeLessThan(noon * 0.7);
  });

  it('à midi, plus le temps est chargé, plus le reflet baisse : clair > nuageux > bruine > pluie', () => {
    const at = (kind: WeatherKind): number => iblIntensityFor(sceneLight(NOON, kind));
    expect(at('nuageux')).toBeLessThan(at('clair'));
    expect(at('bruine')).toBeLessThan(at('nuageux'));
    expect(at('pluie')).toBeLessThan(at('bruine'));
  });

  it('le reflet du ciel ne monte jamais quand la météo se couvre (soleil levé : à heure fixe, de 0 à 100 % de nuages)', () => {
    // Du lever (0,06) au crépuscule (0,64), de 0,02 en 0,02 ; la couverture monte de 5 % en 5 %.
    for (let h = 3; h <= 32; h++) {
      const hour = h * 0.02;
      let previousSetting = Number.POSITIVE_INFINITY, previousSent = Number.POSITIVE_INFINITY;
      for (let c = 0; c <= 20; c++) {
        const l = coveredLight(hour, c / 20);
        const setting = iblIntensityFor(l), sent = setting * skyLuminance(l);
        expect(setting, `réglage, heure ${hour.toFixed(2)}, couverture ${c * 5} %`).toBeLessThanOrEqual(previousSetting + 1e-9);
        expect(sent, `reflet envoyé, heure ${hour.toFixed(2)}, couverture ${c * 5} %`).toBeLessThanOrEqual(previousSent + 1e-9);
        previousSetting = setting;
        previousSent = sent;
      }
    }
  });

  it('à l’aube et en fin de crépuscule (soleil éteint), le reflet suit l’ambiance qui monte sous les nuages, d’au plus 25 %', () => {
    // Sans soleil à voiler, il ne reste que l'ambiance, et atmosphere la relève de 30 % sous un ciel couvert (la lumière vient de
    // partout) : la scène est vraiment plus claire, le reflet la suit (+17 % mesuré, sur une valeur basse : 0,22 → 0,26 à l'aube).
    // Ce n'est pas le défaut corrigé ici (un soleil qui s'éteint pendant que le ciel gris reste clair) mais la borne reste testée.
    // Hors des heures de lune rasante : là, voiler la lune libère de la place pour le reflet (test suivant).
    const dawnAndDusk = [...Array.from({ length: 4 }, (_, i) => i / 50), ...Array.from({ length: 3 }, (_, i) => (32 + i) / 50)];
    for (const hour of dawnAndDusk) {
      const clear = iblIntensityFor(coveredLight(hour, 0));
      for (let c = 1; c <= 20; c++) {
        expect(iblIntensityFor(coveredLight(hour, c / 20)), `heure ${hour.toFixed(2)}, couverture ${c * 5} %`).toBeLessThanOrEqual(clear * 1.25);
      }
    }
  });

  it('quand le ciel se couvre, le personnage ne ressort pas plus clair par rapport au sol : au plus 30 % de plus, à toute heure', () => {
    // Lune ou soleil rasants : ils frappent les faces verticales plus fort que le sol, et un ciel couvert les voile. Le personnage perd
    // alors plus de lumière directe que le sol, et le reflet (qui ne fait que combler) peut remonter : le reflet seul monte jusqu'à
    // ×2,5 (de 0,13 à 0,34 vers 0,74), mais le personnage, lui, suit le sol (mesuré : la lumière du personnage monte comme celle du sol).
    // Ce qui compte est donc le rapport personnage / sol : mesuré, il monte au pire de 23 % (midi, ciel couvert : le soleil voilé).
    for (let h = 0; h <= 100; h++) {
      const hour = h / 100;
      const clearLight = coveredLight(hour, 0);
      const clearRatio = characterToGroundRatio(clearLight, iblIntensityFor(clearLight));
      for (let c = 1; c <= 20; c++) {
        const l = coveredLight(hour, c / 20);
        expect(characterToGroundRatio(l, iblIntensityFor(l)) / clearRatio, `heure ${hour.toFixed(2)}, couverture ${c * 5} %`).toBeLessThanOrEqual(1.3);
      }
    }
  });

  it('le reflet réellement envoyé (réglage × luminance du ciel peint) ne dépasse jamais sa part de la lumière de la scène', () => {
    // Même sous un ciel couvert plus clair que le bleu : le ciel gris ne « rajoute » pas de lumière que la scène n'a pas.
    const reference = 1 / CLEAR_NOON_LIGHT_PER_SKY;
    for (const kind of WEATHER_KINDS) {
      for (let hour = 0; hour < 1; hour += 0.02) {
        const l = sceneLight(hour, kind);
        expect(iblIntensityFor(l) * skyLuminance(l), `${kind} à ${hour.toFixed(2)}`).toBeLessThanOrEqual(groundLight(l) * reference + 1e-9);
      }
    }
  });

  it('sous l’orage, le reflet envoyé est plus faible que sous la pluie (tout est plus sombre)', () => {
    for (const hour of DAY_HOURS) {
      const rain = sceneLight(hour, 'pluie'), storm = sceneLight(hour, 'orage');
      expect(iblIntensityFor(storm) * skyLuminance(storm), `heure ${hour}`).toBeLessThan(iblIntensityFor(rain) * skyLuminance(rain));
    }
  });

  describe('critère de rendu : le personnage ne ressort jamais plus clair que le sol', () => {
    it('sans suivi (reflet toujours à 1), le défaut existe : la pluie à midi dépasse 1,10', () => {
      expect(characterToGroundRatio(sceneLight(NOON, 'pluie'), 1)).toBeGreaterThan(MAX_CHARACTER_TO_GROUND);
    });

    for (const kind of WEATHER_KINDS) {
      it(`météo « ${kind} » : rapport personnage / sol ≤ 1,10 le matin, à midi et au crépuscule`, () => {
        for (const hour of DAY_HOURS) {
          const l = sceneLight(hour, kind);
          expect(characterToGroundRatio(l, iblIntensityFor(l)), `${kind} à ${hour}`).toBeLessThanOrEqual(MAX_CHARACTER_TO_GROUND);
        }
      });
    }

    // Le matin élargi : la lune baisse avant l'aube (0,90 à 1), puis le soleil se lève (0 à 0,15). Une lumière rasante frappe les faces
    // verticales plus fort que le sol (le défaut mesuré avant correction : jusqu'à 1,24 par temps clair vers 0,95).
    for (const kind of WEATHER_KINDS) {
      it(`météo « ${kind} » : tout le matin élargi (0,90 à 0,15), aucune matière solide à plus de 1,10 du sol, mouillée comme en jeu`, () => {
        for (const fraction of MORNING_FRACTIONS) {
          const { light, wetness } = sceneAndWetness(fraction, kind);
          for (const material of BODY_MATERIALS) {
            const ratio = characterToGroundRatio(light, iblIntensityFor(light), wetSurface(surfaceFor(material), wetness));
            expect(ratio, `${kind}, ${material}, heure ${fraction.toFixed(2)}`).toBeLessThanOrEqual(MAX_CHARACTER_TO_GROUND);
          }
        }
      });
    }

    it('midi clair : le personnage garde exactement son éclairage d’avant (à 3 % près)', () => {
      const l = sceneLight(NOON, 'clair');
      const before = characterToGroundRatio(l, 1), after = characterToGroundRatio(l, iblIntensityFor(l));
      expect(Math.abs(after / before - 1)).toBeLessThanOrEqual(0.03);
    });
  });

  it('la nuit ne devient jamais noire : le personnage reste à 85 % ou plus de son éclairage d’avant, par tout temps', () => {
    for (const kind of WEATHER_KINDS) {
      const l = sceneLight(NIGHT, kind);
      const before = characterToGroundRatio(l, 1), after = characterToGroundRatio(l, iblIntensityFor(l));
      expect(after / before, `nuit, ${kind}`).toBeGreaterThanOrEqual(0.85);
    }
  });

  it('un éclair éclaire aussi le reflet (il monte avec l’éclat), sans dépasser le plafond', () => {
    const dark = iblIntensityFor(sceneLight(MORNING, 'orage', 0));
    const half = iblIntensityFor(sceneLight(MORNING, 'orage', 0.5));
    const full = iblIntensityFor(sceneLight(MORNING, 'orage', 1));
    expect(half).toBeGreaterThan(dark);
    expect(full).toBeGreaterThanOrEqual(half);
    expect(full).toBeLessThanOrEqual(IBL_MAX);
  });

  it('change doucement le long du cycle : aucun saut d’une image à l’autre, par aucun temps', () => {
    // Un saut (une marche dans le calcul) serait de l'ordre de 0,3. La pente la plus raide, mesurée : 0,061 pour 0,002 du cycle (2,4 s de
    // jeu), vers 0,8 avec le ciel de nuit réaliste (ADR 0012) : la lune basse, le reflet suit un sol qui s'assombrit.
    const step = 0.002;
    for (const kind of WEATHER_KINDS) {
      let previous = iblIntensityFor(sceneLight(0, kind));
      for (let hour = step; hour < 1; hour += step) {
        const value = iblIntensityFor(sceneLight(hour, kind));
        expect(Math.abs(value - previous), `${kind} à ${hour.toFixed(3)}`).toBeLessThan(0.08);
        previous = value;
      }
    }
  });

  describe('bornes et entrées absurdes', () => {
    const base = sceneLight(NOON, 'clair');

    it('reste dans [0, plafond] pour toute heure, toute météo et tout éclair (propriété)', () => {
      const unit = fc.double({ min: 0, max: 1, noNaN: true });
      fc.assert(
        fc.property(unit, unit, unit, unit, unit, unit, (hour, cloudCover, rain, storm, fog, flash) => {
          const l = atmosphereFor(
            lightingFor(timeOfDay(hour * CYCLE_S)),
            { cloudCover, rain, storm, fog, wind: 0, wetness: 0 },
            flash,
          ).light;
          const value = iblIntensityFor(l);
          return Number.isFinite(value) && value >= 0 && value <= IBL_MAX;
        }),
      );
    });

    it('le personnage de référence (sec) ne dépasse jamais le rapport visé au sol, pour toute heure et toute météo (propriété)', () => {
      const unit = fc.double({ min: 0, max: 1, noNaN: true });
      fc.assert(
        fc.property(unit, unit, unit, unit, unit, unit, (hour, cloudCover, rain, storm, fog, flash) => {
          const l = atmosphereFor(lightingFor(timeOfDay(hour * CYCLE_S)), { cloudCover, rain, storm, fog, wind: 0, wetness: 0 }, flash).light;
          return characterToGroundRatio(l, iblIntensityFor(l)) <= SIDE_FACE_MAX_RATIO + 1e-9;
        }),
      );
    });

    it('jamais au-dessus du plafond, même avec une lumière démesurée', () => {
      expect(iblIntensityFor({ ...base, ambientIntensity: 1e9 })).toBe(IBL_MAX);
    });

    it('jamais négatif, même avec une lumière négative', () => {
      expect(iblIntensityFor({ ...base, ambientIntensity: -5, sunIntensity: -5 })).toBe(0);
    });

    it('scène sans aucune lumière : 0 (pas de division par zéro)', () => {
      expect(iblIntensityFor({ ...base, ambientIntensity: 0, sunIntensity: 0 })).toBe(0);
    });

    it('ciel entièrement noir : le plafond, sans NaN (le reflet d’un ciel noir n’éclaire rien)', () => {
      expect(iblIntensityFor({ ...base, skyZenith: [0, 0, 0], skyHorizon: [0, 0, 0] })).toBe(IBL_MAX);
    });

    it('valeurs absurdes (NaN, infini) : le rendu d’avant (plafond), jamais NaN envoyé à la carte graphique', () => {
      expect(iblIntensityFor({ ...base, ambientIntensity: Number.NaN })).toBe(IBL_MAX);
      expect(iblIntensityFor({ ...base, sunIntensity: Number.NaN })).toBe(IBL_MAX);
      expect(iblIntensityFor({ ...base, skyZenith: [Number.NaN, 0.5, 0.5] })).toBe(IBL_MAX);
      expect(iblIntensityFor({ ...base, sunDirection: { x: 0, y: Number.NaN, z: 0 } })).toBe(IBL_MAX);
      // Direction à moitié absurde : le sol (qui n'utilise que la hauteur) reste fini, seule la face verticale (qui utilise x et z) est NaN.
      expect(iblIntensityFor({ ...base, sunDirection: { x: Number.NaN, y: -0.5, z: 0 } })).toBe(IBL_MAX);
      expect(iblIntensityFor({ ...base, ambientIntensity: Number.POSITIVE_INFINITY })).toBe(IBL_MAX);
    });
  });
});
