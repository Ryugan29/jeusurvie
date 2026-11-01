// Quel modèle 3D représente une ressource (clés de assets/models/nature). Dans le cœur parce que deux mondes s'en servent :
// l'affichage (adapters/render-data) et les collisions (core/physics/colliders) — ils doivent désigner le même modèle.
import { VARIANT_COUNT, type Resource, type ResourceKind } from './placement';

/** `n` fois chaque modèle, dans l'ordre : la part d'un modèle parmi les variantes en fixe la fréquence (n sur VARIANT_COUNT). */
function variants(counts: readonly (readonly [string, number])[]): readonly string[] {
  return counts.flatMap(([model, n]) => Array.from({ length: n }, () => model));
}

/**
 * Les VARIANT_COUNT variantes de chaque type, dans l'ordre : le hasard de la case (Resource.variant) en désigne une.
 * Un modèle présent 3 fois sur 16 pousse 3 fois plus souvent qu'un modèle présent une fois. Arbres morts : rares.
 * Pas de TwistedTree ni de CommonTree_1 : plus de 6 000 triangles, au-dessus du plafond des assets (tests/assets).
 */
export const VEGETATION_VARIANTS: Readonly<Record<ResourceKind, readonly string[]>> = {
  tree: variants([['CommonTree_2', 3], ['CommonTree_3', 4], ['CommonTree_4', 3], ['CommonTree_5', 4], ['DeadTree_3', 1], ['DeadTree_5', 1]]),
  pine: variants([['Pine_1', 3], ['Pine_2', 3], ['Pine_3', 3], ['Pine_4', 3], ['Pine_5', 3], ['DeadTree_4', 1]]),
  bush: variants([['Bush_Common', 10], ['Bush_Common_Flowers', 6]]),
  rock: variants([['Rock_Medium_1', 5], ['Rock_Medium_2', 5], ['Rock_Medium_3', 6]]),
  grass: variants([['Grass_Common_Tall', VARIANT_COUNT]]),
  flowers: variants([['Flower_3_Group', VARIANT_COUNT]]),
};

/** Modèles 3D par type de ressource, sans doublon (clés de assets/models/nature, voir adapters/babylon/asset-library). */
const distinct = (slots: readonly string[]): readonly string[] => [...new Set(slots)];
export const VEGETATION_MODELS: Readonly<Record<ResourceKind, readonly string[]>> = {
  tree: distinct(VEGETATION_VARIANTS.tree),
  pine: distinct(VEGETATION_VARIANTS.pine),
  bush: distinct(VEGETATION_VARIANTS.bush),
  rock: distinct(VEGETATION_VARIANTS.rock),
  grass: distinct(VEGETATION_VARIANTS.grass),
  flowers: distinct(VEGETATION_VARIANTS.flowers),
};

/** Modèle d'une ressource : sa variante choisit parmi les variantes de son type (reboucle hors plage). */
export function modelKeyFor(r: Resource): string {
  return VEGETATION_VARIANTS[r.kind][r.variant % VARIANT_COUNT]!;
}
