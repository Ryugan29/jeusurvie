import type { Camera } from '@babylonjs/core/Cameras/camera';
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline';
import type { Scene } from '@babylonjs/core/scene';
import type { AoQuality } from '../render-data/quality';
/** Distance (m) au-delà de laquelle l'occlusion s'efface (trop loin, elle ne ferait que scintiller). */
export declare const AO_FAR_M = 60;
/** Ce que les réglages touchent dans le pipeline de Babylon (de quoi les tester sans carte graphique). */
export interface AoSettings {
    radius: number;
    totalStrength: number;
    samples: number;
    base: number;
    maxZ: number;
    minZAspect: number;
    expensiveBlur: boolean;
    bypassBlur: boolean;
}
export declare function configureAo(target: AoSettings, quality: AoQuality): void;
/** Crée l'occlusion ambiante ; `undefined` si le moteur ne sait pas faire de rendu multiple (pas de WebGL2) : image sans, sans erreur. */
export declare function createAmbientOcclusion(scene: Scene, camera: Camera, quality: AoQuality): SSAO2RenderingPipeline | undefined;
