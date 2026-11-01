import { type ChunkData } from './chunk';
export type CoverKind = 'grass' | 'clover' | 'flower' | 'fern' | 'mushroom' | 'pebble';
/**
 * Modèles 3D de chaque type (clés de assets/models/nature). L'herbe, la masse du couvre-sol, n'utilise que les deux
 * modèles les plus légers (155 et 326 triangles) ; les autres types sont rares ou en plaques.
 */
export declare const GROUND_COVER_MODELS: Readonly<Record<CoverKind, readonly string[]>>;
export interface CoverItem {
    readonly kind: CoverKind;
    /** Clé de modèle (de GROUND_COVER_MODELS[kind]). */
    readonly model: string;
    /** Position dans le monde (m), à l'intérieur du chunk. */
    readonly x: number;
    readonly z: number;
    /** Rotation autour de la verticale, en tours (dans [0, 1)). */
    readonly rotation: number;
    /** Échelle uniforme (> 0). */
    readonly scale: number;
}
/** Côté d'une case du couvre-sol (m) : divise CHUNK_SIZE. */
export declare const COVER_CELL_M = 1;
export declare const COVER_MAX_SLOPE = 0.62;
export declare const COVER_PATH_MAX = 0.6;
/**
 * Couvre-sol du chunk, dans l'ordre des cases (z puis x), les champignons à la fin.
 * @param seed graine du monde, entier non signé 32 bits (validée à la frontière).
 * @param chunk le chunk déjà généré : ses hauteurs donnent la pente et l'altitude de chaque case.
 */
export declare function groundCoverInChunk(seed: number, chunk: ChunkData): CoverItem[];
