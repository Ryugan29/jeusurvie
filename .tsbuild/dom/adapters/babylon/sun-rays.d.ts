import type { Camera } from '@babylonjs/core/Cameras/camera';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import type { Scene } from '@babylonjs/core/scene';
import type { Lighting } from '../render-data/lighting';
import type { RaysQuality } from '../render-data/quality';
export declare class SunRays {
    private readonly scene;
    private readonly camera;
    /** Carte de profondeur des obstacles (à demi-résolution). */
    readonly depthMap: RenderTargetTexture;
    private readonly depthRenderer;
    private readonly post;
    private readonly sunUv;
    private readonly shaftColor;
    private readonly toSun;
    private readonly center;
    private readonly forward;
    private readonly right;
    private readonly up;
    private strength;
    /**
     * @param isOccluder dit quels maillages cachent le soleil : le ciel et l'herbe n'en sont pas.
     */
    constructor(scene: Scene, camera: Camera, quality: RaysQuality, isOccluder: (mesh: AbstractMesh) => boolean);
    /** Force actuelle des rayons (0 à 1) : nulle dos au soleil, de nuit. */
    get intensity(): number;
    /** Le bord du maillage le plus proche est-il à portée de la caméra ? (Terrain lointain : trop d'appels de dessin pour des rais qu'on ne voit pas.) */
    private withinRange;
    /** La carte de profondeur est-elle dessinée cette image ? Seulement quand les rayons se voient : sinon, aucun coût. */
    get depthPassActive(): boolean;
    /** À chaque image, après le placement de la caméra : où est le soleil à l'écran, et quelle force a-t-il ? */
    update(l: Lighting): void;
    private updateStrength;
    dispose(): void;
}
