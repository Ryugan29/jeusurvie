import { type ChunkData } from '../../core/world/chunk';
import type { Resource } from '../../core/world/placement';
import { modelKeyFor, VEGETATION_MODELS } from '../../core/world/resource-models';
import { type InstanceBatches } from './instance-matrices';
export { modelKeyFor, VEGETATION_MODELS };
/** Portée d'affichage (m) d'un modèle de végétation. */
export declare function vegetationRangeM(modelKey: string): number;
/** Le lot d'un chunk est dessiné si le bord le plus proche du chunk (cx, cz) est à portée du joueur (px, pz). */
export declare function vegetationVisible(cx: number, cz: number, px: number, pz: number, rangeM: number): boolean;
/** Met bout à bout les lots d'un même modèle (un par chunk) : un seul tampon d'instances, un seul dessin par morceau. */
export declare function concatInstances(batches: readonly Float32Array[]): Float32Array;
/** Les instances (matrices de 16 nombres) dont la position (éléments 12 et 14) est à au plus `radiusM` mètres, à l'horizontale, de (x, z). */
export declare function instancesWithin(matrices: Float32Array, x: number, z: number, radiusM: number): Float32Array;
/** Enfoncement dans le sol (m, multiplié par l'échelle) : rien ne flotte sur une pente. */
export declare const VEGETATION_SINK_M = 0.15;
/** Matrices d'instances (16 nombres chacune) d'un chunk, par clé de modèle. */
export type VegetationBatches = InstanceBatches;
export declare function vegetationInstances(resources: readonly Resource[], chunk: ChunkData): Record<string, Float32Array>;
