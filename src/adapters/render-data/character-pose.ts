// Pose d'un modèle sur le sol (pure) : la position simulée est celle des PIEDS (sur le sol, cf. moveOnGround) ;
// le modèle 3D a son origine ailleurs (au centre pour une capsule). On décale pour que son bas touche le sol.
import type { Vec3 } from '../../core/shared/vec';

/** Position à donner au modèle pour que son point le plus bas (`meshMinY`, relatif à son origine) soit aux pieds. */
export function meshPositionForFeet(feet: Vec3, meshMinY: number): Vec3 {
  return { x: feet.x, y: feet.y - meshMinY, z: feet.z };
}
