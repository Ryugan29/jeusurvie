// Capsule provisoire du personnage (remplacée par un modèle CC0 à l'étape 3).
import { CreateCapsuleVertexData } from '@babylonjs/core/Meshes/Builders/capsuleBuilder.pure';

export const CAPSULE_OPTIONS = { height: 1.8, radius: 0.35, tessellation: 16 } as const;

/** Point le plus bas du maillage capsule, relatif à son origine (mesuré sur les sommets réels de Babylon). */
export function capsuleMinY(options: { readonly height: number; readonly radius: number; readonly tessellation: number }): number {
  const positions = CreateCapsuleVertexData({ ...options }).positions ?? [];
  let min = Infinity;
  for (let i = 1; i < positions.length; i += 3) min = Math.min(min, positions[i]!);
  return min;
}
