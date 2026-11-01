// Éléments posés sur un chunk → matrices d'instances (« thin instances ») groupées par modèle (PUR : n'importe pas Babylon).
// Partagé par la végétation (ressources du jeu) et le couvre-sol (purement visuel).
import { groundHeight } from '../../core/physics/ground';
import { CHUNK_SIZE, type ChunkData } from '../../core/world/chunk';

/** Ce qu'il faut savoir d'un élément pour le dessiner : où, tourné de combien (en tours), à quelle échelle. */
export interface Placed {
  readonly x: number;
  readonly z: number;
  /** Rotation autour de la verticale, en tours (dans [0, 1)). */
  readonly rotation: number;
  /** Échelle uniforme. */
  readonly scale: number;
}

/** Matrices d'instances (16 nombres chacune) d'un chunk, par clé de modèle. */
export type InstanceBatches = Readonly<Record<string, Float32Array>>;

/**
 * Une matrice par élément, regroupées par modèle (dans l'ordre de la liste) : rotation autour de Y, échelle uniforme,
 * posé sur le sol du chunk (même triangulation que le rendu) et enfoncé de `sinkM` × échelle.
 */
export function instanceMatrices<T extends Placed>(
  items: readonly T[],
  modelOf: (item: T) => string,
  chunk: ChunkData,
  sinkM: number,
  /** Écrasement vertical par modèle (1 = proportions du modèle) : des touffes basses et larges plutôt que des herbes hautes. */
  heightScaleOf: (model: string) => number = () => 1,
): Record<string, Float32Array> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(modelOf(item), (counts.get(modelOf(item)) ?? 0) + 1);
  const out: Record<string, Float32Array> = {};
  for (const [model, n] of counts) out[model] = new Float32Array(n * 16);
  const filled = new Map<string, number>();
  const origin = { x: chunk.cx * CHUNK_SIZE, z: chunk.cz * CHUNK_SIZE };
  for (const item of items) {
    const model = modelOf(item), k = filled.get(model) ?? 0;
    filled.set(model, k + 1);
    const angle = item.rotation * 2 * Math.PI, c = Math.cos(angle), s = Math.sin(angle), sc = item.scale;
    const sy = sc * heightScaleOf(model);
    const y = (groundHeight(chunk.heights, origin, item.x, item.z) ?? 0) - sinkM * sy;
    // Babylon : Matrix.Compose(échelle, rotation Y, translation), stockée ligne par ligne, translation en 12..14.
    out[model]!.set([c * sc, 0, -s * sc, 0, 0, sy, 0, 0, s * sc, 0, c * sc, 0, item.x, y, item.z, 1], k * 16);
  }
  return out;
}
