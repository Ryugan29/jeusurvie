import { type ChunkCoord, type ChunkData } from '../../core/world/chunk';
import type { ChunkSource, ReadyChunk } from '../ports';
import type { StreamPlan } from './streamer';
export interface LoadedChunk<TRender> extends ReadyChunk<TRender> {
    readonly key: string;
}
export interface UnloadedChunk extends ChunkCoord {
    readonly key: string;
}
export declare class ChunkLoading<TRender> {
    private readonly source;
    /** Nombre maximal de chunks intégrés par image (évite les à-coups quand beaucoup arrivent ensemble). */
    private readonly maxPerFrame;
    private readonly requested;
    private readonly loadedCoords;
    private readonly chunkData;
    constructor(source: ChunkSource<TRender>, 
    /** Nombre maximal de chunks intégrés par image (évite les à-coups quand beaucoup arrivent ensemble). */
    maxPerFrame: number);
    /** Données des chunks chargés (pour le sol de la physique). */
    get chunks(): ReadonlyMap<string, ChunkData>;
    /** Coordonnées des chunks chargés (pour le prochain plan de streaming). */
    get loaded(): ReadonlyMap<string, ChunkCoord>;
    get pendingCount(): number;
    /**
     * Applique un plan calculé pour un joueur en (x, z) : demande ce qui manque (priorité = distance² au joueur),
     * annule les demandes devenues inutiles, et décharge ce qui doit l'être. Rend les chunks déchargés.
     */
    applyPlan(plan: StreamPlan, x: number, z: number): readonly UnloadedChunk[];
    /** Intègre au plus `maxPerFrame` chunks prêts parmi ceux encore demandés. */
    collect(): readonly LoadedChunk<TRender>[];
}
