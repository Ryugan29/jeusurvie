import type { FbmParams } from './noise';
/** Un bruit fBm à une échelle donnée. */
export interface NoiseLayer extends FbmParams {
    /** Fréquence de la première octave, en cycles par mètre. */
    readonly frequency: number;
    /** Sel propre à la couche (couches indépendantes pour une même graine). */
    readonly salt: number;
}
export interface TerrainParams {
    /** Hauteur moyenne des plaines, en mètres. */
    readonly baseHeight: number;
    /**
     * Déformation du domaine : les coordonnées sont décalées d'au plus amplitude m, ce qui tord les formes.
     * salt pour le décalage en x, saltZ pour celui en z (sels dédiés, distincts de toutes les autres couches).
     */
    readonly warp: NoiseLayer & {
        readonly amplitude: number;
        readonly saltZ: number;
    };
    /**
     * Régions, à très grande échelle : une valeur r dans [0, 1] qui choisit plaine (r bas), collines, montagnes (r haut).
     * r = 0,5 + contrast × bruit, bornée.
     */
    readonly regions: NoiseLayer & {
        readonly contrast: number;
        /** r où les collines commencent / atteignent leur amplitude pleine. */
        readonly hillsFrom: number;
        readonly hillsTo: number;
        /** r où les montagnes commencent / atteignent leur hauteur pleine. */
        readonly mountainsFrom: number;
        readonly mountainsTo: number;
    };
    /** Houle : très grandes ondulations douces partout (même les plaines ne sont jamais plates sur des kilomètres). */
    readonly swells: NoiseLayer & {
        readonly amplitude: number;
    };
    /** Ondulations générales : amplitude faible en plaine, forte en collines. */
    readonly hills: NoiseLayer & {
        readonly plainsAmplitude: number;
        readonly hillsAmplitude: number;
    };
    /**
     * Chaînes de montagnes (crêtes multifractales à poids : arêtes et pics, versants lisses), seulement en région
     * montagneuse. La forme r est rendue plus pointue (r·√r) avant d'être multipliée par amplitude.
     */
    readonly mountains: NoiseLayer & {
        readonly amplitude: number;
    };
    /** Détail « érodé » des montagnes : ravines sur les replats, peu de détail sur les pentes fortes. */
    readonly erosion: NoiseLayer & {
        readonly amplitude: number;
    };
    /**
     * Vallées : creusées là où ce bruit est proche de 0 (lignes sinueuses). En montagne elles sont deux fois plus
     * profondes et abaissent aussi les crêtes (mountainCut : part de la montagne retirée au fond de la vallée) :
     * ce sont les cols et les passages.
     */
    readonly valleys: NoiseLayer & {
        readonly width: number;
        readonly depth: number;
        readonly mountainCut: number;
        /** Largeur (unités de bruit) de l'entaille dans les montagnes : plus large que la vallée, sinon parois de canyon. */
        readonly mountainCutWidth: number;
    };
    /**
     * Départ : autour de l'origine (point de départ provisoire), la région est ramenée dans
     * [startMinRegion, startMaxRegion] (collines : relief visible mais praticable, jamais de montagnes) jusqu'à
     * startCalmRadius m ; la contrainte disparaît progressivement jusqu'au double.
     */
    readonly startCalmRadius: number;
    readonly startMinRegion: number;
    readonly startMaxRegion: number;
    /** Bornes garanties des hauteurs (m), déduites des amplitudes ci-dessus (testées). */
    readonly minHeight: number;
    readonly maxHeight: number;
}
export declare const TERRAIN_V1: TerrainParams;
/** Rayon du monde, en mètres, mesuré depuis l'origine (0, 0). Décidé dès genVersion 1 (ADR 0004). */
export declare const WORLD_RADIUS_M = 8000;
/**
 * Largeur de la bande du bord, en mètres : entre WORLD_RADIUS_M − EDGE_BAND_M et WORLD_RADIUS_M, le relief montera
 * en montagnes infranchissables (pas encore fait). Les propriétés de relief « jouable » valent en deçà.
 */
export declare const EDGE_BAND_M = 300;
