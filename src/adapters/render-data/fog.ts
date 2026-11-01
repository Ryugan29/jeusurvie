// Brume (pure, testée ; le shader du terrain en est la copie exacte, voir adapters/babylon/height-fog-plugin.ts).
// 1. Brume de distance exponentielle (Babylon FOGMODE_EXP) : visibilité = exp(−d · densité). Contrairement à
//    EXP2 (exp(−(d·densité)²), quasi nulle de près), elle se voit dès les distances moyennes.
// 2. Brume de hauteur : s'accumule avec la distance, mais seulement en bas (fonds de vallées), et selon l'heure.
import { smoothstep } from '../../core/shared/math';
import type { TimeOfDay } from '../../core/survival/time-of-day';
import { luminance, type Lighting } from './lighting';
import type { Rgb } from './palette';

/** Visibilité (1 = net, 0 = entièrement dans la brume) à la distance d (m). */
export function fogVisibility(distanceM: number, density: number): number {
  return Math.exp(-distanceM * density);
}

/** Part de brume (0 = net, 1 = entièrement dans la brume) à la distance d (m) : le complément de la visibilité. */
export function fogAmount(distanceM: number, density: number): number {
  return 1 - fogVisibility(distanceM, density);
}

/**
 * Densité telle qu'à `distanceM`, la visibilité vaille exactement `visibility`.
 * @throws RangeError si visibility ∉ ]0, 1[ ou si distanceM n'est pas un nombre fini > 0 (erreur de réglage).
 */
export function fogDensityFor(distanceM: number, visibility: number): number {
  if (!(visibility > 0 && visibility < 1)) throw new RangeError(`visibilité de brume hors de ]0, 1[ : ${visibility}`);
  if (!(Number.isFinite(distanceM) && distanceM > 0)) throw new RangeError(`distance de brume invalide : ${distanceM}`);
  return -Math.log(visibility) / distanceM;
}

export interface HeightFog {
  /** Densité de la brume de hauteur au niveau de base (par mètre parcouru par le regard). */
  readonly density: number;
  /** Épaisseur (m) : la brume diminue de e à chaque `thickness` mètres au-dessus de la base. */
  readonly thickness: number;
}

/**
 * Part de brume de hauteur (0 à 1) pour un point vu à `distanceM`, situé `heightAboveBaseM` au-dessus de la base :
 * (1 − exp(−d · densité)) · exp(−max(0, h) / épaisseur).
 */
export function heightFogAmount(distanceM: number, heightAboveBaseM: number, fog: HeightFog): number {
  return (1 - Math.exp(-distanceM * fog.density)) * Math.exp(-Math.max(0, heightAboveBaseM) / fog.thickness);
}

/** Images clés de la brume de hauteur le long du cycle (fraction ; 0 = lever du jour). */
const HEIGHT_FOG_KEYS: readonly (HeightFog & { readonly at: number })[] = [
  { at: 0, density: 0.014, thickness: 28 }, // aube : brume épaisse dans les vallées, qui ne monte pas aux sommets
  { at: 0.12, density: 0.009, thickness: 24 },
  { at: 0.3, density: 0.003, thickness: 14 }, // milieu de journée : légère
  { at: 0.5, density: 0.003, thickness: 14 },
  { at: 0.66, density: 0.011, thickness: 32 }, // crépuscule : elle remonte
  { at: 0.85, density: 0.008, thickness: 26 }, // nuit
  { at: 1, density: 0.014, thickness: 28 },
];

export function heightFogFor(time: TimeOfDay): HeightFog {
  const f = time.dayFraction - Math.floor(time.dayFraction);
  let i = 0;
  while (i < HEIGHT_FOG_KEYS.length - 2 && f >= HEIGHT_FOG_KEYS[i + 1]!.at) i++;
  const a = HEIGHT_FOG_KEYS[i]!, b = HEIGHT_FOG_KEYS[i + 1]!;
  const t = (f - a.at) / (b.at - a.at);
  return { density: a.density + (b.density - a.density) * t, thickness: a.thickness + (b.thickness - a.thickness) * t };
}

/** Part de désaturation (vers le gris de même luminance) et d'éclaircissement (vers le blanc) de la brume. */
const HAZE_DESATURATE = 0.15;
/** Exportée : l'atmosphère plafonne la luminosité de la brume de brouillard, donc doit inverser cet éclaircissement. */
export const HAZE_LIGHTEN = 0.05;

/**
 * Teinte de la brume : la couleur de brume de l'ambiance, désaturée et éclaircie, donc distincte de l'horizon du
 * ciel (sinon le lointain se fond dans le ciel et la brume ne se voit pas) tout en gardant la teinte de l'heure.
 * Luminance obtenue : celle de la couleur de brume + HAZE_LIGHTEN × (1 − celle-ci) (la désaturation la conserve).
 */
export function hazeColor(l: Lighting): Rgb {
  const gray = luminance(l.fogColor);
  const c = l.fogColor.map((v) => v + (gray - v) * HAZE_DESATURATE).map((v) => v + (1 - v) * HAZE_LIGHTEN);
  return [c[0]!, c[1]!, c[2]!];
}

/** Hauteur relative du dôme (0 = horizon, 1 = zénith) au-delà de laquelle le ciel ne prend plus la teinte de brume. */
const HAZE_HORIZON_BAND = 0.15;

/**
 * Poids de la teinte de brume dans le ciel à cette hauteur du dôme : 1 à l'horizon (le lointain embrumé et le bas du
 * ciel se confondent, le bord du monde chargé ne se voit pas), 0 au-dessus de la bande, transition douce.
 */
export function hazeHorizonWeight(heightFraction: number): number {
  return 1 - smoothstep(0, HAZE_HORIZON_BAND, heightFraction);
}

/** Visibilité restante au bord de la vue selon l'heure (fraction du cycle ; 0 = lever du jour). */
const DISTANCE_FOG_KEYS: readonly { readonly at: number; readonly visibility: number }[] = [
  { at: 0, visibility: 0.13 }, // aube : brume marquée, mais une chaîne à 300 m reste lisible
  { at: 0.12, visibility: 0.18 },
  { at: 0.3, visibility: 0.32 }, // milieu de journée : lointain lisible
  { at: 0.5, visibility: 0.32 },
  { at: 0.66, visibility: 0.1 }, // crépuscule
  { at: 0.85, visibility: 0.12 }, // nuit
  { at: 1, visibility: 0.13 },
];

/** Visibilité restante au bord de la vue (brume de distance) : légère à midi, dense matin et soir. */
export function distanceFogVisibilityFor(time: TimeOfDay): number {
  const f = time.dayFraction - Math.floor(time.dayFraction);
  let i = 0;
  while (i < DISTANCE_FOG_KEYS.length - 2 && f >= DISTANCE_FOG_KEYS[i + 1]!.at) i++;
  const a = DISTANCE_FOG_KEYS[i]!, b = DISTANCE_FOG_KEYS[i + 1]!;
  return a.visibility + ((b.visibility - a.visibility) * (f - a.at)) / (b.at - a.at);
}
