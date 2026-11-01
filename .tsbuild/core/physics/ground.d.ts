import { type ChunkData } from '../world/chunk';
import type { Vec3 } from '../shared/vec';
/**
 * Hauteur du sol au point monde (x, z) d'un chunk dont le coin (col 0, row 0) est en `origin`.
 * `undefined` si le point est hors du chunk (bords inclus).
 */
export declare function groundHeight(heights: Float32Array, origin: {
    readonly x: number;
    readonly z: number;
}, x: number, z: number): number | undefined;
/** Hauteur du sol en (x, z) parmi les chunks chargés ; `undefined` si le chunk n'est pas chargé. */
export declare function groundHeightIn(chunks: ReadonlyMap<string, ChunkData>, x: number, z: number): number | undefined;
/**
 * Déplacement minimal sur le sol : avance de (dx, dz) et se pose sur le sol.
 * Refusé (on reste sur place) si le sol d'arrivée n'est pas chargé ou si la montée dépasse `maxSlope`.
 * Pas encore d'obstacles ni de saut (moveAndSlide viendra plus tard).
 */
export declare function moveOnGround(pos: Vec3, delta: {
    readonly dx: number;
    readonly dz: number;
}, ground: (x: number, z: number) => number | undefined, maxSlope: number): Vec3;
