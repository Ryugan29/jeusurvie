// Effets d'image appliqués après le rendu (« développement » de l'image HDR) : tone mapping ACES — comme une pellicule, les zones
// très claires s'adoucissent au lieu de brûler et les couleurs gardent leur corps —, halo des seules sources qui dépassent le
// blanc (disque du soleil, éclairs, étoiles brillantes), anticrénelage d'image, grain de film et netteté discrets, vignettage
// d'objectif léger. Direction réaliste (ADR 0012) : pas de saturation ajoutée de jour, contraste confié à la courbe ACES.
// L'exposition, la saturation et une teinte suivent l'heure (render-data/grade → applyGrade, à chaque image).
// Ce que chaque profil active (halo, FXAA, grain, netteté) vient de render-data/quality → post, image.
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { ColorCurves } from '@babylonjs/core/Materials/colorCurves';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import type { Scene } from '@babylonjs/core/scene';
import { DAY_GRADE, type Grade } from '../render-data/grade';
import type { PostQuality } from '../render-data/quality';

export const COLOR_GRADE = {
  /** Luminosité globale de jour (1 = inchangée). */
  exposure: DAY_GRADE.exposure,
  /** Contraste (1 = inchangé) : la courbe ACES en donne déjà ; un léger supplément seulement. */
  contrast: 1.06,
  /** Saturation ajoutée de jour (−100 à 100) : aucune, la lumière et les matières font les couleurs. */
  saturation: DAY_GRADE.saturation,
  /** Luminance (HDR) à partir de laquelle une zone « rayonne » : le disque du soleil et les éclairs, pas la neige au soleil de midi
   * (≈ 1,8 avant étalonnage). */
  bloomThreshold: 2,
  /** Force du halo. */
  bloomWeight: 0.28,
  /** Taille du halo (px) par défaut (le profil graphique la fixe). */
  bloomKernel: 64,
  /** Assombrissement des coins (0 = aucun) : celui d'un objectif, à peine visible. */
  vignetteWeight: 0.55,
  /** Renforcement des détails (0 = aucun) par défaut : faible, il durcissait les marches d'escalier des brins d'herbe. */
  sharpen: 0.1,
  /** Grain de film (0 à 100) par défaut : discret. */
  grain: 5,
} as const;

/** Tone mapping : ACES (cinéma, par défaut) ; standard et neutre KHR pour comparer (?tonemap=standard|neutre). */
export type ToneMapping = 'aces' | 'standard' | 'neutre';

const TONE_MAPPING_TYPES: Readonly<Record<ToneMapping, number>> = {
  aces: ImageProcessingConfiguration.TONEMAPPING_ACES,
  standard: ImageProcessingConfiguration.TONEMAPPING_STANDARD,
  neutre: ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL,
};

/** Lit le tone mapping demandé dans l'adresse (?tonemap=…) : ACES si absent ou inconnu. */
export function parseToneMapping(text: string | null): ToneMapping {
  return text === 'standard' || text === 'neutre' ? text : 'aces';
}

export interface PostProcessingOptions {
  readonly toneMapping?: ToneMapping;
  /** Halo, grain, netteté du profil graphique (défaut : COLOR_GRADE). */
  readonly post?: Pick<PostQuality, 'bloomKernel' | 'grain' | 'sharpen'>;
  /** Anticrénelage d'image (défaut : oui). */
  readonly fxaa?: boolean;
}

/** Ce que l'anticrénelage touche : l'image du rendu multiple (si l'occlusion ambiante l'a créé) ou celle du pipeline. */
export interface MsaaTargets {
  readonly prePassRenderer?: { samples: number } | null | undefined;
  readonly pipeline?: { samples: number } | undefined;
}

/**
 * MSAA de l'image où la scène est dessinée. Avec l'occlusion ambiante (SSAO2), la scène est dessinée dans le rendu multiple
 * (prePassRenderer) : c'est lui qui doit être multi-échantillonné, sinon le MSAA du pipeline ne reçoit qu'une image déjà
 * crénelée. Sans rendu multiple, c'est la première image du pipeline d'étalonnage. Rend le nombre d'échantillons demandé.
 */
export function enableMsaa(targets: MsaaTargets, samples: number): number {
  const n = Math.max(1, Math.floor(samples));
  if (targets.prePassRenderer) targets.prePassRenderer.samples = n;
  else if (targets.pipeline) targets.pipeline.samples = n;
  return n;
}

export function createPostProcessing(scene: Scene, camera: Camera, options: PostProcessingOptions = {}): DefaultRenderingPipeline {
  // HDR : image en demi-flottants, la lumière n'est pas coupée à 1 avant l'étalonnage (halo exact, ciel et soleil nuancés).
  const pipeline = new DefaultRenderingPipeline('etalonnage', true, scene, [camera]);
  const post = options.post ?? { bloomKernel: COLOR_GRADE.bloomKernel, grain: COLOR_GRADE.grain, sharpen: COLOR_GRADE.sharpen };
  pipeline.fxaaEnabled = options.fxaa ?? true;

  pipeline.bloomEnabled = post.bloomKernel > 0;
  pipeline.bloomThreshold = COLOR_GRADE.bloomThreshold;
  pipeline.bloomWeight = COLOR_GRADE.bloomWeight;
  pipeline.bloomKernel = Math.max(1, post.bloomKernel);
  pipeline.bloomScale = 0.5;

  pipeline.sharpenEnabled = post.sharpen > 0;
  pipeline.sharpen.edgeAmount = post.sharpen;
  pipeline.sharpen.colorAmount = 1;

  pipeline.grainEnabled = post.grain > 0;
  pipeline.grain.intensity = post.grain;
  pipeline.grain.animated = true;

  pipeline.imageProcessingEnabled = true;
  const ip = pipeline.imageProcessing!;
  // ACES : contraste et couleurs « de cinéma » sur une image HDR. Il jaunit un peu les verts : la saturation de l'étalonnage
  // (render-data/grade) compense. Le standard (teintes intactes, plus plat) et le neutre KHR restent là pour comparer.
  ip.toneMappingEnabled = true;
  ip.toneMappingType = TONE_MAPPING_TYPES[options.toneMapping ?? 'aces'];
  ip.exposure = COLOR_GRADE.exposure;
  ip.contrast = COLOR_GRADE.contrast;
  ip.vignetteEnabled = true;
  ip.vignetteWeight = COLOR_GRADE.vignetteWeight;
  ip.vignetteColor.set(0, 0, 0, 0);
  ip.colorCurvesEnabled = true;
  const curves = new ColorCurves();
  curves.globalSaturation = COLOR_GRADE.saturation;
  ip.colorCurves = curves;
  return pipeline;
}

/** Étalonnage de l'heure (render-data/grade), à chaque image : exposition, saturation, teinte (orange au soleil bas, bleue la nuit). */
export function applyGrade(pipeline: DefaultRenderingPipeline, grade: Grade): void {
  const ip = pipeline.imageProcessing;
  if (!ip?.colorCurves) return;
  ip.exposure = grade.exposure;
  ip.colorCurves.globalSaturation = grade.saturation;
  ip.colorCurves.globalHue = grade.hue;
  ip.colorCurves.globalDensity = grade.tint;
}
