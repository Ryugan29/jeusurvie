import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalMapFor } from '../render-data/normal-maps';
import { toStandard, usesBakedShading, type NormalMapLoader } from './asset-library';
import type { FoliagePlugin, WindState } from './foliage-plugin';

describe('toStandard (matériau glTF → matériau standard, vrai moteur sans carte graphique)', () => {
  let engine: NullEngine, scene: Scene;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  function pbr(mode: number | null, name = 'feuilles'): PBRMaterial {
    const material = new PBRMaterial(name, scene);
    const texture = new BaseTexture(scene);
    texture.hasAlpha = true;
    material.albedoTexture = texture;
    material.transparencyMode = mode;
    material.alphaCutOff = 0.2;
    return material;
  }

  it('feuillage découpé (glTF MASK) : le fond transparent de l’image des feuilles est bien jeté', () => {
    const standard = toStandard(pbr(Material.MATERIAL_ALPHATEST), scene);
    expect(standard.useAlphaFromDiffuseTexture).toBe(true);
    expect(standard.needAlphaTesting()).toBe(true);
    expect(standard.needAlphaBlending()).toBe(false);
    expect(standard.alphaCutOff).toBeCloseTo(0.2, 6);
  });

  it('feuillages et herbes : plus jaune-vert que l’écorce (aperçus du pack), auto-éclairage faible (ils prennent la lumière du sol)', () => {
    const leaves = toStandard(pbr(Material.MATERIAL_ALPHATEST, 'Leaves_NormalTree'), scene);
    const bark = toStandard(pbr(Material.MATERIAL_ALPHATEST, 'Bark_NormalTree'), scene);
    expect(leaves.emissiveColor.g).toBeLessThan(bark.emissiveColor.g); // normales ramenées vers le haut (foliage-plugin) : à peine d’auto-éclairage, sinon vert vif la nuit
    expect(leaves.diffuseColor.g).toBeGreaterThan(bark.diffuseColor.g);
    expect(leaves.diffuseColor.r).toBeGreaterThan(leaves.diffuseColor.b); // chaud : vers le jaune, pas le bleu
    for (const name of ['Grass', 'Flowers', 'Leaf_Pine_C', 'Bush_Leaves']) {
      expect(toStandard(pbr(Material.MATERIAL_ALPHATEST, name), scene).emissiveColor.g).toBeLessThan(bark.emissiveColor.g);
    }
  });

  it('plantes du couvre-sol (trèfles, fougères, plantes, pétales) : même traitement que le feuillage ; champignons, cailloux et écorces morte et vive non', () => {
    const bark = toStandard(pbr(Material.MATERIAL_ALPHATEST, 'Bark_DeadTree'), scene);
    for (const name of ['Clover_1', 'Fern_1', 'Plant_7_Big', 'Petal_2', 'Flowers']) {
      const plant = toStandard(pbr(Material.MATERIAL_ALPHATEST, name), scene);
      expect(plant.emissiveColor.g, name).toBeLessThan(bark.emissiveColor.g);
      expect(plant.diffuseColor.g, name).toBeGreaterThan(plant.diffuseColor.b);
    }
    for (const name of ['Mushrooms', 'PathRocks', 'Bark_DeadTree', 'Bark_NormalTree']) {
      expect(toStandard(pbr(Material.MATERIAL_OPAQUE, name), scene).emissiveColor.g, name).toBeCloseTo(bark.emissiveColor.g, 9);
    }
  });

  it('aucun matériau ne s’éclaire de sa propre image : sinon il garde sa couleur pleine la nuit et une teinte ne l’atteint pas', () => {
    for (const name of ['Grass', 'Leaves', 'Leaves_NormalTree', 'Bark_NormalTree', 'Rocks', 'MI_Hair_2']) {
      const standard = toStandard(pbr(Material.MATERIAL_ALPHATEST, name), scene);
      expect(standard.emissiveTexture, name).toBeNull();
      expect(standard.emissiveColor.g, name).toBeLessThan(0.2);
    }
  });

  it('herbe, plantes, fleurs et feuillages : le plugin végétal (vent, dégradé, teinte) ; écorces, roches, champignons : non', () => {
    for (const name of ['Grass', 'Leaves', 'Flowers', 'Leaves_NormalTree', 'Leaves_Pine', 'Leaves_TwistedTree']) {
      expect(toStandard(pbr(Material.MATERIAL_ALPHATEST, name), scene).pluginManager?.getPlugin('Foliage'), name).toBeTruthy();
    }
    for (const name of ['Bark_NormalTree', 'Rocks', 'PathRocks', 'Mushrooms']) {
      expect(toStandard(pbr(Material.MATERIAL_OPAQUE, name), scene).pluginManager?.getPlugin('Foliage') ?? null, name).toBeNull();
    }
  });

  it('le vent fourni est celui que lit le plugin (un seul vent pour toute la végétation) ; sans vent fourni, rien ne bouge', () => {
    const wind: WindState = { timeS: 2, strength: 1 };
    const values = new Map<string, number[]>();
    const ubo = { updateFloat4: (name: string, ...v: number[]) => values.set(name, v) } as never;
    (toStandard(pbr(Material.MATERIAL_ALPHATEST, 'Grass'), scene, undefined, wind).pluginManager!.getPlugin('Foliage') as FoliagePlugin).bindForSubMesh(ubo);
    expect(values.get('foliageWind')![0]).toBe(2);
    expect(values.get('foliageParams')![1]).toBeGreaterThan(0);
    (toStandard(pbr(Material.MATERIAL_ALPHATEST, 'Grass'), scene).pluginManager!.getPlugin('Foliage') as FoliagePlugin).bindForSubMesh(ubo);
    expect(values.get('foliageParams')![1]).toBe(0);
  });

  it('écorce opaque : la transparence de l’image est ignorée', () => {
    const standard = toStandard(pbr(Material.MATERIAL_OPAQUE), scene);
    expect(standard.useAlphaFromDiffuseTexture).toBe(false);
    expect(standard.needAlphaTesting()).toBe(false);
  });
});

