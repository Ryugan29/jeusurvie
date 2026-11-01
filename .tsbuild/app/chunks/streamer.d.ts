import { type ChunkCoord } from '../../core/world/chunk';
export interface StreamParams {
    /** Distance de vue voulue : un chunk est voulu si son centre est à cette distance ou moins (m). */
    readonly viewRadiusM: number;
    /** Marge avant déchargement, pour éviter de charger/décharger en boucle à la frontière (m). */
    readonly unloadMarginM: number;
    /** Nombre maximal de chunks chargés (ou demandés) en même temps. */
    readonly maxChunks: number;
}
export interface StreamPlan {
    /** Chunks à avoir (déjà chargés gardés + à charger), du plus proche au plus lointain. */
    readonly wanted: readonly ChunkCoord[];
    /** Chunks voulus pas encore chargés, du plus proche au plus lointain. */
    readonly toLoad: readonly ChunkCoord[];
    /** Clés des chunks chargés à libérer. */
    readonly toUnload: readonly string[];
}
/**
 * Distance de vue réellement utilisée : celle demandée, réduite pour que le disque de vue tienne dans le plafond
 * (π·(r/64)² ≤ maxChunks). Ainsi le plafond ne coupe presque jamais le disque, ce qui évite les va-et-vient.
 */
export declare function effectiveViewRadius(viewRadiusM: number, maxChunks: number): number;
/**
 * Chunks dont le centre est à `radiusM` ou moins de (x, z), triés par distance (égalités : z puis x), limités aux
 * `maxChunks` plus proches, et jamais au-delà de `worldLimitM` de l'origine (par défaut WORLD_RADIUS_M + radiusM :
 * on peut voir le bord du monde, pas plus loin). Le chunk sous les pieds est toujours le premier.
 */
export declare function chunksAround(x: number, z: number, radiusM: number, maxChunks: number, worldLimitM?: number): ChunkCoord[];
/**
 * Ce qu'il faut charger et décharger pour un joueur en (x, z), sachant ce qui est déjà chargé.
 * Priorité aux chunks déjà chargés : ils restent tant qu'ils sont dans la vue + la marge (et sous le plafond) ;
 * les nouveaux comblent la place restante, du plus proche au plus lointain.
 */
export declare function planStreaming(x: number, z: number, loaded: ReadonlyMap<string, ChunkCoord>, params: StreamParams): StreamPlan;
