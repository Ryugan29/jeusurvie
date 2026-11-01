import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { InternalTexture, InternalTextureSource } from '@babylonjs/core/Materials/Textures/internalTexture';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DAY_LENGTH_S, NIGHT_LENGTH_S } from '../../core/config/balance';
import { timeOfDay } from '../../core/survival/time-of-day';
import { lightingFor, shadowStrength, type Lighting } from '../render-data/lighting';
import { SunShadows } from './sun-shadows';

const CYCLE_S = DAY_LENGTH_S + NIGHT_LENGTH_S;
const at = (fraction: number): Lighting => lightingFor(timeOfDay(fraction * CYCLE_S));
const OPTIONS = { cascades: 3, mapSize: 1024, rangeM: 90, filter: 'pcf-medium' } as const;

describe('SunShadows (ombres en cascade du soleil, vrai moteur sans carte graphique)', () => {
  let engine: NullEngine, scene: Scene, camera: FreeCamera, sun: DirectionalLight;
  beforeEach(() => {
    engine = new NullEngine();
    // Le moteur sans carte graphique se déclare incapable de cascades et n'a pas de contexte WebGL pour la texture de profondeur :
    // on lui prête ces capacités (un vrai navigateur WebGL2 les a : cascades, comparateurs d'ombre, texture de profondeur).
    engine._features.supportCSM = true;
    engine._features.supportShadowSamplers = true;
    engine._createDepthStencilTexture = () => new InternalTexture(engine, InternalTextureSource.DepthStencil);
    scene = new Scene(engine);
    camera = new FreeCamera('camera', new Vector3(0, 2, -5), scene);
    camera.maxZ = 1500;
    sun = new DirectionalLight('soleil', new Vector3(0, -1, 0), scene);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('cascades : le nombre et la taille de carte demandés, jusqu’à la distance demandée (jamais au-delà de la vue)', () => {
    const shadows = new SunShadows(sun, camera, OPTIONS);
    expect(shadows.generator.numCascades).toBe(3);
    expect(shadows.generator.getShadowMap()!.getSize().width).toBe(1024);
    expect(shadows.generator.shadowMaxZ).toBe(90);
    const far = new SunShadows(new DirectionalLight('autre', new Vector3(0, -1, 0), scene), camera, { ...OPTIONS, rangeM: 5000 });
    expect(far.generator.shadowMaxZ).toBe(camera.maxZ);
  });

  it('bords doux et sans scintillement : filtrage PCF, cascades stabilisées', () => {
    const { generator } = new SunShadows(sun, camera, OPTIONS);
    expect(generator.usePercentageCloserFiltering).toBe(true);
    expect(generator.filteringQuality).toBeGreaterThanOrEqual(ShadowGenerator.QUALITY_MEDIUM);
    expect(generator.stabilizeCascades).toBe(true);
  });

  it('filtrage selon le profil : PCF de plus en plus large, puis pénombre réaliste (PCSS) en ULTRA', () => {
    const low = new SunShadows(sun, camera, { ...OPTIONS, filter: 'pcf-low' }).generator;
    expect(low.usePercentageCloserFiltering).toBe(true);
    expect(low.filteringQuality).toBe(ShadowGenerator.QUALITY_LOW);
    const high = new SunShadows(new DirectionalLight('b', new Vector3(0, -1, 0), scene), camera, { ...OPTIONS, filter: 'pcf-high' }).generator;
    expect(high.filteringQuality).toBe(ShadowGenerator.QUALITY_HIGH);
    const pcss = new SunShadows(new DirectionalLight('c', new Vector3(0, -1, 0), scene), camera, { ...OPTIONS, filter: 'pcss' }).generator;
    expect(pcss.useContactHardeningShadow).toBe(true);
    expect(pcss.contactHardeningLightSizeUVRatio).toBeGreaterThan(0);
    expect(pcss.contactHardeningLightSizeUVRatio).toBeLessThan(0.1); // un soleil net, pas une lampe diffuse
  });

  it('PCSS en 16 échantillons : avec une pénombre aussi fine, 64 coûtaient ~15 ms de plus pour une image identique', () => {
    const pcss = new SunShadows(sun, camera, { ...OPTIONS, filter: 'pcss' }).generator;
    expect(pcss.filteringQuality).toBe(ShadowGenerator.QUALITY_LOW);
  });

  it('addCaster : le maillage projette une ombre, une seule fois même si on l’ajoute deux fois', () => {
    const shadows = new SunShadows(sun, camera, OPTIONS);
    const tree = CreateBox('arbre', {}, scene);
    shadows.addCaster(tree);
    shadows.addCaster(tree);
    expect(shadows.generator.getShadowMap()!.renderList!.filter((m) => m === tree)).toHaveLength(1);
  });

  it('addReceiver : le maillage reçoit les ombres', () => {
    const shadows = new SunShadows(sun, camera, OPTIONS);
    const ground = CreateBox('sol', {}, scene);
    expect(ground.receiveShadows).toBe(false);
    shadows.addReceiver(ground);
    expect(ground.receiveShadows).toBe(true);
  });

  it('update : la force de l’ombre suit le soleil (marquée le jour, nulle quand il est couché)', () => {
    const shadows = new SunShadows(sun, camera, OPTIONS);
    shadows.update(at(0.3));
    expect(shadows.generator.getDarkness()).toBeCloseTo(1 - shadowStrength(at(0.3)), 9);
    expect(shadows.generator.getDarkness()).toBeLessThan(0.5);
    shadows.update(at(0));
    expect(shadows.generator.getDarkness()).toBe(1);
  });
});
