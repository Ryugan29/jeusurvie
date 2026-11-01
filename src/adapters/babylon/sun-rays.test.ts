import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DAY_LENGTH_S, NIGHT_LENGTH_S } from '../../core/config/balance';
import { timeOfDay } from '../../core/survival/time-of-day';
import { lightingFor, type Lighting } from '../render-data/lighting';
import { qualityFor } from '../render-data/quality';
import { SunRays } from './sun-rays';

const CYCLE_S = DAY_LENGTH_S + NIGHT_LENGTH_S;
const at = (fraction: number): Lighting => lightingFor(timeOfDay(fraction * CYCLE_S));
const RAYS = qualityFor('haute').rays!;

describe('SunRays (rayons de soleil à l’écran, vrai moteur sans carte graphique)', () => {
  let engine: NullEngine, scene: Scene, camera: FreeCamera;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    camera = new FreeCamera('camera', new Vector3(0, 2, 0), scene);
    camera.maxZ = 1500;
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  /** Tourne la caméra pour regarder vers (ou à l'opposé de) l'astre de l'ambiance donnée. */
  function lookAtSun(l: Lighting, away = false): void {
    const s = away ? -1 : 1;
    camera.setTarget(new Vector3(-l.sunDirection.x * s, 2 - l.sunDirection.y * s, -l.sunDirection.z * s));
  }

  it('ajoute un post-traitement à la caméra', () => {
    new SunRays(scene, camera, RAYS, () => true);
    expect(scene.postProcesses.some((p) => p.name === 'rayons')).toBe(true);
  });

  it('seuls les obstacles désignés entrent dans la carte de profondeur (pas le ciel, pas l’herbe)', () => {
    const tree = CreateBox('arbre', {}, scene);
    const sky = CreateBox('ciel', {}, scene);
    const rays = new SunRays(scene, camera, RAYS, (mesh) => mesh !== sky);
    const accepts = rays.depthMap.renderListPredicate;
    expect(accepts(tree)).toBe(true);
    expect(accepts(sky)).toBe(false);
  });

  it('un obstacle au-delà de la portée ne cache plus le soleil (le terrain lointain n’entre pas dans la carte de profondeur)', () => {
    const near = CreateBox('proche', { size: 2 }, scene);
    near.position.set(10, 2, 30);
    const far = CreateBox('lointain', { size: 2 }, scene);
    far.position.set(10, 2, 900);
    const big = CreateBox('grand-lointain', { size: 600 }, scene); // son bord approche : il compte
    big.position.set(0, 2, 700);
    const rays = new SunRays(scene, camera, RAYS, () => true);
    const accepts = rays.depthMap.renderListPredicate;
    expect(accepts(near)).toBe(true);
    expect(accepts(far)).toBe(false);
    expect(accepts(big)).toBe(true);
  });

  it('face au soleil du matin : rayons visibles ; dos au soleil : aucun', () => {
    const rays = new SunRays(scene, camera, RAYS, () => true);
    const morning = at(0.08);
    lookAtSun(morning);
    rays.update(morning);
    expect(rays.intensity).toBeGreaterThan(0.2);
    lookAtSun(morning, true);
    rays.update(morning);
    expect(rays.intensity).toBe(0);
  });

  it('la carte de profondeur n’est dessinée que quand les rayons se voient (dos au soleil, de nuit : aucun coût)', () => {
    const rays = new SunRays(scene, camera, RAYS, () => true);
    const morning = at(0.08);
    lookAtSun(morning);
    rays.update(morning);
    expect(rays.depthPassActive).toBe(true);
    lookAtSun(morning, true);
    rays.update(morning);
    expect(rays.depthPassActive).toBe(false);
    const night = at(0.85);
    lookAtSun(night);
    rays.update(night);
    expect(rays.depthPassActive).toBe(false);
  });

  it('la nuit (lune) : aucun rayon, même en regardant la lune', () => {
    const rays = new SunRays(scene, camera, RAYS, () => true);
    const night = at(0.85);
    lookAtSun(night);
    rays.update(night);
    expect(rays.intensity).toBe(0);
  });

  it('discrets : jamais au-delà de 0,8 de force', () => {
    const rays = new SunRays(scene, camera, RAYS, () => true);
    for (const f of [0.08, 0.3, 0.55, 0.66]) {
      const l = at(f);
      lookAtSun(l);
      rays.update(l);
      expect(rays.intensity).toBeLessThanOrEqual(0.8);
    }
  });
});
