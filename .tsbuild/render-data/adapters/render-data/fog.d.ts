import type { TimeOfDay } from '../../core/survival/time-of-day';
import { type Lighting } from './lighting';
import type { Rgb } from './palette';
/** Visibilité (1 = net, 0 = entièrement dans la brume) à la distance d (m). */
export declare function fogVisibility(distanceM: number, density: number): number;
/** Part de brume (0 = net, 1 = entièrement dans la brume) à la distance d (m) : le complément de la visibilité. */
export declare function fogAmount(distanceM: number, density: number): number;
/**
 * Densité telle qu'à `distanceM`, la visibilité vaille exactement `visibility`.
 * @throws RangeError si visibility ∉ ]0, 1[ ou si distanceM n'est pas un nombre fini > 0 (erreur de réglage).
 */
export declare function fogDensityFor(distanceM: number, visibility: number): number;
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
export declare function heightFogAmount(distanceM: number, heightAboveBaseM: number, fog: HeightFog): number;
export declare function heightFogFor(time: TimeOfDay): HeightFog;
/** Exportée : l'atmosphère plafonne la luminosité de la brume de brouillard, donc doit inverser cet éclaircissement. */
export declare const HAZE_LIGHTEN = 0.05;
/**
 * Teinte de la brume : la couleur de brume de l'ambiance, désaturée et éclaircie, donc distincte de l'horizon du
 * ciel (sinon le lointain se fond dans le ciel et la brume ne se voit pas) tout en gardant la teinte de l'heure.
 * Luminance obtenue : celle de la couleur de brume + HAZE_LIGHTEN × (1 − celle-ci) (la désaturation la conserve).
 */
export declare function hazeColor(l: Lighting): Rgb;
/**
 * Poids de la teinte de brume dans le ciel à cette hauteur du dôme : 1 à l'horizon (le lointain embrumé et le bas du
 * ciel se confondent, le bord du monde chargé ne se voit pas), 0 au-dessus de la bande, transition douce.
 */
export declare function hazeHorizonWeight(heightFraction: number): number;
/** Visibilité restante au bord de la vue (brume de distance) : légère à midi, dense matin et soir. */
export declare function distanceFogVisibilityFor(time: TimeOfDay): number;
