import type { Vec3 } from '../../core/shared/vec';
/** Position à donner au modèle pour que son point le plus bas (`meshMinY`, relatif à son origine) soit aux pieds. */
export declare function meshPositionForFeet(feet: Vec3, meshMinY: number): Vec3;
