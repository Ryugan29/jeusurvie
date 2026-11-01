import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent';
import '@babylonjs/core/Rendering/prePassRendererSceneComponent';
import type { Scene } from '@babylonjs/core/scene';
import type { Grade } from '../render-data/grade';
import type { Lighting } from '../render-data/lighting';
import { type QualitySettings } from '../render-data/quality';
import { type AerialState } from './atmosphere-pass';
import { type ToneMapping } from './post-processing';
import { SunShadows } from './sun-shadows';
export interface RenderPipelineOptions {
    /** Tone mapping (?tonemap=…). */
    readonly toneMapping: ToneMapping;
    /** Développement de l'image (?post=0 : sans, pour comparer). */
    readonly grading: boolean;
    /** Gouttes sur l'objectif (?gouttes=0 : sans). */
    readonly lensDrops: boolean;
    /** Les maillages qui cachent le soleil pour les rayons (ni le ciel, ni l'herbe, ni les gros blocs lointains). */
    readonly isRayOccluder: (mesh: AbstractMesh) => boolean;
    /** Densité de pixels de l'écran (window.devicePixelRatio). */
    readonly devicePixelRatio: () => number;
    /** Bascule de la brume : perspective atmosphérique en passe d'image ou brume des matériaux (SceneLighting). */
    readonly setAerialPerspective: (enabled: boolean) => void;
}
/** Ce qui change à chaque image. */
export interface RenderFrame {
    readonly light: Lighting;
    readonly grade: Grade;
    readonly aerial: AerialState;
    /** Sol mouillé (0 à 1) : les reflets à l'écran ne servent que sur le mouillé. */
    readonly wetness: number;
    /** Objectif mouillé (0 à 1) et horloge réelle (s) des gouttes. */
    readonly lensWetness: number;
    readonly timeS: number;
}
export declare class RenderPipeline {
    private readonly scene;
    private readonly camera;
    private readonly sun;
    private readonly options;
    private quality;
    private ao;
    private ssr;
    private ssrActive;
    private aerial;
    private dof;
    private rays;
    private motion;
    private grading;
    private lens;
    private shadowGenerator;
    private readonly casters;
    private msaa;
    constructor(scene: Scene, camera: Camera, sun: DirectionalLight, options: RenderPipelineOptions);
    /** Profil en cours (undefined avant le premier apply). */
    get current(): QualitySettings | undefined;
    /** Échantillons MSAA réellement obtenus (plafonnés par la carte graphique). */
    get msaaSamples(): number;
    get shadows(): SunShadows | undefined;
    /** Un objet qui projette une ombre (retenu : un générateur refait par un changement de profil le reçoit aussi). */
    addShadowCaster(mesh: AbstractMesh): void;
    /** Applique un profil : reconstruit la chaîne d'effets, les ombres si besoin, la densité de pixels et le MSAA. */
    apply(q: QualitySettings): void;
    /** À chaque image : ombres, rayons, étalonnage, air, reflets du mouillé, gouttes. */
    update(frame: RenderFrame): void;
    dispose(): void;
    private rebuildShadows;
    /**
     * Reflets à l'écran : sur une image HDR linéaire (avant le développement), atténués au bord de l'écran et selon la rugosité.
     * Un rayon qui ne trouve rien n'ajoute rien : le reflet du ciel, lui, vient déjà des matériaux (éclairage d'environnement).
     */
    private createSsr;
    /** Allume ou éteint les passes des reflets SANS les détacher (elles gardent leur place dans la chaîne). */
    private setSsrActive;
    /** Flou de mouvement de la caméra seule (pas par objet) : discret, au tournant rapide de la caméra. */
    private createMotionBlur;
    private disposePostProcesses;
}
