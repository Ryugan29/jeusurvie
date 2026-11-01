// Mouvement d'un personnage animé (pur) : quelle animation jouer selon la vitesse réelle, fondu enchaîné entre
// animations, cap du regard. Le rendu (adapters/babylon) applique ces valeurs ; aucune règle de jeu ici.
import type { Vec3 } from '../../core/shared/vec';

export type Locomotion = 'Idle' | 'Walk' | 'Run';
export type LocomotionWeights = Readonly<Record<Locomotion, number>>;

export const LOCOMOTIONS: readonly Locomotion[] = ['Idle', 'Walk', 'Run'];

/** Au-dessus de cette vitesse au sol (m/s), le personnage marche au lieu de rester immobile. */
export const WALK_FROM_MPS = 0.3;
/** Au-dessus de cette vitesse au sol (m/s), il court (le joueur du jeu va à 5 m/s). */
export const RUN_FROM_MPS = 3.5;
/** Durée (s) du fondu entre deux animations. */
export const FADE_SECONDS = 0.2;
/** Vitesse de rotation du personnage vers son cap (rad/s) : un demi-tour en un quart de seconde environ. */
export const TURN_RATE_RAD_PER_S = 12;

export function locomotionFor(speedMps: number): Locomotion {
  if (speedMps < WALK_FROM_MPS) return 'Idle';
  return speedMps < RUN_FROM_MPS ? 'Walk' : 'Run';
}

/** Vitesse au sol (m/s) entre deux positions successives, séparées de `stepSeconds` : la pente ne compte pas. */
export function horizontalSpeed(from: Vec3, to: Vec3, stepSeconds: number): number {
  return Math.hypot(to.x - from.x, to.z - from.z) / stepSeconds;
}

/**
 * Poids des animations après `dtSeconds` de fondu vers `target` : la cible monte à vitesse constante (1 / fadeSeconds
 * par seconde), les autres se partagent le reste au prorata de leur poids. La somme reste à 1.
 */
export function fadeWeights(weights: LocomotionWeights, target: Locomotion, dtSeconds: number, fadeSeconds: number): LocomotionWeights {
  const gained = Math.min(1, weights[target] + dtSeconds / fadeSeconds);
  const others = LOCOMOTIONS.filter((l) => l !== target);
  const othersTotal = others.reduce((total, l) => total + weights[l], 0);
  const scale = othersTotal > 0 ? (1 - gained) / othersTotal : 0;
  const next = { Idle: 0, Walk: 0, Run: 0 };
  for (const l of others) next[l] = weights[l] * scale;
  next[target] = gained;
  return next;
}

/** Cap (rad) d'un déplacement (dx, dz), même convention que la caméra : 0 = vers +Z, π/2 = vers +X. Immobile : aucun. */
export function headingOf(dx: number, dz: number): number | undefined {
  return dx === 0 && dz === 0 ? undefined : Math.atan2(dx, dz);
}

/** Tourne de `from` vers `to` par le plus court chemin, d'au plus `maxStep` rad. */
export function turnToward(from: number, to: number, maxStep: number): number {
  const gap = Math.atan2(Math.sin(to - from), Math.cos(to - from)); // écart ramené dans ]-π, π]
  return from + Math.min(maxStep, Math.max(-maxStep, gap));
}
