// Ressources d'un chunk → matrices d'instances par modèle (PUR : n'importe pas Babylon). Calculé dans le worker ;
// le rendu les donne telles quelles aux « thin instances » (un appel de dessin par modèle, pas par objet).
import { CHUNK_SIZE, type ChunkData } from '../../core/world/chunk';
import type { Resource, ResourceKind } from '../../core/world/placement';
import { modelKeyFor, VEGETATION_MODELS } from '../../core/world/resource-models';
import { instanceMatrices, type InstanceBatches } from './instance-matrices';

// Les modèles par type vivent dans le cœur (les collisions s'y réfèrent aussi) ; ils restent importables d'ici.
export { modelKeyFor, VEGETATION_MODELS };

/** Portée d'affichage (m) par type, au chunk près (carrés de 64 m) : le gros se voit de loin, l'herbe seulement de près. */
const VEGETATION_RANGE_M: Readonly<Record<ResourceKind, number>> = {
  tree: 600,
  pine: 600,
  bush: 280,
  rock: 280,
  grass: 110,
  flowers: 110,
};

const RANGE_BY_MODEL: ReadonlyMap<string, number> = new Map(
  (Object.entries(VEGETATION_MODELS) as [ResourceKind, readonly string[]][]).flatMap(([kind, models]) =>
    models.map((m): [string, number] => [m, VEGETATION_RANGE_M[kind]]),
  ),
);

/** Portée d'affichage (m) d'un modèle de végétation. */
export function vegetationRangeM(modelKey: string): number {
  const range = RANGE_BY_MODEL.get(modelKey);
  if (range === undefined) throw new Error(`modèle de végétation inconnu : ${modelKey}`);
  return range;
}

/** Le lot d'un chunk est dessiné si le bord le plus proche du chunk (cx, cz) est à portée du joueur (px, pz). */
export function vegetationVisible(cx: number, cz: number, px: number, pz: number, rangeM: number): boolean {
  const dx = Math.max(cx * CHUNK_SIZE - px, 0, px - (cx + 1) * CHUNK_SIZE);
  const dz = Math.max(cz * CHUNK_SIZE - pz, 0, pz - (cz + 1) * CHUNK_SIZE);
  return Math.hypot(dx, dz) <= rangeM;
}

/** Met bout à bout les lots d'un même modèle (un par chunk) : un seul tampon d'instances, un seul dessin par morceau. */
export function concatInstances(batches: readonly Float32Array[]): Float32Array {
  const out = new Float32Array(batches.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of batches) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}

/** Les instances (matrices de 16 nombres) dont la position (éléments 12 et 14) est à au plus `radiusM` mètres, à l'horizontale, de (x, z). */
export function instancesWithin(matrices: Float32Array, x: number, z: number, radiusM: number): Float32Array {
  const count = matrices.length / 16;
  const kept = new Float32Array(matrices.length);
  const r2 = radiusM * radiusM;
  let n = 0;
  for (let i = 0; i < count; i++) {
    const dx = matrices[i * 16 + 12]! - x, dz = matrices[i * 16 + 14]! - z;
    if (dx * dx + dz * dz <= r2) kept.set(matrices.subarray(i * 16, i * 16 + 16), 16 * n++);
  }
  return kept.slice(0, n * 16);
}

/** Enfoncement dans le sol (m, multiplié par l'échelle) : rien ne flotte sur une pente. */
export const VEGETATION_SINK_M = 0.15;

/** Matrices d'instances (16 nombres chacune) d'un chunk, par clé de modèle. */
export type VegetationBatches = InstanceBatches;

export function vegetationInstances(resources: readonly Resource[], chunk: ChunkData): Record<string, Float32Array> {
  return instanceMatrices(resources, modelKeyFor, chunk, VEGETATION_SINK_M);
}
