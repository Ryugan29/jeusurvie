import { type ChunkData } from '../../core/world/chunk';
/** Ce qu'il faut savoir d'un élément pour le dessiner : où, tourné de combien (en tours), à quelle échelle. */
export interface Placed {
    readonly x: number;
    readonly z: number;
    /** Rotation autour de la verticale, en tours (dans [0, 1)). */
    readonly rotation: number;
    /** Échelle uniforme. */
    readonly scale: number;
}
/** Matrices d'instances (16 nombres chacune) d'un chunk, par clé de modèle. */
export type InstanceBatches = Readonly<Record<string, Float32Array>>;
/**
 * Une matrice par élément, regroupées par modèle (dans l'ordre de la liste) : rotation autour de Y, échelle uniforme,
 * posé sur le sol du chunk (même triangulation que le rendu) et enfoncé de `sinkM` × échelle.
 */
export declare function instanceMatrices<T extends Placed>(items: readonly T[], modelOf: (item: T) => string, chunk: ChunkData, sinkM: number, 
/** Écrasement vertical par modèle (1 = proportions du modèle) : des touffes basses et larges plutôt que des herbes hautes. */
heightScaleOf?: (model: string) => number): Record<string, Float32Array>;
