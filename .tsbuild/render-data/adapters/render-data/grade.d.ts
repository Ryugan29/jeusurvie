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
/** Étalonnage de plein jour. */
export declare const DAY_GRADE: {
    readonly exposure: 1;
    readonly saturation: 20;
};
export declare function gradeFor(l: Lighting): Grade;
