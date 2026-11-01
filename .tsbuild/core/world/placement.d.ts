/** Côté d'une case de la grille des ressources (m) : divise CHUNK_SIZE. */
export declare const RESOURCE_CELL_M = 8;
/** Au-dessus de cette part de sentier (pathAt), rien ne pousse : le sentier reste dégagé. */
export declare const PATH_CLEAR_THRESHOLD = 0.3;
/** Rayon (m) autour du point de départ laissé libre. */
export declare const SPAWN_CLEAR_RADIUS_M = 3;
/** Pente maximale (dénivelé par mètre) où pousse un arbre. */
export declare const TREE_MAX_SLOPE = 0.6;
/** Nombre de variantes tirées par case (voir resource-models : chaque type les répartit entre ses modèles). */
export declare const VARIANT_COUNT = 16;
export type ResourceKind = 'tree' | 'pine' | 'bush' | 'rock' | 'grass' | 'flowers';
export interface Resource {
    /** Identifiant stable : « r:{gx}:{gz} » (case de la grille globale). */
    readonly id: string;
    readonly kind: ResourceKind;
    /** Variante du modèle, entier de 0 à VARIANT_COUNT − 1 (resource-models en tire le modèle). */
    readonly variant: number;
    readonly x: number;
    readonly z: number;
    /** Rotation autour de la verticale, en tours (dans [0, 1)). */
    readonly rotation: number;
    /** Échelle uniforme, dans [RESOURCE_SCALE_MIN ; RESOURCE_SCALE_MAX] (0,8 à 1,25). */
    readonly scale: number;
}
export declare const RESOURCE_SCALE_MIN = 0.8;
export declare const RESOURCE_SCALE_MAX: number;
/** Limite des arbres (m) : plus basse dans le froid. */
export declare function treeLineAt(cold: number): number;
export declare const FOREST_FACTOR_MAX: number;
/**
 * Densité forestière relative au point (x, z) : multiplie la probabilité d'un arbre. ≈ 0,1 dans une clairière,
 * ≈ 2,4 au cœur d'un bosquet, 1 en moyenne : le nombre d'arbres reste du même ordre qu'avec une répartition uniforme.
 * Sert aussi au couvre-sol (sous-bois : fougères et plantes là où la forêt est dense).
 */
export declare function forestFactorAt(seed: number, x: number, z: number): number;
/** Ressources des cases [gx0, gx1) × [gz0, gz1), dans l'ordre des cases (z puis x). */
export declare function resourcesInCells(seed: number, gx0: number, gz0: number, gx1: number, gz1: number): Resource[];
/** Ressources du chunk (cx, cz) : les cases qui le composent. */
export declare function resourcesInChunk(seed: number, cx: number, cz: number): Resource[];
