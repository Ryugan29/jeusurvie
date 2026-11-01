import { type ChunkData } from '../../core/world/chunk';
export interface ChunkMeshData {
    /** Positions locales au chunk (x, y, z) ; le maillage est placé au coin (cx·64, 0, cz·64). */
    readonly positions: Float32Array;
    readonly normals: Float32Array;
    /** Couleurs de sommets RGBA. */
    readonly colors: Float32Array;
    readonly indices: Uint16Array;
}
/** Hauteur d'un sommet (col, row) du chunk, y compris juste hors du chunk (col ou row = -1 ou 33). */
export type HeightSampler = (col: number, row: number) => number;
/**
 * Échantillonneur des hauteurs autour du chunk (cx, cz) : float32 de heightAt aux coordonnées monde,
 * exactement comme ChunkData.heights (contrat de generateChunk). Sert aux normales des bords.
 */
export declare function worldHeightSampler(seed: number, cx: number, cz: number): HeightSampler;
export declare function buildChunkMesh(chunk: ChunkData, outside: HeightSampler): ChunkMeshData;
