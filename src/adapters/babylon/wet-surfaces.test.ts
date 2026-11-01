import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { surfaceFor, wetSurface } from '../render-data/surfaces';
import { WetSurfaces } from './wet-surfaces';

describe('WetSurfaces (roches, écorces, personnages luisants sous la pluie, vrai moteur sans carte graphique)', () => {
  let engine: NullEngine, scene: Scene;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('mouillées : rugosité, reflets et teinte de la surface mouillée ; sèches : retour exact aux valeurs d’origine', () => {
    const rock = new PBRMaterial('Rocks', scene);
    rock.roughness = surfaceFor('Rocks').roughness;
    rock.environmentIntensity = surfaceFor('Rocks').environmentIntensity;
    rock.albedoColor = new Color3(0.9, 0.8, 0.7);
    const wet = new WetSurfaces(scene);
    wet.apply(1);
    const expected = wetSurface(surfaceFor('Rocks'), 1);
    expect(rock.roughness).toBeCloseTo(expected.roughness, 6);
    expect(rock.environmentIntensity).toBeCloseTo(expected.environmentIntensity, 6);
    expect(rock.albedoColor.r).toBeCloseTo(0.9 * expected.darken, 6);
    wet.apply(0);
    expect(rock.roughness).toBeCloseTo(surfaceFor('Rocks').roughness, 6);
    expect(rock.environmentIntensity).toBeCloseTo(surfaceFor('Rocks').environmentIntensity, 6);
    expect(rock.albedoColor.g).toBeCloseTo(0.8, 6);
  });

  it('détrempées : plus lisses et plus sombres, mais sans plus d’éclairage d’environnement qu’à sec (sinon plus clair que le sol)', () => {
    const skin = new PBRMaterial('MI_Superhero_Female', scene);
    skin.roughness = surfaceFor('MI_Superhero_Female').roughness;
    skin.environmentIntensity = surfaceFor('MI_Superhero_Female').environmentIntensity;
    const dryEnvironment = skin.environmentIntensity;
    const wet = new WetSurfaces(scene);
    for (const wetness of [0.3, 0.75, 1]) {
      wet.apply(wetness);
      expect(skin.environmentIntensity, `humidité ${wetness}`).toBeLessThanOrEqual(dryEnvironment);
      expect(skin.roughness, `humidité ${wetness}`).toBeLessThan(surfaceFor('MI_Superhero_Female').roughness);
    }
    expect(skin.albedoColor.r).toBeLessThan(1);
    wet.apply(0);
    expect(skin.environmentIntensity).toBe(dryEnvironment);
  });

  it('un matériau déjà très lisse (yeux) ne devient pas un miroir mouillé, et retrouve exactement sa rugosité au sec', () => {
    const eye = new PBRMaterial('MI_Eyes', scene);
    eye.roughness = surfaceFor('MI_Eyes').roughness;
    const wet = new WetSurfaces(scene);
    wet.apply(1);
    expect(eye.roughness).toBeGreaterThanOrEqual(0.1);
    expect(eye.roughness).toBeLessThanOrEqual(surfaceFor('MI_Eyes').roughness);
    wet.apply(0);
    expect(eye.roughness).toBe(surfaceFor('MI_Eyes').roughness);
  });

  it('prend aussi les matériaux chargés plus tard (personnages), jamais les matériaux standard (sol, végétation)', () => {
    const wet = new WetSurfaces(scene);
    wet.apply(1);
    const late = new PBRMaterial('Superhero_Skin', scene);
    late.roughness = 0.55;
    const ground = new StandardMaterial('terrain', scene);
    ground.diffuseColor = new Color3(1, 1, 1);
    wet.apply(1);
    expect(late.roughness).toBeLessThan(0.55);
    expect(ground.diffuseColor.r).toBe(1);
  });

  it('suit les matériaux ajoutés et retirés, même quand l’un remplace l’autre entre deux images', () => {
    const old = new PBRMaterial('Rocks', scene);
    old.roughness = 0.82;
    const wet = new WetSurfaces(scene);
    wet.apply(0);
    expect(wet.tracked).toBe(1);
    old.dispose();
    const replacement = new PBRMaterial('Bark', scene);
    replacement.roughness = 0.9;
    wet.apply(1);
    expect(wet.tracked).toBe(1);
    expect(replacement.roughness).toBeLessThan(0.9);
    wet.dispose();
    new PBRMaterial('Rocks2', scene);
    wet.apply(0.5);
    expect(wet.tracked).toBe(0); // détaché : ne suit plus rien
  });

  it('ne retouche rien quand l’humidité ne change pas (aucun travail par image par temps sec)', () => {
    const rock = new PBRMaterial('Rocks', scene);
    rock.roughness = 0.82;
    const wet = new WetSurfaces(scene);
    wet.apply(0);
    rock.roughness = 0.5; // changement extérieur : pas écrasé tant que l’humidité reste la même
    wet.apply(0);
    expect(rock.roughness).toBe(0.5);
  });
});
