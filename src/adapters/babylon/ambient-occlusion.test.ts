import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { qualityFor } from '../render-data/quality';
import { AO_FAR_M, configureAo, createAmbientOcclusion, type AoSettings } from './ambient-occlusion';

const blank = (): AoSettings => ({ radius: 2, totalStrength: 1, samples: 8, base: 0, maxZ: 100, minZAspect: 0.2, expensiveBlur: true, bypassBlur: false });

describe('configureAo (occlusion ambiante à l’écran : court rayon, discrète)', () => {
  it('reprend rayon, force et échantillons du niveau de qualité', () => {
    const ao = qualityFor('high').ao!;
    const target = blank();
    configureAo(target, ao);
    expect(target.radius).toBe(ao.radiusM);
    expect(target.totalStrength).toBe(ao.strength);
    expect(target.samples).toBe(ao.samples);
  });

  it('rayon court (contacts seulement), portée limitée, flou conservé (sinon le grain se voit)', () => {
    const target = blank();
    configureAo(target, qualityFor('high').ao!);
    expect(target.radius).toBeLessThanOrEqual(1.5);
    expect(target.maxZ).toBe(AO_FAR_M);
    expect(target.bypassBlur).toBe(false);
  });

  it('discrète : jamais complètement noire, la couleur de base garde une part de lumière', () => {
    const target = blank();
    configureAo(target, qualityFor('medium').ao!);
    expect(target.base).toBeGreaterThan(0);
    expect(target.base).toBeLessThan(0.5);
  });
});

describe('createAmbientOcclusion (moteur sans carte graphique)', () => {
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

  it('un moteur qui ne sait pas faire les rendus multiples (pas de WebGL2) : pas d’occlusion, et pas d’erreur', () => {
    expect(createAmbientOcclusion(scene, camera, qualityFor('high').ao!)).toBeUndefined();
  });
});
