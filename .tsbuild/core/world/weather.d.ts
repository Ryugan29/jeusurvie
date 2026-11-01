export declare const WEATHER_KINDS: readonly ["clair", "nuageux", "bruine", "pluie", "orage", "brouillard"];
export type WeatherKind = (typeof WEATHER_KINDS)[number];
/** Grandeurs de la météo, toutes dans [0, 1]. */
export interface Weather {
    /** Part du ciel couverte de nuages. */
    readonly cloudCover: number;
    /** Force de la pluie qui tombe. */
    readonly rain: number;
    /** Orage : force des éclairs. */
    readonly storm: number;
    /** Brouillard (s'ajoute à la brume de l'heure). */
    readonly fog: number;
    /** Force du vent. */
    readonly wind: number;
    /** Sol mouillé : suit la pluie, puis sèche lentement (WEATHER_DRYING_S). */
    readonly wetness: number;
}
export type WeatherPreset = Omit<Weather, 'wetness'>;
export declare const WEATHER_PRESETS: Readonly<Record<WeatherKind, WeatherPreset>>;
/** Durée (s de jeu) d'un épisode : un quart de cycle jour + nuit. */
export declare const WEATHER_SEGMENT_S = 300;
/** Durée (s de jeu) du fondu vers l'épisode suivant, à la fin de chaque épisode. */
export declare const WEATHER_TRANSITION_S = 90;
export declare const WEATHER_DRYING_S: number;
/** Type de l'épisode en cours au temps de jeu `timeS` (s). */
export declare function weatherKindAt(seed: number, timeS: number): WeatherKind;
/** Météo au temps de jeu `timeS` (s écoulées depuis le début de la partie). */
export declare function weatherAt(seed: number, timeS: number): Weather;
