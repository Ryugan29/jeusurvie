import type { ChunkData } from './world/chunk';
/** Un chunk généré, avec les données de rendu préparées à côté (opaques pour le cœur). */
export interface ReadyChunk<TRender = unknown> {
    readonly data: ChunkData;
    readonly render: TRender;
}
/** Source de chunks (ex. générés dans un Web Worker). Priorité : plus petite = plus urgente (ex. distance²). */
export interface ChunkSource<TRender = unknown> {
    /** Demande un chunk ; redemander met seulement à jour sa priorité. */
    request(cx: number, cz: number, priority: number): void;
    /** Le chunk n'est plus voulu : il ne sera pas rendu par drainReady. */
    cancel(cx: number, cz: number): void;
    /** Rend au plus `max` chunks prêts, les plus prioritaires d'abord, et les oublie. */
    drainReady(max: number): ReadyChunk<TRender>[];
}
