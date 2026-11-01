// Atmosphère de la scène (PUR, sans Babylon) : la lumière de l'heure (lighting) passée en HDR, puis la météo du monde
// (core/world/weather) et les éclairs par-dessus. C'est ce que le rendu applique à chaque image.
// HDR : le soleil éclaire nettement plus fort que l'ambiance (ombres franches et colorées, comme au cinéma) ; l'image est
// ensuite « développée » par l'étalonnage (tone mapping ACES, adapters/babylon/post-processing), qui adoucit les zones
// très claires au lieu de les brûler — et le disque du soleil, bien au-delà de 1, fait rayonner le halo (bloom).
// Ciel couvert : le soleil se voile, le ciel et la brume tournent au gris, l'ambiance devient diffuse ; l'orage assombrit tout.
import { hash2 } from '../../core/shared/hash';
import { smoothstep } from '../../core/shared/math';
import type { Weather } from '../../core/world/weather';
import { HAZE_LIGHTEN, fogDensityFor } from './fog';
import type { Grade } from './grade';
import { luminance, type Lighting } from './lighting';
import type { Rgb } from './palette';

/** Le soleil en HDR : renforcé par rapport à la lumière « peinte » de l'heure. */
export const SUN_HDR_GAIN = 1.8;
/** L'ambiance (lumière du ciel dans l'ombre) un peu baissée : le soleil éclaire ~4× plus qu'elle à midi. */
export const AMBIENT_HDR_GAIN = 0.85;

export interface Atmosphere {
  readonly light: Lighting;
  /** Part du ciel couverte (0 à 1). */
  readonly cloudCover: number;
  /** Pluie qui tombe (0 à 1). */
  readonly rain: number;
  /** Brouillard (0 à 1). */
  readonly fog: number;
  /** Sol mouillé (0 à 1). */
  readonly wetness: number;
  /** Force du vent (0 à 1). */
  readonly wind: number;
  /** Éclat de l'éclair en cours (0 à 1). */
  readonly flash: number;
  /** Multiplie la densité de la brume de distance de l'heure (1 = inchangée) : la pluie l'épaissit un peu. */
  readonly fogDensityFactor: number;
  /** Densité (par mètre) de la brume du brouillard, ajoutée à celle de l'heure (0 = aucune) : voir distanceFogDensity. */
  readonly fogBankDensity: number;
}

/** Couverture à partir de laquelle le ciel commence à se voiler, et où il est entièrement gris. */
const OVERCAST_FROM = 0.3, OVERCAST_FULL = 1;
/** Part du soleil retirée par un ciel entièrement couvert. */
const SUN_VEIL = 0.75;
/** Gris (légèrement bleuté) d'un ciel couvert, ramené à la luminosité de l'horizon de l'heure. */
const OVERCAST_GREY: Rgb = [0.42, 0.45, 0.5];
const OVERCAST_SKY_SHARE = 0.85, OVERCAST_HORIZON_SHARE = 0.75;
/** Ce que l'orage retire à la luminosité du ciel couvert, à l'ambiance et aux nuages. */
const STORM_SKY_DARKEN = 0.5, STORM_AMBIENT_DARKEN = 0.4, STORM_CLOUD_DARKEN = 0.55;
/** Pluie : le dessous des nuages fonce et tourne au gris ardoise (bleuté), pour se détacher du ciel couvert derrière. */
const RAIN_CLOUD_DARKEN = 0.35;
const SLATE: Rgb = [0.86, 0.92, 1.04];
/** Sous un ciel couvert, la lumière vient de partout : l'ambiance monte un peu. */
const OVERCAST_AMBIENT_LIFT = 0.3;
/** Éclair : lumière bleutée ajoutée au ciel, à la brume et à l'ambiance. */
const FLASH_SKY: Rgb = [0.5, 0.55, 0.7];
const FLASH_AMBIENT = 2.5;
/** Brume : la pluie multiplie celle de l'heure jusqu'à 1 + RAIN_FOG (≤ 10 % de brume à 6 m, même orage au crépuscule, vue 512 m). */
const RAIN_FOG = 2.5;
/**
 * Brouillard plein : brume ajoutée à celle de l'heure, réglée pour qu'il ne reste que FOG_BANK_VISIBILITY de visibilité à
 * FOG_BANK_DISTANCE_M. Pour une brume exponentielle, cela fait ~19 % de brume à 6 m (le proche garde sa couleur) mais
 * 88 % à 60 m et 98 % à 120 m (le loin se noie). Absolue, donc la même à toute heure : la brume de l'heure (≤ 0,005 par
 * mètre) n'y change presque rien.
 */
