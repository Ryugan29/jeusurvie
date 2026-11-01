import type { Camera } from '@babylonjs/core/Cameras/camera';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import type { Scene } from '@babylonjs/core/scene';
import { type Grade } from '../render-data/grade';
export declare const COLOR_GRADE: {
    /** Luminosité globale de jour (1 = inchangée). */
    readonly exposure: 1;
    /** Contraste (1 = inchangé). */
    readonly contrast: 1.15;
    /** Saturation ajoutée de jour (−100 à 100) : couleurs franches des aperçus du pack. */
    readonly saturation: 20;
    /** Luminance (HDR) à partir de laquelle une zone « rayonne » : le disque du soleil et les éclairs, pas la neige au soleil de midi
     * (≈ 1,8 avant étalonnage). */
    readonly bloomThreshold: 2;
    /** Force du halo. */
    readonly bloomWeight: 0.35;
    /** Taille du halo (px). */
    readonly bloomKernel: 64;
    /** Assombrissement des coins (0 = aucun). */
    readonly vignetteWeight: 1.2;
    /** Renforcement des détails (0 = aucun) : faible, il durcissait les marches d'escalier des brins d'herbe. */
    readonly sharpen: 0.1;
    /** Grain de film (0 à 100) : discret. */
    readonly grain: 6;
};
/** Tone mapping : ACES (cinéma, par défaut) ; standard et neutre KHR pour comparer (?tonemap=standard|neutre). */
export type ToneMapping = 'aces' | 'standard' | 'neutre';
/** Lit le tone mapping demandé dans l'adresse (?tonemap=…) : ACES si absent ou inconnu. */
export declare function parseToneMapping(text: string | null): ToneMapping;
export interface PostProcessingOptions {
    readonly toneMapping?: ToneMapping;
}
/** Ce que l'anticrénelage touche : l'image du rendu multiple (si l'occlusion ambiante l'a créé) ou celle du pipeline. */
export interface MsaaTargets {
    readonly prePassRenderer?: {
        samples: number;
    } | null | undefined;
    readonly pipeline?: {
        samples: number;
    } | undefined;
}
/**
 * MSAA de l'image où la scène est dessinée. Avec l'occlusion ambiante (SSAO2), la scène est dessinée dans le rendu multiple
 * (prePassRenderer) : c'est lui qui doit être multi-échantillonné, sinon le MSAA du pipeline ne reçoit qu'une image déjà
 * crénelée. Sans rendu multiple, c'est la première image du pipeline d'étalonnage. Rend le nombre d'échantillons demandé.
 */
export declare function enableMsaa(targets: MsaaTargets, samples: number): number;
export declare function createPostProcessing(scene: Scene, camera: Camera, options?: PostProcessingOptions): DefaultRenderingPipeline;
/** Étalonnage de l'heure (render-data/grade), à chaque image : exposition, saturation, teinte (orange au soleil bas, bleue la nuit). */
export declare function applyGrade(pipeline: DefaultRenderingPipeline, grade: Grade): void;
