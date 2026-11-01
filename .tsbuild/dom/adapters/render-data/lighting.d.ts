import type { DayPhase } from '../../core/survival/time-of-day';
import type { Rgb } from './palette';
export interface Lighting {
    readonly skyZenith: Rgb;
    readonly skyHorizon: Rgb;
    readonly fogColor: Rgb;
    /** Couleur de l'astre qui éclaire (soleil le jour, lune la nuit). */
    readonly sunColor: Rgb;
    readonly sunIntensity: number;
    /** Direction de la lumière (de l'astre vers le sol), unitaire, toujours vers le bas. */
    readonly sunDirection: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
    };
    /** Lumière d'ambiance venant du ciel et, plus sombre, du sol. */
    readonly ambientColor: Rgb;
    readonly ambientGroundColor: Rgb;
    readonly ambientIntensity: number;
}
/** Plancher de luminosité de l'ambiance : la nuit reste lisible (on voit le relief). */
export declare const NIGHT_MIN_LUMINANCE = 0.2;
/** Luminance perçue (Rec. 709) d'une couleur. */
export declare function luminance(c: Rgb): number;
export declare function lightingFor(phase: DayPhase, dayFraction: number): Lighting;
