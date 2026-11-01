// Paramètres du GÉNÉRATEUR DE MONDE, version 1 (ADR 0004).
// Ce ne sont pas des réglages d'équilibrage : les changer change le monde de toutes les parties existantes.
// Ils sont figés par les valeurs d'or (terrain.golden.test.ts) ; règle de scellement dans ce fichier de test.
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
  readonly warp: NoiseLayer & { readonly amplitude: number; readonly saltZ: number };
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
  readonly swells: NoiseLayer & { readonly amplitude: number };
  /** Ondulations générales : amplitude faible en plaine, forte en collines. */
  readonly hills: NoiseLayer & { readonly plainsAmplitude: number; readonly hillsAmplitude: number };
  /**
   * Chaînes de montagnes (crêtes multifractales à poids : arêtes et pics, versants lisses), seulement en région
   * montagneuse. La forme r est rendue plus pointue (r·√r) avant d'être multipliée par amplitude.
   */
  readonly mountains: NoiseLayer & { readonly amplitude: number };
  /** Détail « érodé » des montagnes : ravines sur les replats, peu de détail sur les pentes fortes. */
  readonly erosion: NoiseLayer & { readonly amplitude: number };
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

const BASE = 0;
const HILLS = { plainsAmplitude: 8, hillsAmplitude: 28 };
const MOUNTAINS_AMPLITUDE = 270;
const EROSION_AMPLITUDE = 10;
const VALLEY_DEPTH = 12;
const SWELLS_AMPLITUDE = 20;

function deepFreeze<T extends object>(o: T): T {
  for (const v of Object.values(o)) if (typeof v === 'object' && v !== null) deepFreeze(v);
  return Object.freeze(o);
}

export const TERRAIN_V1: TerrainParams = deepFreeze({
  baseHeight: BASE,
  warp: { frequency: 1 / 1024, octaves: 2, lacunarity: 2, gain: 0.5, salt: 11, saltZ: 16, amplitude: 90 },
  regions: {
    frequency: 1 / 4096,
    octaves: 3,
    lacunarity: 2,
    gain: 0.5,
    salt: 12,
    contrast: 1.6,
    hillsFrom: 0.3,
    hillsTo: 0.55,
    mountainsFrom: 0.6,
    mountainsTo: 0.85,
  },
  swells: { frequency: 1 / 2048, octaves: 2, lacunarity: 2, gain: 0.5, salt: 15, amplitude: SWELLS_AMPLITUDE },
  hills: { frequency: 1 / 256, octaves: 5, lacunarity: 2, gain: 0.5, salt: 1, ...HILLS },
  mountains: { frequency: 1 / 1400, octaves: 5, lacunarity: 2, gain: 0.5, salt: 13, amplitude: MOUNTAINS_AMPLITUDE },
  erosion: { frequency: 1 / 180, octaves: 4, lacunarity: 2, gain: 0.5, salt: 17, amplitude: EROSION_AMPLITUDE },
  valleys: {
    frequency: 1 / 1536,
    octaves: 2,
    lacunarity: 2,
    gain: 0.5,
    salt: 14,
    width: 0.08,
    depth: VALLEY_DEPTH,
    mountainCut: 0.85,
    mountainCutWidth: 0.3,
  },
  startCalmRadius: 450,
  startMinRegion: 0.48,
  startMaxRegion: 0.5,
  // fbm, eroded ∈ [-1, 1], multifractale ∈ [0, 1] ; vallée jusqu'à 2 × depth en montagne.
  minHeight: BASE - SWELLS_AMPLITUDE - HILLS.hillsAmplitude - EROSION_AMPLITUDE - 2 * VALLEY_DEPTH,
  maxHeight: BASE + SWELLS_AMPLITUDE + HILLS.hillsAmplitude + MOUNTAINS_AMPLITUDE + EROSION_AMPLITUDE,
});

/** Rayon du monde, en mètres, mesuré depuis l'origine (0, 0). Décidé dès genVersion 1 (ADR 0004). */
export const WORLD_RADIUS_M = 8000;
/**
 * Largeur de la bande du bord, en mètres : entre WORLD_RADIUS_M − EDGE_BAND_M et WORLD_RADIUS_M, le relief montera
 * en montagnes infranchissables (pas encore fait). Les propriétés de relief « jouable » valent en deçà.
 */
export const EDGE_BAND_M = 300;