const FOG_BANK_DISTANCE_M = 60, FOG_BANK_VISIBILITY = 0.12;
const FOG_BANK_DENSITY = fogDensityFor(FOG_BANK_DISTANCE_M, FOG_BANK_VISIBILITY);
/**
 * Poids du brouillard dans sa brume et dans le plafond de sa couleur : le carré de sa force (comme l'ancien FOG_BOOST). Un
 * voile léger (bruine 0,25 ; pluie 0,15 ; orage 0,1) ne compte que pour 6 %, 2 % et 1 % d'un brouillard plein : la brume ne
 * s'épaissit vraiment qu'en vrai brouillard.
 */
const fogBankWeight = (fog: number): number => fog * fog;
/**
 * Plafond de la luminosité de la brume de brouillard, en part de la lumière reçue par le sol (sceneBrightness). Une brume
 * plus claire que le décor éclairé le « blanchit » (démon, héroïne : silhouettes pâles, sans couleur). Le décor renvoie 0,4 à
 * 0,6 de la lumière reçue (terre 0,4 ; roche 0,5 ; herbe 0,6) et la neige 0,95 : à 0,75 la brume reste un voile plus clair
 * que l'herbe mais plus sombre que la neige. Rapport brume / sol avant plafond : 0,76 à midi et 0,44 la nuit (déjà sous le
 * plafond : presque rien ne change) ; ~1,65 le matin et au crépuscule (halo du lever et du coucher), ramené à 0,75.
 */
export const FOG_LIGHT_CEILING = 0.75;
/** Étalonnage : désaturation par la pluie et le brouillard (pleins), surexposition d'un éclair plein. */
const RAIN_DESATURATION = 35, FOG_DESATURATION = 18, FLASH_EXPOSURE = 0.4;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const scale = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
const tint = (c: Rgb, t: Rgb, k: number): Rgb => [c[0] * mix(1, t[0], k), c[1] * mix(1, t[1], k), c[2] * mix(1, t[2], k)];
const add = (c: Rgb, d: Rgb, k: number): Rgb => [c[0] + d[0] * k, c[1] + d[1] * k, c[2] + d[2] * k];
/** Gris de même luminance. */
const grey = (c: Rgb): Rgb => {
  const l = luminance(c);
  return [l, l, l];
};

/** Lumière de la scène à cette heure, par ce temps, pendant cet éclair (`flash`, 0 à 1). */
export function atmosphereFor(l: Lighting, w: Weather, flash: number): Atmosphere {
  const overcast = smoothstep(OVERCAST_FROM, OVERCAST_FULL, w.cloudCover);
  const dark = w.storm;
  const veil = 1 - SUN_VEIL * overcast;
  const overcastSky = scale(OVERCAST_GREY, (luminance(l.skyHorizon) * (1 - STORM_SKY_DARKEN * dark)) / luminance(OVERCAST_GREY));
  const light: Lighting = {
    ...l,
    skyZenith: add(mixRgb(l.skyZenith, scale(overcastSky, 0.85), overcast * OVERCAST_SKY_SHARE), FLASH_SKY, flash),
    skyHorizon: add(mixRgb(l.skyHorizon, overcastSky, overcast * OVERCAST_HORIZON_SHARE), FLASH_SKY, flash),
    fogColor: add(mixRgb(l.fogColor, overcastSky, Math.max(w.fog, overcast * 0.85)), FLASH_SKY, flash * 0.6),
    sunColor: mixRgb(l.sunColor, grey(l.sunColor), overcast * 0.5),
    sunIntensity: l.sunIntensity * SUN_HDR_GAIN * veil,
    shadowIntensity: l.shadowIntensity * veil,
    ambientColor: mixRgb(l.ambientColor, grey(l.ambientColor), overcast * 0.6),
    ambientIntensity:
      l.ambientIntensity * AMBIENT_HDR_GAIN * (1 + OVERCAST_AMBIENT_LIFT * overcast) * (1 - STORM_AMBIENT_DARKEN * dark) + FLASH_AMBIENT * flash,
    cloudLight: add(scale(mixRgb(l.cloudLight, scale(overcastSky, 1.15), overcast * 0.5), 1 - STORM_CLOUD_DARKEN * dark), FLASH_SKY, flash),
    cloudShade: scale(
      tint(mixRgb(l.cloudShade, scale(overcastSky, 0.6), overcast * 0.5), SLATE, w.rain),
      (1 - 0.3 * overcast - 0.25 * dark) * (1 - RAIN_CLOUD_DARKEN * w.rain),
    ),
    starVisibility: l.starVisibility * (1 - overcast),
    sunGlow: l.sunGlow * (1 - 0.9 * overcast),
    rayStrength: l.rayStrength * (1 - smoothstep(0.2, 0.7, overcast)),
  };
  return {
    light: { ...light, fogColor: limitFogLight(light, w.fog) },
    cloudCover: w.cloudCover,
    rain: w.rain,
    fog: w.fog,
    wetness: w.wetness,
    wind: w.wind,
    flash,
    fogDensityFactor: 1 + RAIN_FOG * w.rain,
    fogBankDensity: FOG_BANK_DENSITY * fogBankWeight(w.fog),
  };
}

