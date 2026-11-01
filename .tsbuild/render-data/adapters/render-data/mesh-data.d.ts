import { type ChunkData } from '../../core/world/chunk';
import { type SurfaceTint } from './palette';
export interface ChunkMeshData {
    /** Positions locales au chunk (x, y, z) ; le maillage est placé au coin (cx·64, 0, cz·64). */
    readonly positions: Float32Array;
    readonly normals: Float32Array;
    /** Couleurs de sommets RGBA. */
    readonly colors: Float32Array;
    /** Poids des textures peintes par sommet (terre, roche, neige ; l'herbe prend le reste) : palette → terrainLayers. */
    readonly layers: Float32Array;
    readonly indices: Uint16Array;
}
/**
 * Hauteur d'un sommet (col, row) du chunk ou de sa bordure : le maillage lit jusqu'à PAD (= SHADE_REACH, 6) sommets
 * hors du chunk de chaque côté (normales et ombrage), chacun une seule fois (mis en cache).
 */
export type HeightSampler = (col: number, row: number) => number;
/** Variation de surface au sommet (col, row) du chunk (plaques d'herbe, limite de neige, biome, sentier). */
export type SurfaceSampler = (col: number, row: number) => SurfaceTint;
export interface MeshSamplers {
    readonly heights: HeightSampler;
    readonly surface: SurfaceSampler;
}
/**
 * Échantillonneur des hauteurs autour du chunk (cx, cz) : float32 de heightAt aux coordonnées monde,
 * exactement comme ChunkData.heights (contrat de generateChunk). Sert aux normales et à l'ombrage des bords.
 */
export declare function worldHeightSampler(seed: number, cx: number, cz: number): HeightSampler;
/** Échantillonneurs du monde de graine `seed` pour le chunk (cx, cz). */
export declare function worldSamplers(seed: number, cx: number, cz: number): MeshSamplers;
export declare function buildChunkMesh(chunk: ChunkData, samplers: MeshSamplers): ChunkMeshData;
