// Étalonnage selon l'heure (PUR, sans Babylon) : la nuit, l'œil voit moins les couleurs (désaturé, plus sombre) ; quand le
// soleil est bas et orange, toute l'image se réchauffe. Sans ça, l'herbe — dont la texture n'a pas de bleu — restait jaune-vert
// sous la lune bleutée et verte sous le soleil couchant. Appliqué à chaque image par adapters/babylon/post-processing.
import { smoothstep } from '../../core/shared/math';
import type { Lighting } from './lighting';

export interface Grade {
  /** Luminosité globale (1 = inchangée). */
  readonly exposure: number;
  /** Saturation ajoutée (−100 à 100). */
  readonly saturation: number;
  /** Force de la teinte ajoutée à toute l'image (0 à 100). */
  readonly tint: number;
  /** Teinte ajoutée (degrés : 30 = orange au soleil bas, 220 = bleu de clair de lune). */
  readonly hue: number;
}

/**
 * Étalonnage de plein jour (ADR 0012). Exposition 1,6 : comme un appareil photo réglé sur la scène — les albédos réels (herbe ~15 %,
 * terre ~10 %) renvoient bien moins de lumière que les couleurs vives d'avant ; à 1, la forêt de midi s'affichait comme au crépuscule
 * (luminance moyenne mesurée à l'écran : 0,6 fois celle d'avant). Saturation +10 : celle d'une pellicule couleur, pas d'une
 * illustration (mesurée à l'écran : moitié moins saturé qu'avant, contre trois fois moins sans elle).
 */
export const DAY_GRADE = { exposure: 1.6, saturation: 10 } as const;
/** Ce que la nuit retire au plus profond (étoiles pleines) : la même part qu'avant (1/4 de l'exposition de jour). */
const NIGHT_EXPOSURE_DROP = 0.4;
const NIGHT_DESATURATION = 50;
/** Teinte orangée du soleil bas : force maximale, et écart rouge − bleu de la lumière où elle commence / est pleine. */
const WARMTH_MAX = 14;
const WARM_FROM = 0.3, WARM_FULL = 0.75; // le soleil de midi (rouge − bleu = 0,3) reste sans teinte
const WARM_HUE = 30;
/** Force de l'astre (avant compensation de hauteur) à partir de laquelle la teinte orangée est pleine : à l'aube elle naît avec le soleil, au
 * couchant elle s'éteint avec lui. */
const WARM_SUN_FULL = 0.5;
/** Saturation ajoutée quand la teinte orangée est pleine : sans elle, l'orange délave l'herbe en vert olive. */
const WARM_SATURATION = 10;
/** Teinte bleutée du clair de lune : force maximale, et part de nuit (étoiles) où elle commence — après le couchant, sans le croiser. */
const MOON_TINT_MAX = 14;
const MOON_FROM = 0.3;
const MOON_HUE = 220;

export function gradeFor(l: Lighting): Grade {
  const night = l.starVisibility;
  const tint = tintFor(l);
  const warmth = tint.hue === WARM_HUE ? tint.tint / WARMTH_MAX : 0;
  return {
    exposure: DAY_GRADE.exposure - NIGHT_EXPOSURE_DROP * night,
    saturation: DAY_GRADE.saturation - NIGHT_DESATURATION * night + WARM_SATURATION * warmth,
    ...tint,
  };
}

/** Teinte orangée quand la lumière est chaude (soleil bas), bleutée au cœur de la nuit ; les deux ne se recouvrent jamais. */
function tintFor(l: Lighting): { tint: number; hue: number } {
  const warm = WARMTH_MAX * smoothstep(WARM_FROM, WARM_FULL, l.sunColor[0] - l.sunColor[2]) * smoothstep(0, WARM_SUN_FULL, l.shadowIntensity);
  const moon = MOON_TINT_MAX * smoothstep(MOON_FROM, 1, l.starVisibility);
  return warm >= moon ? { tint: warm, hue: WARM_HUE } : { tint: moon, hue: MOON_HUE };
}
