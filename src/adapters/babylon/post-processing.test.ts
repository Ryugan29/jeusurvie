import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DAY_LENGTH_S, NIGHT_LENGTH_S } from '../../core/config/balance';
import { timeOfDay } from '../../core/survival/time-of-day';
import { WEATHER_PRESETS } from '../../core/world/weather';
import { atmosphereFor } from '../render-data/atmosphere';
import { DAY_GRADE } from '../render-data/grade';
import { lightingFor, luminance } from '../render-data/lighting';
import { SKY_SUN_DISC_HDR } from './sky-dome';
import { applyGrade, COLOR_GRADE, createPostProcessing, enableMsaa, parseToneMapping } from './post-processing';

describe('createPostProcessing (effets d’image, vrai moteur sans carte graphique)', () => {
  let engine: NullEngine, scene: Scene, camera: FreeCamera;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    camera = new FreeCamera('camera', new Vector3(0, 1, 0), scene);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('image « de cinéma » : rendu HDR développé par le tone mapping ACES (les zones très claires s’adoucissent au lieu de brûler)', () => {
    engine.getCaps().textureHalfFloatRender = true; // une vraie carte graphique sait rendre en demi-flottants ; le moteur de test non
    const pipeline = createPostProcessing(scene, camera);
    expect((pipeline as unknown as { _hdr: boolean })._hdr).toBe(true);
    expect(pipeline.imageProcessing!.toneMappingType).toBe(ImageProcessingConfiguration.TONEMAPPING_ACES);
  });

  it('tone mapping au choix pour comparer (?tonemap=standard|neutre) : standard et neutre KHR restent disponibles', () => {
    expect(createPostProcessing(scene, camera, { toneMapping: 'standard' }).imageProcessing!.toneMappingType).toBe(
      ImageProcessingConfiguration.TONEMAPPING_STANDARD,
    );
    expect(createPostProcessing(scene, camera, { toneMapping: 'neutre' }).imageProcessing!.toneMappingType).toBe(
      ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL,
    );
    expect(parseToneMapping('standard')).toBe('standard');
    expect(parseToneMapping('neutre')).toBe('neutre');
    expect(parseToneMapping(null)).toBe('aces');
    expect(parseToneMapping('n’importe quoi')).toBe('aces');
  });

  it('grain de film léger et animé (texture d’image, pas de bruit qui grouille)', () => {
    const pipeline = createPostProcessing(scene, camera);
    expect(pipeline.grainEnabled).toBe(true);
    expect(pipeline.grain.animated).toBe(true);
    expect(pipeline.grain.intensity).toBeCloseTo(COLOR_GRADE.grain, 6);
    expect(COLOR_GRADE.grain).toBeGreaterThan(0);
    expect(COLOR_GRADE.grain).toBeLessThanOrEqual(10);
  });

  it('halo HDR : le disque du soleil rayonne, pas une pente enneigée face au soleil de midi', () => {
    const noon = atmosphereFor(lightingFor(timeOfDay(0.3 * (DAY_LENGTH_S + NIGHT_LENGTH_S))), { ...WEATHER_PRESETS.clair, wetness: 0 }, 0).light;
    const snowAlbedo = 0.95;
    const brightest = snowAlbedo * (noon.sunIntensity * Math.max(...noon.sunColor) + noon.ambientIntensity * Math.max(...noon.ambientColor));
    expect(brightest).toBeLessThan(COLOR_GRADE.bloomThreshold);
    expect(SKY_SUN_DISC_HDR * luminance(noon.sunColor)).toBeGreaterThan(COLOR_GRADE.bloomThreshold * 2);
  });

  it('développement réaliste : tone mapping, contraste léger, saturation de pellicule (ADR 0012)', () => {
    const pipeline = createPostProcessing(scene, camera);
    const ip = pipeline.imageProcessing!;
    expect(pipeline.imageProcessingEnabled).toBe(true);
    expect(ip.toneMappingEnabled).toBe(true);
    expect(ip.contrast).toBeCloseTo(COLOR_GRADE.contrast, 6);
    expect(ip.exposure).toBeCloseTo(COLOR_GRADE.exposure, 6);
    expect(ip.colorCurvesEnabled).toBe(true);
    expect(ip.colorCurves!.globalSaturation).toBeCloseTo(COLOR_GRADE.saturation, 6);
    expect(COLOR_GRADE.saturation).toBeGreaterThanOrEqual(0);
    expect(COLOR_GRADE.saturation).toBeLessThanOrEqual(12); // une pellicule, pas une illustration (+20 avant l'ADR 0012)
    expect(COLOR_GRADE.contrast).toBeGreaterThanOrEqual(1);
    expect(COLOR_GRADE.vignetteWeight).toBeLessThan(1); // vignettage d'objectif, pas un cadre d'illustration
  });

  it('effets du profil graphique : halo, FXAA, netteté et grain suivent le profil ; 0 les coupe', () => {
    const off = createPostProcessing(scene, camera, { post: { bloomKernel: 0, grain: 0, sharpen: 0 }, fxaa: false });
    expect(off.bloomEnabled).toBe(false);
    expect(off.grainEnabled).toBe(false);
    expect(off.sharpenEnabled).toBe(false);
    expect(off.fxaaEnabled).toBe(false);
    const on = createPostProcessing(scene, camera, { post: { bloomKernel: 96, grain: 5, sharpen: 0.12 }, fxaa: true });
    expect(on.bloomEnabled).toBe(true);
    expect(on.bloomKernel).toBe(96);
    expect(on.grain.intensity).toBe(5);
    expect(on.sharpen.edgeAmount).toBeCloseTo(0.12, 6);
    expect(on.fxaaEnabled).toBe(true);
  });

  it('saturation et contraste modérés, alignés sur l’étalonnage de jour', () => {
    expect(COLOR_GRADE.saturation).toBeLessThanOrEqual(20);
    expect(COLOR_GRADE.contrast).toBeLessThanOrEqual(1.15);
    expect(COLOR_GRADE.exposure).toBe(DAY_GRADE.exposure);
    expect(COLOR_GRADE.saturation).toBe(DAY_GRADE.saturation);
  });

  it('enableMsaa : le rendu multiple (occlusion ambiante) reçoit le MSAA, sinon la première image du pipeline', () => {
    const prePass = { samples: 1 }, pipeline = { samples: 1 };
    expect(enableMsaa({ prePassRenderer: prePass, pipeline }, 4)).toBe(4);
    expect(prePass.samples).toBe(4);
    expect(pipeline.samples).toBe(1); // l'image du pipeline reçoit déjà une scène lissée : pas de second MSAA coûteux
    expect(enableMsaa({ prePassRenderer: null, pipeline }, 4)).toBe(4);
    expect(pipeline.samples).toBe(4);
    expect(enableMsaa({ pipeline }, 0)).toBe(1); // jamais moins d'un échantillon
  });

  it('netteté légère : un renforcement fort durcit le crénelage des brins', () => {
    expect(COLOR_GRADE.sharpen).toBeLessThanOrEqual(0.15);
  });

  it('applyGrade : exposition, saturation et teinte de l’heure appliquées au pipeline', () => {
    const pipeline = createPostProcessing(scene, camera);
    applyGrade(pipeline, { exposure: 0.9, saturation: -30, tint: 20, hue: 30 });
    const ip = pipeline.imageProcessing!;
    expect(ip.exposure).toBeCloseTo(0.9, 6);
    expect(ip.colorCurves!.globalSaturation).toBeCloseTo(-30, 6);
    expect(ip.colorCurves!.globalDensity).toBeCloseTo(20, 6);
    expect(ip.colorCurves!.globalHue).toBeCloseTo(30, 6);
  });

  it('léger halo sur les zones claires et bords lissés', () => {
    const pipeline = createPostProcessing(scene, camera);
    expect(pipeline.bloomEnabled).toBe(true);
    expect(pipeline.bloomThreshold).toBeCloseTo(COLOR_GRADE.bloomThreshold, 6);
    expect(pipeline.bloomWeight).toBeCloseTo(COLOR_GRADE.bloomWeight, 6);
    expect(pipeline.fxaaEnabled).toBe(true);
  });

  it('cadre « peint » : vignette légère (coins un peu plus sombres, jamais noirs)', () => {
    const ip = createPostProcessing(scene, camera).imageProcessing!;
    expect(ip.vignetteEnabled).toBe(true);
    expect(ip.vignetteWeight).toBeCloseTo(COLOR_GRADE.vignetteWeight, 6);
    expect(COLOR_GRADE.vignetteWeight).toBeGreaterThan(0);
    expect(COLOR_GRADE.vignetteWeight).toBeLessThanOrEqual(2);
    expect([ip.vignetteColor.r, ip.vignetteColor.g, ip.vignetteColor.b]).toEqual([0, 0, 0]);
  });

  it('matière nette : léger renforcement des détails (textures peintes du sol et des modèles)', () => {
    const pipeline = createPostProcessing(scene, camera);
    expect(pipeline.sharpenEnabled).toBe(true);
    expect(pipeline.sharpen.edgeAmount).toBeCloseTo(COLOR_GRADE.sharpen, 6);
    expect(COLOR_GRADE.sharpen).toBeGreaterThan(0);
    expect(COLOR_GRADE.sharpen).toBeLessThanOrEqual(0.4);
  });
});
