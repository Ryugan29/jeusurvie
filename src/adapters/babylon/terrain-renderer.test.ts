import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateChunk } from '../../core/world/chunk';
import { SURFACE_LAYERS } from '../render-data/ground-materials';
import { buildChunkMesh, worldSamplers } from '../render-data/mesh-data';
import { qualityFor } from '../render-data/quality';
import { HeightFogPlugin } from './height-fog-plugin';
import { TERRAIN_LAYERS_ATTRIBUTE, TerrainSurfacePlugin } from './terrain-surface-plugin';
import { TERRAIN_ENVIRONMENT_INTENSITY, TerrainRenderer } from './terrain-renderer';

describe('TerrainRenderer (vrai moteur Babylon sans carte graphique)', () => {
  let engine: NullEngine, scene: Scene, terrain: TerrainRenderer;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    terrain = new TerrainRenderer(scene, qualityFor('medium').terrain);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  const meshData = (cx: number, cz: number) => buildChunkMesh(generateChunk(7, cx, cz), worldSamplers(7, cx, cz));
  const plugin = (): TerrainSurfacePlugin => terrain.material.pluginManager?.getPlugin('TerrainSurface') as TerrainSurfacePlugin;
  const textures = (): Texture[] => {
    const active: Texture[] = [];
    plugin().getActiveTextures(active);
    return active;
  };

  it('matériau physique (PBR) : diélectrique, éclairé par le ciel de l’heure en plus de la lumière de la scène', () => {
    expect(terrain.material.getClassName()).toBe('PBRMaterial');
    expect(terrain.material.metallic).toBe(0);
    expect(terrain.material.environmentIntensity).toBe(TERRAIN_ENVIRONMENT_INTENSITY);
    expect(terrain.material.useRadianceOcclusion).toBe(true);
    expect(plugin()).toBeInstanceOf(TerrainSurfacePlugin);
  });

  it('deux textures par matière (couleur + relief/rugosité), générées à la taille du profil (pas de fichier)', () => {
    const list = textures();
    expect(list).toHaveLength(SURFACE_LAYERS.length * 2);
    for (const t of list) {
      expect(t.getSize()).toEqual({ width: 512, height: 512 });
      expect(t.wrapU).toBe(Texture.WRAP_ADDRESSMODE);
      expect(t.wrapV).toBe(Texture.WRAP_ADDRESSMODE);
      expect(t.anisotropicFilteringLevel).toBe(qualityFor('medium').terrain.anisotropy);
    }
  });

  it('setQuality : nouvelle taille → textures refaites (les anciennes libérées) ; même taille → seulement le filtrage', () => {
    const before = textures();
    terrain.setQuality(qualityFor('ultra').terrain);
    const after = textures();
    expect(terrain.textureSize).toBe(2048);
    for (const t of after) expect(t.getSize().width).toBe(2048);
    for (const t of before) expect(after).not.toContain(t);
    for (const t of before) expect(t.getInternalTexture()).toBeNull(); // libérées
    terrain.setQuality({ ...qualityFor('ultra').terrain, anisotropy: 4 });
    expect(textures()).toEqual(after);
    for (const t of textures()) expect(t.anisotropicFilteringLevel).toBe(4);
  });

  it('chaque chunk reçoit du worker ses positions, normales, couleurs et poids des matières', () => {
    const data = meshData(-2, 3);
    terrain.add('-2,3', -2, 3, data);
    const mesh = scene.getMeshByName('chunk -2,3')!;
    expect(mesh).not.toBeNull();
    expect([...mesh.getVerticesData(VertexBuffer.ColorKind)!]).toEqual([...data.colors]);
    expect([...mesh.getVerticesData(TERRAIN_LAYERS_ATTRIBUTE)!]).toEqual([...data.layers]);
    expect(mesh.getVertexBuffer(TERRAIN_LAYERS_ATTRIBUTE)?.getSize()).toBe(3);
    expect(mesh.material).toBe(terrain.material);
    expect(mesh.receiveShadows).toBe(true);
  });

  it('la brume de hauteur (profil LOW) se branche sur le matériau physique', () => {
    expect(() => new HeightFogPlugin(terrain.material)).not.toThrow();
    const fog = terrain.material.pluginManager?.getPlugin('HeightFog') as HeightFogPlugin;
    expect(fog.getCustomCode('fragment')!['CUSTOM_FRAGMENT_BEFORE_FOG']).toContain('finalColor.rgb'); // couleur finale du PBR
  });

  it('setWetness et setRain : la météo mouille le sol, la pluie fait onduler les flaques', () => {
    terrain.setWetness(0.6);
    terrain.setRain(0.8, 3);
    expect(plugin().wetness).toBeCloseTo(0.6, 6);
    expect(plugin().rain).toBeCloseTo(0.8, 6);
    expect(plugin().timeS).toBe(3);
  });

  it('le shader du sol : matières mêlées par hauteur, roche triplanaire, flaques dans les creux ; reliefs selon le profil', () => {
    const fragment = plugin().getCustomCode('fragment')!;
    expect(fragment['CUSTOM_FRAGMENT_MAIN_BEGIN']).toContain('tsPuddle');
    expect(fragment['CUSTOM_FRAGMENT_MAIN_BEGIN']).toContain('tsBw'); // poids triplanaires
    expect(fragment['CUSTOM_FRAGMENT_UPDATE_ALBEDO']).toContain('surfaceAlbedo = tsAlbedo');
    expect(fragment['CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS']).toContain('metallicRoughness.g = tsRough');
    expect(fragment['CUSTOM_FRAGMENT_BEFORE_LIGHTS']).toContain('normalW = tsNormal');
    const defines: Record<string, unknown> = {};
    plugin().prepareDefines(defines);
    expect(defines).toMatchObject({ TERRAINSURFACE: true, TSNORMALS: true });
    terrain.setQuality(qualityFor('low').terrain);
    plugin().prepareDefines(defines);
    expect(defines['TSNORMALS']).toBe(false);
  });

  it('add / has / remove / size, et dispose libère tout', () => {
    terrain.add('0,0', 0, 0, meshData(0, 0));
    expect(terrain.has('0,0')).toBe(true);
    expect(terrain.size).toBe(1);
    terrain.add('0,0', 0, 0, meshData(0, 0)); // remplace
    expect(terrain.size).toBe(1);
    terrain.remove('0,0');
    expect(terrain.has('0,0')).toBe(false);
    terrain.add('1,0', 1, 0, meshData(1, 0));
    terrain.dispose();
    expect(terrain.size).toBe(0);
    expect(scene.getMeshByName('chunk 1,0')).toBeNull();
  });
});
