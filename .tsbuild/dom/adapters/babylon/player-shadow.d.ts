import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Vec3 } from '../../core/shared/vec';
import { type Lighting } from '../render-data/lighting';
export interface PlayerShadowOptions {
    /** Côté de la carte d'ombre, en pixels (512 suffit pour un seul personnage). */
    readonly mapSize: number;
    /** Distance (m) à laquelle la lumière est placée en amont du joueur. */
    readonly lightDistance: number;
}
export declare class PlayerShadow {
    private readonly light;
    private readonly options;
    private readonly generator;
    constructor(light: DirectionalLight, options: PlayerShadowOptions);
    addCaster(mesh: AbstractMesh): void;
    /** Suit le joueur et l'astre ; la force de l'ombre suit l'intensité de l'astre. */
    update(l: Lighting, player: Vec3): void;
}
