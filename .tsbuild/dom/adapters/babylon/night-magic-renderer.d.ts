import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import '@babylonjs/core/Particles/particleSystemComponent';
import type { Scene } from '@babylonjs/core/scene';
import type { Lighting } from '../render-data/lighting';
/** Point lumineux doux : cœur blanc, halo qui s'efface (alpha et couleur décroissent ensemble). */
export declare function fireflySprite(size: number): Uint8Array;
/** Matériaux qui luisent la nuit : ceux des champignons (par nom). */
export declare function glowingMaterials(materials: readonly Material[]): PBRMaterial[];
export declare class NightMagicRenderer {
    private readonly glowing;
    private readonly fireflies;
    private readonly emitter;
    constructor(scene: Scene, glowing: readonly PBRMaterial[]);
    /** À chaque image : les lucioles suivent le joueur (pieds en x, y, z) et leur nombre suit l'heure ; la lueur des champignons aussi. */
    update(l: Lighting, x: number, y: number, z: number): void;
    dispose(): void;
}
