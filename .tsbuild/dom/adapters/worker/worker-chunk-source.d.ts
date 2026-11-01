import type { ChunkSource, ReadyChunk } from '../../app/ports';
import type { ChunkRenderData, ChunkRequestMsg, ChunkResultMsg } from './chunk-protocol';
/** Ce dont la source a besoin d'un worker (le vrai Worker est enveloppé dans create-chunk-workers.ts). */
export interface WorkerLike {
    post(msg: ChunkRequestMsg): void;
    onResult(handler: (msg: ChunkResultMsg) => void): void;
    /** Erreur du script du worker ou message illisible : le worker n'est plus fiable. */
    onError(handler: () => void): void;
    terminate(): void;
}
export interface WorkerChunkSourceOptions {
    /** Nombre d'essais par chunk avant abandon (défaut 3). */
    readonly maxAttempts?: number;
    /** Appelé quand un chunk est abandonné après maxAttempts échecs. */
    readonly onChunkFailed?: (cx: number, cz: number) => void;
    /** Faire calculer le couvre-sol par les workers (défaut : oui). */
    readonly groundCover?: boolean;
}
export declare class WorkerChunkSource implements ChunkSource<ChunkRenderData> {
    private readonly seed;
    private readonly createWorker;
    private readonly options;
    private readonly jobs;
    private readonly slots;
    private readonly maxAttempts;
    constructor(seed: number, createWorker: () => WorkerLike, workerCount: number, options?: WorkerChunkSourceOptions);
    request(cx: number, cz: number, priority: number): void;
    cancel(cx: number, cz: number): void;
    drainReady(max: number): readonly ReadyChunk<ChunkRenderData>[];
    private newSlot;
    private onResult;
    private onWorkerError;
    private pump;
}
