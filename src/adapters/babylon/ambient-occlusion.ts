// Occlusion ambiante à l'écran (SSAO2) : assombrit en douceur ce qui est « au creux » — le pied des arbres, le dessous des
// rochers, le contact des personnages avec le sol, le cœur des buissons. Rayon court : seulement les contacts, pas de halo noir.
// Doit être créée AVANT le pipeline d'étalonnage (post-processing) : l'occlusion s'applique à l'image brute, l'étalonnage
// (tonalité, saturation) vient ensuite.
// Le dôme de ciel n'écrit pas dans la carte de profondeur du rendu multiple : le ciel reste « loin », jamais assombri.
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline';
import type { Scene } from '@babylonjs/core/scene';
import type { AoQuality } from '../render-data/quality';

/** Distance (m) au-delà de laquelle l'occlusion s'efface (trop loin, elle ne ferait que scintiller). */
export const AO_FAR_M = 60;
/** Part de lumière gardée même au plus creux : l'ombre de contact reste douce, jamais un trou noir. */
const AO_BASE = 0.2;

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

export function configureAo(target: AoSettings, quality: AoQuality): void {
  target.radius = quality.radiusM;
  target.totalStrength = quality.strength;
  target.samples = quality.samples;
  target.base = AO_BASE;
  target.maxZ = AO_FAR_M;
  target.minZAspect = 0.5;
  target.expensiveBlur = quality.expensiveBlur;
  target.bypassBlur = false;
}

/** Crée l'occlusion ambiante ; `undefined` si le moteur ne sait pas faire de rendu multiple (pas de WebGL2) : image sans, sans erreur. */
export function createAmbientOcclusion(scene: Scene, camera: Camera, quality: AoQuality): SSAO2RenderingPipeline | undefined {
  if (!scene.getEngine()._features.supportSSAO2) return undefined;
  const pipeline = new SSAO2RenderingPipeline('contact', scene, { ssaoRatio: quality.ratio, blurRatio: 1 }, [camera]);
  configureAo(pipeline, quality);
  return pipeline;
}