describe('toStandard : relief des écorces et des roches (cartes de relief, jamais sur le feuillage)', () => {
  let engine: NullEngine, scene: Scene;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  const pbr = (name: string, mode: number | null = Material.MATERIAL_OPAQUE): PBRMaterial => {
    const material = new PBRMaterial(name, scene);
    material.albedoTexture = new BaseTexture(scene);
    material.transparencyMode = mode;
    return material;
  };

  it('écorce et roche : la carte de relief du fournisseur devient la bumpTexture, à la force prévue, sens des cartes glTF', () => {
    const requested: string[] = [];
    const load: NormalMapLoader = (map) => {
      requested.push(map.file);
      return new BaseTexture(scene);
    };
    const bark = toStandard(pbr('Bark_NormalTree', Material.MATERIAL_ALPHATEST), scene, load);
    const rock = toStandard(pbr('Rocks'), scene, load);
    expect(bark.bumpTexture).not.toBeNull();
    expect(rock.bumpTexture).not.toBeNull();
    expect(requested).toEqual(['Bark_NormalTree_Normal.png', 'Rocks_Normal.png']);
    expect(rock.bumpTexture!.level).toBeCloseTo(normalMapFor('Rocks')!.level, 6);
    // Scène en repère main gauche (Babylon) : les cartes glTF (Y vers le haut) veulent X inversé, comme le chargeur le fait pour le PBR.
    expect(bark.invertNormalMapX).toBe(true);
    expect(bark.invertNormalMapY).toBe(false);
  });

  it('feuillage, herbe, fleurs, champignons : aucun relief, même si le fournisseur en a un', () => {
    const load: NormalMapLoader = () => new BaseTexture(scene);
    for (const name of ['Leaves_NormalTree', 'Leaf_Pine', 'Grass', 'Flowers', 'Mushrooms']) {
      expect(toStandard(pbr(name, Material.MATERIAL_ALPHATEST), scene, load).bumpTexture, name).toBeNull();
    }
  });

  it('sans fournisseur : pas de relief ; matériau inconnu : pas de relief', () => {
    expect(toStandard(pbr('Bark_NormalTree'), scene).bumpTexture).toBeNull();
    expect(toStandard(pbr('Inconnu'), scene, () => new BaseTexture(scene)).bumpTexture).toBeNull();
  });

  it('la carte de relief déjà portée par le glTF (normalTexture) est reprise telle quelle, sauf sur le feuillage', () => {
    const own = new BaseTexture(scene);
    const withMap = pbr('Inconnu');
    withMap.bumpTexture = own;
    withMap.invertNormalMapX = true;
    const leaves = pbr('Leaves_NormalTree', Material.MATERIAL_ALPHATEST);
    leaves.bumpTexture = own;
    expect(toStandard(withMap, scene).bumpTexture).toBe(own);
    expect(toStandard(withMap, scene).invertNormalMapX).toBe(true);
    expect(toStandard(leaves, scene).bumpTexture).toBeNull();
  });
});

describe('usesBakedShading (ombrage cuit dans les sommets : gardé pour les arbres, pas pour les petites plantes)', () => {
  it('herbe et petites plantes (matériaux « Grass » et « Leaves » du pack) : sans, le dégradé de leur texture suffit', () => {
    expect(usesBakedShading('Grass')).toBe(false);
    expect(usesBakedShading('Leaves')).toBe(false);
  });

  it('arbres, buissons, fleurs, roches, champignons : avec', () => {
    for (const name of ['Leaves_NormalTree', 'Leaves_TwistedTree', 'Leaf_Pine', 'Bark_NormalTree', 'Bark_DeadTree', 'Flowers', 'Rocks', 'PathRocks', 'Mushrooms']) {
      expect(usesBakedShading(name), name).toBe(true);
    }
  });
});
