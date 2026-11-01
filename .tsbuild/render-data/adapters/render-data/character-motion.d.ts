import type { Vec3 } from '../../core/shared/vec';
export type Locomotion = 'Idle' | 'Walk' | 'Run';
export type LocomotionWeights = Readonly<Record<Locomotion, number>>;
export declare const LOCOMOTIONS: readonly Locomotion[];
/** Au-dessus de cette vitesse au sol (m/s), le personnage marche au lieu de rester immobile. */
export declare const WALK_FROM_MPS = 0.3;
/** Au-dessus de cette vitesse au sol (m/s), il court (le joueur du jeu va à 5 m/s). */
export declare const RUN_FROM_MPS = 3.5;
/** Durée (s) du fondu entre deux animations. */
export declare const FADE_SECONDS = 0.2;
/** Vitesse de rotation du personnage vers son cap (rad/s) : un demi-tour en un quart de seconde environ. */
export declare const TURN_RATE_RAD_PER_S = 12;
export declare function locomotionFor(speedMps: number): Locomotion;
/** Vitesse au sol (m/s) entre deux positions successives, séparées de `stepSeconds` : la pente ne compte pas. */
export declare function horizontalSpeed(from: Vec3, to: Vec3, stepSeconds: number): number;
/**
 * Poids des animations après `dtSeconds` de fondu vers `target` : la cible monte à vitesse constante (1 / fadeSeconds
 * par seconde), les autres se partagent le reste au prorata de leur poids. La somme reste à 1.
 */
export declare function fadeWeights(weights: LocomotionWeights, target: Locomotion, dtSeconds: number, fadeSeconds: number): LocomotionWeights;
/** Cap (rad) d'un déplacement (dx, dz), même convention que la caméra : 0 = vers +Z, π/2 = vers +X. Immobile : aucun. */
export declare function headingOf(dx: number, dz: number): number | undefined;
/** Tourne de `from` vers `to` par le plus court chemin, d'au plus `maxStep` rad. */
export declare function turnToward(from: number, to: number, maxStep: number): number;
