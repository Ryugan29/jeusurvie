import { type Rgb } from './palette';
export interface FarTerrainOptions {
    /** Demi-côté (m) de la grille, centrée sur (centerX, centerZ). */
    readonly halfSizeM: number;
    /** Pas (m) entre deux sommets. */
    readonly stepM: number;
}
export interface FarTerrainMesh {
    /** Positions RELATIVES au centre (le maillage est placé au centre) : précision float32 gardée loin de l'origine. */
    readonly positions: Float32Array;
    readonly normals: Float32Array;
    /** Couleurs RGBA. */
    readonly colors: Float32Array;
    readonly indices: Uint32Array;
}
/** Demande au worker du relief lointain (adapters/worker/far-terrain.worker). */
export interface FarTerrainRequest {
    readonly id: number;
    readonly seed: number;
    readonly centerX: number;
    readonly centerZ: number;
    readonly options: FarTerrainOptions;
}
/** Réponse du worker : le maillage, tampons transférés. */
export interface FarTerrainResult {
    readonly id: number;
    readonly centerX: number;
    readonly centerZ: number;
    readonly mesh: FarTerrainMesh;
}
/** Feuillage vu de loin : vert profond des feuillus, bleu-vert des pins (froid), or des groupes d'automne. */
export declare const CANOPY: Rgb;
/** Part maximale de canopée (même un bosquet dense laisse voir un peu de sol entre les cimes). */
export declare const CANOPY_MAX = 0.85;
/** Couleur d'un point lointain : sol (palette) recouvert par la canopée là où il y a forêt. */
export declare function farColor(seed: number, x: number, z: number, height: number, normalY: number): Rgb;
/** Centre de grille pour un joueur en (x, z) : aimanté sur `snapM`, pour que la grille ne glisse pas d'un recentrage à l'autre. */
export declare function farCenterFor(x: number, z: number, snapM: number): {
    x: number;
    z: number;
};
/**
 * Maillage du relief lointain centré sur (centerX, centerZ) : (2·n + 1)² sommets, n = round(halfSizeM / stepM).
 * @throws RangeError si le pas ou le demi-côté ne sont pas des nombres finis > 0, ou si la grille dépasse 2²⁰ sommets.
 */
export declare function buildFarTerrain(seed: number, centerX: number, centerZ: number, options: FarTerrainOptions): FarTerrainMesh;
