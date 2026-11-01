import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { type Locomotion } from '../render-data/character-motion';
export declare class LocomotionAnimator {
    private readonly groups;
    private weights;
    constructor(groups: Readonly<Record<Locomotion, AnimationGroup>>);
    /** À appeler à chaque image : `speedMps` est la vitesse au sol du personnage (m/s). */
    update(dtSeconds: number, speedMps: number): void;
}
