import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DAY_LENGTH_S, NIGHT_LENGTH_S } from '../../core/config/balance';
import { timeOfDay } from '../../core/survival/time-of-day';
import { lightingFor } from '../render-data/lighting';
import { FIREFLIES } from '../render-data/night-magic';
import { fireflySprite, glowingMaterials, NightMagicRenderer } from './night-magic-renderer';

const at = (fraction: number) => lightingFor(timeOfDay(fraction * (DAY_LENGTH_S + NIGHT_LENGTH_S)));

describe('NightMagicRenderer (lucioles et champignons luisants, vrai moteur sans carte graphique)', () => {
  let engine: NullEngine, scene: Scene;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('seuls les champignons luisent (pas les roches, pas le feuillage)', () => {
    const mushrooms = new PBRMaterial('Mushrooms', scene);
    const found = glowingMaterials([mushrooms, new PBRMaterial('Rocks', scene), new StandardMaterial('Mushroom_leaves', scene)]);
    expect(found).toEqual([mushrooms]);
  });

  it('de jour : ni lucioles ni lueur ; la nuit : lucioles autour du joueur et champignons cyan', () => {
    const mushrooms = new PBRMaterial('Mushrooms', scene);
    mushrooms.albedoTexture = new Texture(null, scene);
    const night = new NightMagicRenderer(scene, [mushrooms]);
    const fireflies = scene.particleSystems.find((p) => p.name === 'lucioles')!;
    expect(mushrooms.emissiveTexture).toBe(mushrooms.albedoTexture);

    night.update(at(0.3), 10, 2, -5);
    expect(fireflies.emitRate).toBe(0);
    expect(mushrooms.emissiveColor.asArray()).toEqual([0, 0, 0]);

    night.update(at(0.85), 10, 2, -5);
    expect(fireflies.emitRate).toBeGreaterThan(0);
    expect(fireflies.getCapacity()).toBe(FIREFLIES.count);
    expect((fireflies.emitter as { x: number; y: number; z: number })).toMatchObject({ x: 10, y: 2, z: -5 });
    expect(mushrooms.emissiveColor.b).toBeGreaterThan(mushrooms.emissiveColor.r);
  });

  it('image de luciole : cœur opaque, bord transparent', () => {
    const size = 16, sprite = fireflySprite(size);
    const alpha = (x: number, y: number) => sprite[(y * size + x) * 4 + 3]!;
    expect(alpha(8, 8)).toBeGreaterThan(200);
    expect(alpha(0, 0)).toBe(0);
  });
});
