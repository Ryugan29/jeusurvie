import type { Scene } from '@babylonjs/core/scene';
import type { Vec3 } from '../../core/shared/vec';
export declare class ContactShadow {
    private readonly mesh;
    private readonly normal;
    private readonly rotation;
    constructor(scene: Scene, radius: number, darkness: number);
    /** Place l'ombre aux pieds, inclinée selon la normale du sol (verticale si inconnue). */
    place(feet: Vec3, groundNormal: Vec3 | undefined): void;
}
