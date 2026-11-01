// Sol de la physique (docs/03-archi.md §4) : interpole les hauteurs float32 du chunk (`ChunkData.heights`),
// jamais `heightAt`, sur la MÊME triangulation que le maillage affiché (core/world/triangulation).
import { CHUNK_SIZE, CHUNK_VERTS, chunkCoordOf, chunkKey, type ChunkData } from '../world/chunk';
import type { Vec3 } from '../shared/vec';
import { heightInQuad } from '../world/triangulation';

const STEP = CHUNK_SIZE / (CHUNK_VERTS - 1);
const LAST_QUAD = CHUNK_VERTS - 2;

/**
 * Hauteur du sol au point monde (x, z) d'un chunk dont le coin (col 0, row 0) est en `origin`.
 * `undefined` si le point est hors du chunk (bords inclus).
 */
export function groundHeight(
  heights: Float32Array,
  origin: { readonly x: number; readonly z: number },
  x: number,
  z: number,
): number | undefined {
  const lx = (x - origin.x) / STEP, lz = (z - origin.z) / STEP;
  if (!(lx >= 0 && lz >= 0 && lx <= CHUNK_VERTS - 1 && lz <= CHUNK_VERTS - 1)) return undefined;
  const col = Math.min(Math.floor(lx), LAST_QUAD), row = Math.min(Math.floor(lz), LAST_QUAD);
  const i = row * CHUNK_VERTS + col;
  return heightInQuad(
    heights[i]!,
    heights[i + 1]!,
    heights[i + CHUNK_VERTS]!,
    heights[i + CHUNK_VERTS + 1]!,
    lx - col,
    lz - row,
  );
}

/** Hauteur du sol en (x, z) parmi les chunks chargés ; `undefined` si le chunk n'est pas chargé. */
export function groundHeightIn(chunks: ReadonlyMap<string, ChunkData>, x: number, z: number): number | undefined {
  const { cx, cz } = chunkCoordOf(x, z);
  const chunk = chunks.get(chunkKey(cx, cz));
  return chunk === undefined ? undefined : groundHeight(chunk.heights, { x: cx * CHUNK_SIZE, z: cz * CHUNK_SIZE }, x, z);
}

/**
 * Déplacement minimal sur le sol : avance de (dx, dz) et se pose sur le sol.
 * Refusé (on reste sur place) si le sol d'arrivée n'est pas chargé ou si la montée dépasse `maxSlope`.
 * Pas encore d'obstacles ni de saut (moveAndSlide viendra plus tard).
 */
export function moveOnGround(
  pos: Vec3,
  delta: { readonly dx: number; readonly dz: number },
  ground: (x: number, z: number) => number | undefined,
  maxSlope: number,
): Vec3 {
  const here = ground(pos.x, pos.z);
  const stay: Vec3 = here === undefined ? pos : { x: pos.x, y: here, z: pos.z };
  const distance = Math.sqrt(delta.dx * delta.dx + delta.dz * delta.dz);
  if (distance === 0) return stay;
  const x = pos.x + delta.dx, z = pos.z + delta.dz;
  const there = ground(x, z);
  if (there === undefined) return stay;
  if (here !== undefined && there - here > maxSlope * distance) return stay;
  return { x, y: there, z };
}
