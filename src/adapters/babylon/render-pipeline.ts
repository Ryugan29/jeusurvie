// Chaîne de rendu pilotée par le profil graphique (render-data/quality) : le SEUL endroit qui crée, ordonne, règle et détruit les
// effets qui coûtent à la carte graphique. `apply(profil)` reconstruit tout à chaud (changement de profil depuis les réglages) ;
// `update(image)` règle à chaque image ce qui suit la lumière, la météo et l'heure (aucune allocation).
//
// Ordre des passes (la scène est d'abord dessinée dans le rendu multiple — pré-passe — dès qu'un effet a besoin de profondeur) :
//   1. occlusion ambiante (SSAO2)            — contacts au pied des objets ;
//   2. reflets à l'écran (SSR)               — seulement quand le sol est mouillé (allumés / éteints sans réordonner) ;
//   3. perspective atmosphérique             — l'air entre l'objet et l'œil (atmosphere-pass) ;
//   4. profondeur de champ (ULTRA)           — arrière-plan lointain adouci ;
//   5. rayons de soleil                      — rais entre feuillages et rochers ;
//   6. flou de mouvement de caméra (ULTRA)   ;
//   7. développement (DefaultRenderingPipeline) — halo, tone mapping ACES, étalonnage de l'heure, FXAA, netteté, grain ;
//   8. gouttes sur l'objectif                — accrochées seulement sous la pluie, toujours en dernier.
// Ombres : générateur en cascade refait si sa qualité change ; les objets qui projettent sont retenus ici (registre) et redonnés
// au nouveau générateur.
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { MotionBlurPostProcess } from '@babylonjs/core/PostProcesses/motionBlurPostProcess';
import type { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import type { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline';
import { SSRRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssrRenderingPipeline';
import '@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent';
import '@babylonjs/core/Rendering/prePassRendererSceneComponent';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { Scene } from '@babylonjs/core/scene';
import type { Grade } from '../render-data/grade';
import type { Lighting } from '../render-data/lighting';
import { msaaSamplesFor, pixelRatioFor, type QualitySettings, type ShadowQuality, type SsrQuality } from '../render-data/quality';
import { createAmbientOcclusion } from './ambient-occlusion';
import { AerialPerspective, DistanceBlur, type AerialState } from './atmosphere-pass';
import { LensDrops } from './lens-drops';
import { applyGrade, createPostProcessing, enableMsaa, type ToneMapping } from './post-processing';
import { SunRays } from './sun-rays';
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

/** Hystérésis des reflets à l'écran : allumés au-dessus de ON, éteints sous OFF (pas de bascule à chaque image). */
const SSR_ON_WETNESS = 0.08;
const SSR_OFF_WETNESS = 0.03;

export class RenderPipeline {
  private quality: QualitySettings | undefined;
  private ao: SSAO2RenderingPipeline | undefined;
  private ssr: SSRRenderingPipeline | undefined;
  private ssrActive = true;
  private aerial: AerialPerspective | undefined;
  private dof: DistanceBlur | undefined;
  private rays: SunRays | undefined;
  private motion: MotionBlurPostProcess | undefined;
  private grading: DefaultRenderingPipeline | undefined;
  private lens: LensDrops | undefined;
  private shadowGenerator: SunShadows | undefined;
  private readonly casters = new Set<AbstractMesh>();
  private msaa = 1;

  constructor(
    private readonly scene: Scene,
    private readonly camera: Camera,
    private readonly sun: DirectionalLight,
    private readonly options: RenderPipelineOptions,
  ) {}

  /** Profil en cours (undefined avant le premier apply). */
  get current(): QualitySettings | undefined {
    return this.quality;
  }

  /** Échantillons MSAA réellement obtenus (plafonnés par la carte graphique). */
  get msaaSamples(): number {
    return this.msaa;
  }

  get shadows(): SunShadows | undefined {
    return this.shadowGenerator;
  }

  /** Un objet qui projette une ombre (retenu : un générateur refait par un changement de profil le reçoit aussi). */
  addShadowCaster(mesh: AbstractMesh): void {
    this.casters.add(mesh);
    this.shadowGenerator?.addCaster(mesh);
    mesh.onDisposeObservable.addOnce(() => this.casters.delete(mesh));
  }

  /** Applique un profil : reconstruit la chaîne d'effets, les ombres si besoin, la densité de pixels et le MSAA. */
  apply(q: QualitySettings): void {
    const engine = this.scene.getEngine();
    engine.setHardwareScalingLevel(1 / pixelRatioFor(this.options.devicePixelRatio(), q.image.maxPixelRatio));
    if (!sameShadows(this.quality?.shadows ?? null, q.shadows) || this.quality === undefined) this.rebuildShadows(q.shadows);
    this.disposePostProcesses();
    const camera = this.camera;
    if (q.ao) this.ao = createAmbientOcclusion(this.scene, camera, q.ao);
    if (q.ssr) this.ssr = this.createSsr(q.ssr);
    this.ssrActive = true;
    this.options.setAerialPerspective(q.post.aerialPerspective);
    if (q.post.aerialPerspective) this.aerial = new AerialPerspective(this.scene, camera);
    if (q.post.dof) this.dof = new DistanceBlur(this.scene, camera, q.post.dof);
    if (q.rays) this.rays = new SunRays(this.scene, camera, q.rays, this.options.isRayOccluder);
    if (q.post.motionBlur > 0) this.motion = this.createMotionBlur(q.post.motionBlur);
    if (this.options.grading) this.grading = createPostProcessing(this.scene, camera, { toneMapping: this.options.toneMapping, post: q.post, fxaa: q.image.fxaa });
    if (this.options.lensDrops) this.lens = new LensDrops(this.scene, camera, this.grading);
    this.msaa = enableMsaa(
      { prePassRenderer: this.scene.prePassRenderer, pipeline: this.grading },
      msaaSamplesFor(q.image.msaa, engine.getCaps().maxMSAASamples ?? 1),
    );
    this.quality = q;
  }

  /** À chaque image : ombres, rayons, étalonnage, air, reflets du mouillé, gouttes. */
  update(frame: RenderFrame): void {
    this.shadowGenerator?.update(frame.light);
    this.rays?.update(frame.light);
    if (this.grading) applyGrade(this.grading, frame.grade);
    this.aerial?.update(frame.aerial);
    this.lens?.update(frame.lensWetness, frame.timeS);
    if (this.ssr) {
      const wanted = this.ssrActive ? frame.wetness > SSR_OFF_WETNESS : frame.wetness > SSR_ON_WETNESS;
      if (wanted !== this.ssrActive) this.setSsrActive(wanted);
    }
  }

  dispose(): void {
    this.disposePostProcesses();
    this.shadowGenerator?.dispose();
    this.shadowGenerator = undefined;
  }

  private rebuildShadows(quality: ShadowQuality | null): void {
    this.shadowGenerator?.dispose();
    this.shadowGenerator = quality ? new SunShadows(this.sun, this.camera, quality) : undefined;
    if (this.shadowGenerator) for (const mesh of this.casters) this.shadowGenerator.addCaster(mesh);
  }

  /**
   * Reflets à l'écran : sur une image HDR linéaire (avant le développement), atténués au bord de l'écran et selon la rugosité.
   * Un rayon qui ne trouve rien n'ajoute rien : le reflet du ciel, lui, vient déjà des matériaux (éclairage d'environnement).
   */
  private createSsr(q: SsrQuality): SSRRenderingPipeline {
    const ssr = new SSRRenderingPipeline('reflets', this.scene, [this.camera], false, Constants.TEXTURETYPE_HALF_FLOAT);
    ssr.inputTextureColorIsInGammaSpace = false;
    ssr.generateOutputInGammaSpace = false;
    ssr.ssrDownsample = q.ratio >= 1 ? 0 : 1;
    ssr.maxSteps = q.steps;
    ssr.maxDistance = q.maxDistanceM;
    ssr.step = Math.max(0.2, q.maxDistanceM / q.steps / 4);
    ssr.thickness = 0.4;
    ssr.strength = 0.9;
    ssr.reflectionSpecularFalloffExponent = 1.6;
    ssr.roughnessFactor = 0.25;
    ssr.reflectivityThreshold = 0.02;
    ssr.selfCollisionNumSkip = 2;
    ssr.attenuateScreenBorders = true;
    ssr.attenuateIntersectionDistance = true;
    ssr.attenuateFacingCamera = true;
    ssr.attenuateBackfaceReflection = true;
    ssr.useFresnel = true;
    ssr.blurDispersionStrength = q.blur ? 0.03 : 0;
    ssr.blurDownsample = q.blur ? 1 : 0;
    ssr.enableSmoothReflections = q.blur;
    return ssr;
  }

  /** Allume ou éteint les passes des reflets SANS les détacher (elles gardent leur place dans la chaîne). */
  private setSsrActive(active: boolean): void {
    const ssr = this.ssr;
    if (!ssr) return;
    const manager = this.scene.postProcessRenderPipelineManager;
    for (const effect of [ssr.SSRRenderEffect, ssr.SSRBlurRenderEffect, ssr.SSRCombineRenderEffect]) {
      if (active) manager.enableEffectInPipeline(ssr.name, effect, this.camera);
      else manager.disableEffectInPipeline(ssr.name, effect, this.camera);
    }
    this.ssrActive = active;
  }

  /** Flou de mouvement de la caméra seule (pas par objet) : discret, au tournant rapide de la caméra. */
  private createMotionBlur(strength: number): MotionBlurPostProcess {
    const motion = new MotionBlurPostProcess('flou-de-mouvement', this.scene, 1, this.camera, undefined, undefined, false, Constants.TEXTURETYPE_HALF_FLOAT);
    motion.isObjectBased = false;
    motion.motionStrength = strength;
    motion.motionBlurSamples = 12;
    return motion;
  }

  private disposePostProcesses(): void {
    const camera = this.camera;
    this.lens?.dispose();
    this.grading?.dispose();
    this.motion?.dispose(camera);
    this.rays?.dispose();
    this.dof?.dispose();
    this.aerial?.dispose();
    this.ssr?.dispose();
    this.ao?.dispose(true);
    this.lens = this.grading = this.motion = this.rays = this.dof = this.aerial = this.ssr = this.ao = undefined;
    // Les cases vides (null) laissées dans la liste des passes de la caméra par les détachements sont retirées.
    const list = (camera as unknown as { _postProcesses: unknown[] })._postProcesses;
    for (let i = list.length - 1; i >= 0; i--) if (list[i] === null || list[i] === undefined) list.splice(i, 1);
    // Plus aucun effet n'a besoin de la pré-passe : elle est retirée (LOW n'en paie pas le coût) ; les nouveaux la rallument.
    if (this.scene.prePassRenderer) this.scene.disablePrePassRenderer();
  }
}

function sameShadows(a: ShadowQuality | null, b: ShadowQuality | null): boolean {
  if (a === null || b === null) return a === b;
  return a.cascades === b.cascades && a.mapSize === b.mapSize && a.rangeM === b.rangeM && a.filter === b.filter;
}
