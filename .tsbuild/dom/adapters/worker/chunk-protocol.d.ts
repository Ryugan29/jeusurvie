import { type ChunkMeshData } from '../render-data/mesh-data';
export interface ChunkRequestMsg {
    readonly type: 'generate';
    readonly seed: number;
    readonly cx: number;
    readonly cz: number;
}
export interface ChunkResultMsg {
    readonly type: 'chunk';
    readonly cx: number;
    readonly cz: number;
    /** ChunkData.heights (float32), transférées sans copie. */
    readonly heights: Float32Array;
    readonly mesh: ChunkMeshData;
}
/** Génère le chunk et son maillage ; `transfer` liste les tampons à transférer (zéro copie). */
export declare function runChunkJob(req: ChunkRequestMsg): {
    result: ChunkResultMsg;
    transfer: ArrayBuffer[];
};
