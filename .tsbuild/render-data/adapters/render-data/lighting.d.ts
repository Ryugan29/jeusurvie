import type { TimeOfDay } from '../../core/survival/time-of-day';
import type { Rgb } from './palette';
export interface Lighting {
    readonly skyZenith: Rgb;
    readonly skyHorizon: Rgb;
    readonly fogColor: Rgb;
    /** Couleur de l'astre qui éclaire (soleil le jour, lune la nuit). */
    readonly sunColor: Rgb;
    readonly sunIntensity: number;
    /** Intensité de l'astre avant compensation de sa hauteur : règle la force de l'ombre projetée. */
    readonly shadowIntensity: number;
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
    /** Nuages : couleur de la face éclairée (blanche le jour, dorée au crépuscule, bleutée la nuit) et de la face à l'ombre. */
    readonly cloudLight: Rgb;
    readonly cloudShade: Rgb;
    /** Étoiles visibles (0 = invisibles le jour, 1 = pleines au cœur de la nuit). */
    readonly starVisibility: number;
    /** Force du halo autour de l'astre dans le ciel (0 à 1). */
    readonly sunGlow: number;
    /** Force des rayons de soleil à l'écran quand on regarde vers l'astre (0 à 1, discrets : jamais au-delà de 0,8). */
    readonly rayStrength: number;
}
/** Plancher de luminosité de l'ambiance : la nuit reste lisible (on voit le relief). */
export declare const NIGHT_MIN_LUMINANCE = 0.2;
/** Luminance perçue (Rec. 709) d'une couleur. */
export declare function luminance(c: Rgb): number;
/** Instants des images clés le long du cycle (fraction), strictement croissants de 0 à 1 (testé). */
export declare const LIGHTING_KEY_TIMES: readonly number[];
export declare function lightingFor(time: TimeOfDay): Lighting;
/**
 * Couleur du ciel à une hauteur relative du dôme (0 = horizon, 1 = zénith). Racine de la hauteur : le dégradé
 * monte vite au-dessus de l'horizon, comme un vrai ciel. Sous l'horizon : couleur de l'horizon.
 */
export declare function skyColorAt(l: Lighting, heightFraction: number): Rgb;
/** Poids du zénith dans le dégradé du ciel à une hauteur relative du dôme (racine, bornée à [0, 1]). */
export declare function skyWeight(heightFraction: number): number;
/** Force de l'ombre projetée (0 = invisible, 1 = noire), proportionnelle à l'intensité de l'astre. */
export declare function shadowStrength(l: Lighting): number;
