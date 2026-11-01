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
export declare const DAY_GRADE: {
    readonly exposure: 1.6;
    readonly saturation: 10;
};
export declare function gradeFor(l: Lighting): Grade;
