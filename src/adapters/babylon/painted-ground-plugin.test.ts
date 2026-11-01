import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GROUND_LAYERS, LAYER_TILE_M, PAINT_GAIN, type GroundLayer } from '../render-data/painted-ground';
import { PAINTED_GROUND_ATTRIBUTE, PaintedGroundPlugin } from './painted-ground-plugin';

/** Faux tampon d'uniformes : retient les dernières valeurs et textures envoyées. */
function fakeUbo(): { ubo: UniformBuffer; values: Map<string, number[]>; textures: Map<string, unknown> } {
  const values = new Map<string, number[]>();
  const textures = new Map<string, unknown>();
  const ubo = {
    updateFloat4: (name: string, ...v: number[]) => values.set(name, v),
    setTexture: (name: string, t: unknown) => textures.set(name, t),
  } as unknown as UniformBuffer;
  return { ubo, values, textures };
}

describe('PaintedGroundPlugin (textures peintes du sol mélangées sur la carte graphique)', () => {
  let engine: NullEngine, scene: Scene, textures: Record<GroundLayer, RawTexture>, plugin: PaintedGroundPlugin, material: StandardMaterial;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    const make = (): RawTexture => RawTexture.CreateRGBATexture(new Uint8Array(4 * 4 * 4), 4, 4, scene);
    textures = { grass: make(), soil: make(), rock: make(), snow: make() };
    material = new StandardMaterial('sol', scene);
    plugin = new PaintedGroundPlugin(material, textures);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('s’accroche au matériau et active son code (define PAINTEDGROUND)', () => {
    expect(material.pluginManager?.getPlugin('PaintedGround')).toBe(plugin);
    const defines: Record<string, unknown> = {};
    plugin.prepareDefines(defines);
    expect(defines['PAINTEDGROUND']).toBe(true);
  });

  it('lit les poids par sommet (terre, roche, neige) dans un attribut à lui', () => {
    const attributes: string[] = [];
    plugin.getAttributes(attributes);
    expect(attributes).toEqual([PAINTED_GROUND_ATTRIBUTE]);
  });

  it('déclare et envoie une texture par couche, et la taille du motif de chacune (1 / mètres)', () => {
    const samplers: string[] = [];
    plugin.getSamplers(samplers);
    expect(samplers).toHaveLength(GROUND_LAYERS.length);
    const { ubo, values, textures: sent } = fakeUbo();
    plugin.bindForSubMesh(ubo);
    expect([...sent.values()]).toEqual(GROUND_LAYERS.map((l) => textures[l]));
    expect([...sent.keys()]).toEqual(samplers);
    expect(values.get('paintedGroundTiles')).toEqual(GROUND_LAYERS.map((l) => 1 / LAYER_TILE_M[l]));
  });

  it('sol mouillé : l’humidité (0 à 1) est envoyée au shader, qui assombrit le sol (sauf la neige) ; sec par défaut', () => {
    const { ubo, values } = fakeUbo();
    plugin.bindForSubMesh(ubo);
    expect(values.get('paintedGroundWet')![0]).toBe(0);
    plugin.wetness = 0.8;
    plugin.bindForSubMesh(ubo);
    expect(values.get('paintedGroundWet')![0]).toBeCloseTo(0.8, 6);
    plugin.wetness = 3;
    plugin.bindForSubMesh(ubo);
    expect(values.get('paintedGroundWet')![0]).toBe(1); // borné
    expect(plugin.getUniforms().ubo.map((u) => u.name)).toContain('paintedGroundWet');
    expect(plugin.getCustomCode('fragment')!['CUSTOM_FRAGMENT_UPDATE_DIFFUSE']).toContain('paintedGroundWet');
  });

  it('reflets de pluie : couleurs du ciel (horizon, zénith), pluie et temps envoyés au shader', () => {
    const { ubo, values } = fakeUbo();
    plugin.wetness = 0.9;
    plugin.rain = 0.75;
    plugin.skyHorizon = [0.4, 0.45, 0.5];
    plugin.skyZenith = [0.3, 0.35, 0.42];
    plugin.timeS = 12;
    plugin.bindForSubMesh(ubo);
    expect(values.get('paintedGroundWet')!.slice(0, 2).map((v) => Number(v.toFixed(6)))).toEqual([0.9, 0.75]);
    expect(values.get('paintedGroundSky')).toEqual([0.4, 0.45, 0.5, 12]);
    expect(values.get('paintedGroundZenith')!.slice(0, 3)).toEqual([0.3, 0.35, 0.42]);
    expect(plugin.getUniforms().ubo.map((u) => u.name)).toEqual(expect.arrayContaining(['paintedGroundSky', 'paintedGroundZenith']));
  });

  it('shader : le sol mouillé reflète le ciel en rasant (Fresnel), des flaques sur le plat qui ondulent sous la pluie', () => {
    const code = plugin.getCustomCode('fragment')!['CUSTOM_FRAGMENT_BEFORE_FOG']!;
    expect(code).toContain('reflect(');
    expect(code).toContain('viewDirectionW');
    expect(code).toContain('paintedGroundSky');
    expect(code).toMatch(/flaque|Pud/);
  });

  it('connaît ses textures (actives, et rendues à la destruction du matériau)', () => {
    const active: BaseTexture[] = [];
    plugin.getActiveTextures(active);
    expect(active).toEqual(GROUND_LAYERS.map((l) => textures[l]));
    expect(plugin.hasTexture(textures.rock)).toBe(true);
    expect(plugin.hasTexture(RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, scene))).toBe(false);
  });

  it('code injecté : l’attribut passe au pixel, la couleur de base est multipliée ; roche projetée sur trois axes (falaises sans étirement)', () => {
    const vertex = plugin.getCustomCode('vertex')!;
    const fragment = plugin.getCustomCode('fragment')!;
    expect(vertex['CUSTOM_VERTEX_DEFINITIONS']).toContain(`attribute vec3 ${PAINTED_GROUND_ATTRIBUTE}`);
    expect(vertex['CUSTOM_VERTEX_MAIN_END']).toContain(PAINTED_GROUND_ATTRIBUTE);
    expect(fragment['CUSTOM_FRAGMENT_UPDATE_DIFFUSE']).toContain('baseColor.rgb');
    const all = Object.values(fragment).join('\n');
    expect(all).toContain('vNormalW');
    expect(all).toContain(PAINT_GAIN.toFixed(4));
  });
});
