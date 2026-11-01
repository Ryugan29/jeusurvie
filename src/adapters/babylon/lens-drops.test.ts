import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPostProcessing } from './post-processing';
import { LENS_DROPS_FRAGMENT, LensDrops } from './lens-drops';

describe('LensDrops (gouttes sur l’objectif, vrai moteur sans carte graphique)', () => {
  let engine: NullEngine, scene: Scene, camera: FreeCamera;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    camera = new FreeCamera('camera', new Vector3(0, 2, 0), scene);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  const attached = (): boolean => camera._postProcesses.some((p) => p?.name === 'gouttes');

  it('aucun coût par temps sec : la passe d’image n’est accrochée à la caméra que s’il y a des gouttes', () => {
    const drops = new LensDrops(scene, camera);
    expect(attached()).toBe(false);
    drops.update(0.6, 1);
    expect(attached()).toBe(true);
    expect(drops.amount).toBeCloseTo(0.6, 6);
    drops.update(0, 2);
    expect(attached()).toBe(false);
  });

  it('reste la dernière passe (après l’étalonnage HDR), même quand l’étalonnage se reconstruit, et une seule fois', () => {
    const pipeline = createPostProcessing(scene, camera);
    const drops = new LensDrops(scene, camera, pipeline);
    drops.update(1, 0);
    drops.update(0.5, 0.1);
    const last = (): string | undefined => camera._postProcesses.filter((p) => p).at(-1)?.name;
    expect(last()).toBe('gouttes');
    pipeline.bloomEnabled = false; // reconstruit le pipeline : ses passes sont raccrochées à la caméra
    expect(last()).toBe('gouttes');
    expect(camera._postProcesses.filter((p) => p?.name === 'gouttes')).toHaveLength(1);
    drops.dispose();
    expect(camera._postProcesses.some((p) => p?.name === 'gouttes')).toBe(false);
  });

  it('densité bornée à [0, 1]', () => {
    const drops = new LensDrops(scene, camera);
    drops.update(3, 0);
    expect(drops.amount).toBe(1);
    drops.update(Number.NaN, 0);
    expect(drops.amount).toBe(0);
  });

  it('le shader déforme l’image derrière chaque goutte et fait glisser les gouttes (deux tailles de gouttes)', () => {
    expect(LENS_DROPS_FRAGMENT).toContain('textureSampler');
    expect(LENS_DROPS_FRAGMENT).toContain('dropLayer');
    expect(LENS_DROPS_FRAGMENT.match(/dropLayer\(/g)!.length).toBeGreaterThanOrEqual(3); // définition + deux couches
  });
});
