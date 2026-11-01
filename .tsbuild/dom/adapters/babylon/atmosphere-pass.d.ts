import type { Camera } from '@babylonjs/core/Cameras/camera';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import '@babylonjs/core/Rendering/prePassRendererSceneComponent';
import type { Scene } from '@babylonjs/core/scene';
import type { DofQuality } from '../render-data/quality';
import type { Rgb } from '../render-data/palette';
/** Ce que la perspective atmosphérique reçoit à chaque image (SceneLighting → aerialState). */
export interface AerialState {
    /** Densité (par m) de la brume de distance. */
    readonly distanceDensity: number;
    /** Densité (par m) de la brume de hauteur à son altitude de base, son épaisseur (m) et cette altitude (m). */
    readonly heightDensity: number;
    readonly heightThicknessM: number;
    readonly heightBaseY: number;
    /** Couleur de la brume (linéaire, la même que l'horizon du ciel). */
    readonly haze: Rgb;
    /** Direction de la lumière (de l'astre vers le sol). */
    readonly sunDirection: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
    };
    /** Lumière de l'astre diffusée vers l'avant par l'air (couleur × force). */
    readonly sunScatter: Rgb;
}
/** Anisotropie de la diffusion par l'air chargé (brume, aérosols) : très tournée vers l'avant. */
export declare const AERIAL_MIE_G = 0.72;
export declare class AerialPerspective {
    private readonly scene;
    private readonly camera;
    readonly postProcess: PostProcess;
    private readonly invView;
    private readonly tanFov;
    private readonly params;
    private readonly haze;
    private readonly sunToward;
    private readonly scatter;
    constructor(scene: Scene, camera: Camera);
    /** À chaque image : l'état de l'air (aucune allocation). */
    update(state: AerialState): void;
    private bind;
    dispose(): void;
}
export declare class DistanceBlur {
    private readonly scene;
    private readonly camera;
    readonly postProcess: PostProcess;
    private readonly tanFov;
    private readonly texel;
    private readonly params;
    constructor(scene: Scene, camera: Camera, dof: DofQuality);
    dispose(): void;
}
