// Fait jouer à un personnage l'animation qui va avec sa vitesse (Idle, Walk, Run) avec un fondu enchaîné court. Les trois
// animations tournent en permanence ; seul change leur poids (render-data/character-motion décide des valeurs).
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { fadeWeights, FADE_SECONDS, LOCOMOTIONS, locomotionFor, type Locomotion, type LocomotionWeights } from '../render-data/character-motion';

export class LocomotionAnimator {
  private weights: LocomotionWeights = { Idle: 1, Walk: 0, Run: 0 };

  constructor(private readonly groups: Readonly<Record<Locomotion, AnimationGroup>>) {
    for (const l of LOCOMOTIONS) {
      groups[l].start(true);
      groups[l].weight = this.weights[l];
    }
  }

  /** À appeler à chaque image : `speedMps` est la vitesse au sol du personnage (m/s). */
  update(dtSeconds: number, speedMps: number): void {
    this.weights = fadeWeights(this.weights, locomotionFor(speedMps), dtSeconds, FADE_SECONDS);
    for (const l of LOCOMOTIONS) this.groups[l].weight = this.weights[l];
  }
}
