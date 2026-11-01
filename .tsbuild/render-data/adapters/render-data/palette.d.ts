export type Rgb = readonly [number, number, number];
/** Variations de surface au sommet (voir core/world/surface), chacune dans [-1, 1]. */
export interface SurfaceTint {
    readonly patch: number;
    readonly snowJitter: number;
    /** Part du biome froid (0 = forêt tempérée, 1 = froid). */
    readonly cold: number;
    /** Part de sentier de terre (core/world/paths) : 0 = hors sentier, 1 = milieu du sentier. */
    readonly path: number;
}
export declare function terrainColor(height: number, normalY: number, tint: SurfaceTint): Rgb;
/** Poids des textures peintes du sol (render-data/painted-ground) ; l'herbe prend le reste (1 − soil − rock − snow). */
export interface TerrainLayers {
    readonly soil: number;
    readonly rock: number;
    readonly snow: number;
}
/** Mêmes limites que terrainColor : la terre des pentes et des sentiers, la roche, la neige, chacune recouvrant la précédente. */
export declare function terrainLayers(height: number, normalY: number, tint: SurfaceTint): TerrainLayers;