/**
 * Couleur de brume plafonnée par temps de brouillard : sa luminosité est ramenée, après l'éclaircissement de hazeColor, sous
 * FOG_LIGHT_CEILING × la lumière du sol (on plafonne donc la couleur avant ce HAZE_LIGHTEN). Teinte conservée ; effet
 * proportionnel à fogBankWeight (comme la densité) : sans brouillard, la couleur de brume est strictement inchangée.
 */
function limitFogLight(l: Lighting, fog: number): Rgb {
  const hazeMax = FOG_LIGHT_CEILING * sceneBrightness(l);
  const fogMax = Math.max(0, (hazeMax - HAZE_LIGHTEN) / (1 - HAZE_LIGHTEN));
  const lum = luminance(l.fogColor);
  if (lum <= fogMax) return l.fogColor;
  return mixRgb(l.fogColor, scale(l.fogColor, fogMax / lum), fogBankWeight(fog));
}

/**
 * Densité de la brume de distance (par mètre) : celle de l'heure (`hourDensity`, réglée par fogDensityFor), épaissie par la
 * pluie, plus la brume propre du brouillard. Par temps clair ou nuageux, c'est exactement la densité de l'heure.
 */
export function distanceFogDensity(a: Atmosphere, hourDensity: number): number {
  return hourDensity * a.fogDensityFactor + a.fogBankDensity;
}

/** Lumière reçue par un sol plat (ambiance + astre selon sa hauteur), bornée à [0, 1] : 1 en plein jour, faible la nuit. */
export function sceneBrightness(l: Lighting): number {
  const lit = l.ambientIntensity * luminance(l.ambientColor) + l.sunIntensity * luminance(l.sunColor) * Math.max(0, -l.sunDirection.y);
  return Math.min(1, Math.max(0, lit));
}

/** Étalonnage de l'heure corrigé par la météo : pluie et brouillard ternissent, un éclair surexpose. */
export function weatherGrade(g: Grade, a: Atmosphere): Grade {
  return {
    ...g,
    exposure: g.exposure * (1 + FLASH_EXPOSURE * a.flash),
    saturation: g.saturation - RAIN_DESATURATION * a.rain - FOG_DESATURATION * a.fog,
  };
}

/** Un éclair peut éclater dans chaque créneau de LIGHTNING_SLOT_S secondes ; chance par créneau en plein orage. */
const LIGHTNING_SLOT_S = 3;
const LIGHTNING_CHANCE = 0.45;
/** Durée (s) d'un éclair : flash, bref creux, second flash, puis extinction. */
const LIGHTNING_LENGTH_S = 0.7;
const LIGHTNING_SALT = 0x1a7e;

function lightningEnvelope(dt: number): number {
  if (dt < 0.07) return 1;
  if (dt < 0.13) return 0.25;
  if (dt < 0.2) return 0.85;
  return 0.85 * Math.exp(-(dt - 0.2) * 7);
}

/**
 * Éclat d'un éclair (0 = rien, 1 = flash maximal) au temps `timeS` (s d'horloge réelle : un éclair dure toujours le même
 * temps, cycle accéléré ou non), selon la force de l'orage `storm` (0 à 1). Déterministe.
 */
export function lightningFlash(seed: number, timeS: number, storm: number): number {
  if (!(storm > 0) || !(timeS >= 0)) return 0;
  const slot = Math.floor(timeS / LIGHTNING_SLOT_S);
  if (hash2(seed, slot, 1, LIGHTNING_SALT) / 0x100000000 >= LIGHTNING_CHANCE * Math.min(1, storm)) return 0;
  const offset = (hash2(seed, slot, 2, LIGHTNING_SALT) / 0x100000000) * (LIGHTNING_SLOT_S - LIGHTNING_LENGTH_S);
  const dt = timeS - slot * LIGHTNING_SLOT_S - offset;
  if (dt < 0 || dt >= LIGHTNING_LENGTH_S) return 0;
  return lightningEnvelope(dt) * (0.6 + 0.4 * (hash2(seed, slot, 3, LIGHTNING_SALT) / 0x100000000));
}
