import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateChunk } from '../../core/world/chunk';
import { GROUND_LAYERS, PAINT_GAIN } from '../render-data/painted-ground';
import { buildChunkMesh, worldSamplers } from '../render-data/mesh-data';
import { HeightFogPlugin } from './height-fog-plugin';
import { PAINTED_GROUND_ATTRIBUTE, PaintedGroundPlugin } from './painted-ground-plugin';
import { PAINTED_TEXTURE_SIZE, TerrainRenderer } from './terrain-renderer';

describe('TerrainRenderer (vrai moteur Babylon sans carte graphique)', () => {
  let engine: NullEngine, scene: Scene, terrain: TerrainRenderer;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    terrain = new TerrainRenderer(scene);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  const meshData = (cx: number, cz: number) => buildChunkMesh(generateChunk(7, cx, cz), worldSamplers(7, cx, cz));
  const painted = (): Texture[] => {
    const active: Texture[] = [];
    (terrain.material.pluginManager?.getPlugin('PaintedGround') as PaintedGroundPlugin).getActiveTextures(active);
    return active;
  };

  it('le sol est peint : une texture par couche (herbe, terre, roche, neige), 512 px, générées au démarrage (pas de fichier)', () => {
    expect(terrain.material.pluginManager?.getPlugin('PaintedGround')).toBeInstanceOf(PaintedGroundPlugin);
    expect(PAINTED_TEXTURE_SIZE).toBe(512);
    const textures = painted();
    expect(textures).toHaveLength(GROUND_LAYERS.length);
    for (const t of textures) {
      expect(t.getSize()).toEqual({ width: 512, height: 512 });
      expect(t.getInternalTexture()).not.toBeNull(); // octets envoyés à la carte
    }
    expect(terrain.material.diffuseTexture).toBeNull(); // l'ancien grain gris n'existe plus
  });

  it('les textures se répètent et se filtrent de loin en loin (mipmaps, trilinéaire, anisotrope)', () => {
    for (const t of painted()) {
      expect(t.wrapU).toBe(Texture.WRAP_ADDRESSMODE);
      expect(t.wrapV).toBe(Texture.WRAP_ADDRESSMODE);
      expect(t.samplingMode).toBe(Texture.TRILINEAR_SAMPLINGMODE);
      expect(t.getInternalTexture()?.generateMipMaps).toBe(true);
      expect(t.anisotropicFilteringLevel).toBeGreaterThan(1);
    }
  });

  it('couleur diffuse = PAINT_GAIN (les octets ≤ 1 restituent des facteurs jusqu’à 1,5) et toujours mat', () => {
    expect(terrain.material.diffuseColor.r).toBeCloseTo(PAINT_GAIN, 6);
    expect(terrain.material.diffuseColor.g).toBeCloseTo(PAINT_GAIN, 6);
    expect(terrain.material.diffuseColor.b).toBeCloseTo(PAINT_GAIN, 6);
    expect([terrain.material.specularColor.r, terrain.material.specularColor.g, terrain.material.specularColor.b]).toEqual([0, 0, 0]);
  });

  it('chaque chunk reçoit du worker ses positions, normales, couleurs et poids des couches peintes', () => {
    const data = meshData(-2, 3);
    terrain.add('-2,3', -2, 3, data);
    const mesh = scene.getMeshByName('chunk -2,3')!;
    expect(mesh).not.toBeNull();
    expect([...mesh.getVerticesData(VertexBuffer.ColorKind)!]).toEqual([...data.colors]);
    expect([...mesh.getVerticesData(PAINTED_GROUND_ATTRIBUTE)!]).toEqual([...data.layers]);
    expect(mesh.getVertexBuffer(PAINTED_GROUND_ATTRIBUTE)?.getSize()).toBe(3);
    expect(mesh.getVerticesData(VertexBuffer.PositionKind)).toHaveLength(data.positions.length);
    expect(mesh.material).toBe(terrain.material);
  });

  it('la brume de hauteur se branche toujours sur le matériau peint', () => {
    expect(() => new HeightFogPlugin(terrain.material)).not.toThrow();
    expect(terrain.material.pluginManager?.getPlugin('HeightFog')).toBeDefined();
    expect(terrain.material.pluginManager?.getPlugin('PaintedGround')).toBeDefined();
  });

  it('setWetness : la météo mouille le sol peint (humidité transmise au plugin)', () => {
    terrain.setWetness(0.6);
    const plugin = terrain.material.pluginManager?.getPlugin('PaintedGround') as unknown as { wetness: number };
    expect(plugin.wetness).toBeCloseTo(0.6, 6);
  });

  it('setSkyReflection : le sol mouillé reçoit les couleurs du ciel, la pluie et l’horloge (reflets et flaques)', () => {
    terrain.setSkyReflection([0.5, 0.55, 0.6], [0.3, 0.4, 0.6], 0.8, 3);
    const plugin = terrain.material.pluginManager?.getPlugin('PaintedGround') as unknown as { skyHorizon: number[]; skyZenith: number[]; rain: number; timeS: number };
    expect(plugin.skyHorizon).toEqual([0.5, 0.55, 0.6]);
    expect(plugin.skyZenith).toEqual([0.3, 0.4, 0.6]);
    expect(plugin.rain).toBeCloseTo(0.8, 6);
    expect(plugin.timeS).toBe(3);
  });

  it('add / has / remove / size fonctionnent comme avant', () => {
    terrain.add('0,0', 0, 0, meshData(0, 0));
    expect(terrain.has('0,0')).toBe(true);
    expect(terrain.size).toBe(1);
    terrain.add('0,0', 0, 0, meshData(0, 0)); // remplace
    expect(terrain.size).toBe(1);
    terrain.remove('0,0');
    expect(terrain.has('0,0')).toBe(false);
    expect(terrain.size).toBe(0);
  });
});
