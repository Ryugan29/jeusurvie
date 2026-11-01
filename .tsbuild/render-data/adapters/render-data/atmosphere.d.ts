import type { Weather } from '../../core/world/weather';
import type { Grade } from './grade';
import { type Lighting } from './lighting';
/** Le soleil en HDR : renforcé par rapport à la lumière « peinte » de l'heure. */
export declare const SUN_HDR_GAIN = 1.8;
/** L'ambiance (lumière du ciel dans l'ombre) un peu baissée : le soleil éclaire ~4× plus qu'elle à midi. */
export declare const AMBIENT_HDR_GAIN = 0.85;
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
/**
 * Plafond de la luminosité de la brume de brouillard, en part de la lumière reçue par le sol (sceneBrightness). Une brume
 * plus claire que le décor éclairé le « blanchit » (démon, héroïne : silhouettes pâles, sans couleur). Le décor renvoie 0,4 à
 * 0,6 de la lumière reçue (terre 0,4 ; roche 0,5 ; herbe 0,6) et la neige 0,95 : à 0,75 la brume reste un voile plus clair
 * que l'herbe mais plus sombre que la neige. Rapport brume / sol avant plafond : 0,76 à midi et 0,44 la nuit (déjà sous le
 * plafond : presque rien ne change) ; ~1,65 le matin et au crépuscule (halo du lever et du coucher), ramené à 0,75.
 */
export declare const FOG_LIGHT_CEILING = 0.75;
/** Lumière de la scène à cette heure, par ce temps, pendant cet éclair (`flash`, 0 à 1). */
export declare function atmosphereFor(l: Lighting, w: Weather, flash: number): Atmosphere;
/**
 * Densité de la brume de distance (par mètre) : celle de l'heure (`hourDensity`, réglée par fogDensityFor), épaissie par la
 * pluie, plus la brume propre du brouillard. Par temps clair ou nuageux, c'est exactement la densité de l'heure.
 */
export declare function distanceFogDensity(a: Atmosphere, hourDensity: number): number;
/** Lumière reçue par un sol plat (ambiance + astre selon sa hauteur), bornée à [0, 1] : 1 en plein jour, faible la nuit. */
export declare function sceneBrightness(l: Lighting): number;
/** Étalonnage de l'heure corrigé par la météo : pluie et brouillard ternissent, un éclair surexpose. */
export declare function weatherGrade(g: Grade, a: Atmosphere): Grade;
/**
 * Éclat d'un éclair (0 = rien, 1 = flash maximal) au temps `timeS` (s d'horloge réelle : un éclair dure toujours le même
 * temps, cycle accéléré ou non), selon la force de l'orage `storm` (0 à 1). Déterministe.
 */
export declare function lightningFlash(seed: number, timeS: number, storm: number): number;
