import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { type Lighting } from '../render-data/lighting';
import type { ShadowQuality } from '../render-data/quality';
export declare class SunShadows {
    readonly generator: CascadedShadowGenerator;
    constructor(light: DirectionalLight, camera: Camera, quality: ShadowQuality);
    addCaster(mesh: AbstractMesh): void;
    addReceiver(mesh: AbstractMesh): void;
    /** La force de l'ombre suit l'intensité de l'astre : à chaque image (aucune allocation). */
    update(l: Lighting): void;
    dispose(): void;
}
