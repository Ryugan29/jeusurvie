import type { Lighting } from './lighting';
import type { Rgb } from './palette';
/** Force de la magie nocturne (0 = jour, 1 = cœur de la nuit). */
export declare function nightMagic(l: Lighting): number;
/** Lucioles : jaune-vert chaud (lumière froide des lampyres, poussée vers l'or pour le style). */
export declare const FIREFLY_COLOR: Rgb;
/** Lucioles au plus fort de la nuit : nombre à l'écran autour du joueur, rayon (m) et hauteur (m) où elles flottent. */
export declare const FIREFLIES: {
    readonly count: 220;
    readonly radiusM: 28;
    readonly minY: 0.25;
    readonly maxY: 2.6;
};
/** Nombre de lucioles voulu à cette heure (entier, 0 de jour). */
export declare function fireflyCount(l: Lighting): number;
/** Lueur des champignons (couleur ajoutée, multipliée à leur texture) : cyan doux, forte au cœur de la nuit, nulle de jour. */
export declare const MUSHROOM_GLOW: Rgb;
export declare function mushroomGlow(l: Lighting): Rgb;
