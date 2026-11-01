export declare const SURFACE_LAYERS: readonly ["grass", "soil", "rock", "snow"];
export type SurfaceLayer = (typeof SURFACE_LAYERS)[number];
export interface SurfaceLayerSpec {
    /** Côté (m) du motif dans le monde. */
    readonly tileM: number;
    /** Profondeur (m) du relief que la carte de normales représente (différence entre le plus haut et le plus creux). */
    readonly bumpDepthM: number;
    /** Albédo moyen (linéaire) que la texture générée dessine : son facteur = albédo / cette valeur (moyenne ≈ 1). */
    readonly referenceAlbedo: readonly [number, number, number];
    /** Rugosité si les cartes de matière ne sont pas lues (profil LOW). */
    readonly roughness: number;
}
export declare const SURFACE_LAYER_SPECS: Readonly<Record<SurfaceLayer, SurfaceLayerSpec>>;
/** Plus grand facteur codable dans un octet : 255 ↔ ce facteur (code √(f / max), plus de précision dans les sombres). */
export declare const ALBEDO_FACTOR_MAX = 3;
/** Code d'un facteur d'albédo dans [0, 1] (octet / 255) : √(f / ALBEDO_FACTOR_MAX), borné. */
export declare function encodeAlbedoFactor(factor: number): number;
/** Facteur d'albédo relu : l'inverse exact de encodeAlbedoFactor (le shader fait le même calcul). */
export declare function decodeAlbedoFactor(code: number): number;
/**
 * Pente (dénivelé par texel) de la carte de normales : une différence de hauteur `dh` (en part de bumpDepthM) entre deux texels
 * voisins d'une texture de `size` px vaut dh × bumpDepthM / (tileM / size) en pente réelle.
 */
export declare function normalSlopeScale(layer: SurfaceLayer, size: number): number;
/** Sol mouillé (constantes partagées avec le relief lointain) : part de luminosité retirée par l'eau, rugosité de la terre trempée. */
export declare const WET_ALBEDO_DARKEN = 0.42;
export declare const WET_ROUGHNESS = 0.32;
/** Rugosité de l'eau des flaques : presque un miroir (la scène s'y reflète avec les reflets à l'écran, le ciel sinon). */
export declare const PUDDLE_ROUGHNESS = 0.04;
