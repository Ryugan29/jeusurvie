// Magie de la nuit (PUR, sans Babylon) : la forêt fantasy ne s'éteint pas, elle change de lumière. Des lucioles flottent au ras des
// herbes autour du joueur, les champignons luisent doucement (bioluminescence). Les deux naissent après le couchant, avec les
// étoiles, et s'éteignent à l'aube : jamais visibles de jour. Ils donnent à la nuit des points lumineux qui guident l'œil, là où
// elle n'était qu'un aplat bleu sombre.
import { smoothstep } from '../../core/shared/math';
import type { Lighting } from './lighting';
import type { Rgb } from './palette';

/** Part de nuit (étoiles visibles) où la magie commence, et où elle est pleine. */
const NIGHT_FROM = 0.2, NIGHT_FULL = 0.7;

/** Force de la magie nocturne (0 = jour, 1 = cœur de la nuit). */
export function nightMagic(l: Lighting): number {
  return smoothstep(NIGHT_FROM, NIGHT_FULL, l.starVisibility);
}

/** Lucioles : jaune-vert chaud (lumière froide des lampyres, poussée vers l'or pour le style). */
export const FIREFLY_COLOR: Rgb = [1, 0.92, 0.45];
/** Lucioles au plus fort de la nuit : nombre à l'écran autour du joueur, rayon (m) et hauteur (m) où elles flottent. */
export const FIREFLIES = { count: 220, radiusM: 28, minY: 0.25, maxY: 2.6 } as const;

/** Nombre de lucioles voulu à cette heure (entier, 0 de jour). */
export function fireflyCount(l: Lighting): number {
  return Math.round(FIREFLIES.count * nightMagic(l));
}

/** Lueur des champignons (couleur ajoutée, multipliée à leur texture) : cyan doux, forte au cœur de la nuit, nulle de jour. */
export const MUSHROOM_GLOW: Rgb = [0.35, 0.85, 1];
const MUSHROOM_GLOW_MAX = 0.9;

export function mushroomGlow(l: Lighting): Rgb {
  const k = MUSHROOM_GLOW_MAX * nightMagic(l);
  return [MUSHROOM_GLOW[0] * k, MUSHROOM_GLOW[1] * k, MUSHROOM_GLOW[2] * k];
}
