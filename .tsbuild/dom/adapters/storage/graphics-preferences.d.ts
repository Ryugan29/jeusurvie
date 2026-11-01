import { type QualityLevel, type QualityOverrides } from '../render-data/quality';
/** Clé du stockage ; le numéro change si le format change (l'ancien est alors ignoré). */
export declare const GRAPHICS_PREFERENCES_KEY = "jeusurvie.graphismes.v1";
export interface GraphicsPreferences {
    readonly level: QualityLevel;
    readonly overrides: QualityOverrides;
}
export declare const DEFAULT_GRAPHICS_PREFERENCES: GraphicsPreferences;
/** Ce que l'adaptateur demande au stockage (window.localStorage, ou un faux dans les tests). */
export interface TextStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
/** Préférences lues dans un texte JSON ; tout ce qui n'est pas reconnu est remplacé par la valeur par défaut. */
export declare function parseGraphicsPreferences(text: string | null): GraphicsPreferences;
export declare function serializeGraphicsPreferences(p: GraphicsPreferences): string;
export declare class GraphicsPreferencesStore {
    private readonly storage;
    constructor(storage: TextStorage | undefined);
    load(): GraphicsPreferences;
    /** Vrai si enregistré (faux : stockage indisponible ou plein ; la préférence vaut alors pour cette session seulement). */
    save(p: GraphicsPreferences): boolean;
    /** Oublie les préférences : les réglages par défaut reviennent. */
    reset(): GraphicsPreferences;
}
/** Le stockage de la page s'il est accessible (il peut lever une exception rien qu'à la lecture de `localStorage`). */
export declare function browserStorage(): TextStorage | undefined;
