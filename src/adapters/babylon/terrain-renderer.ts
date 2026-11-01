// Un maillage Babylon par chunk, à partir des tampons préparés dans le worker : couleurs de sommets (la teinte, palette) et
// poids des matières (terre, roche, neige ; l'herbe prend le reste). Matériau PHYSIQUE (PBR) partagé par tous les chunks : les
// matières générées sur la carte graphique (ground-textures) y sont mélangées par terrain-surface-plugin. La taille des textures,
// leur filtrage et la lecture des reliefs suivent le profil graphique (render-data/quality → terrain) : setQuality les refait.
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { CHUNK_SIZE } from '../../core/world/chunk';
import type { ChunkMeshData } from '../render-data/mesh-data';
import type { TerrainQuality } from '../render-data/quality';
import { createGroundTextures, disposeGroundTextures, type GroundTextureSet } from './ground-textures';
import { TERRAIN_LAYERS_ATTRIBUTE, TerrainSurfacePlugin } from './terrain-surface-plugin';

/** Part de l'éclairage d'environnement (le ciel de l'heure) que le sol reçoit, en plus de la lumière d'ambiance de la scène. */
export const TERRAIN_ENVIRONMENT_INTENSITY = 0.3;

export class TerrainRenderer {
  private readonly meshes = new Map<string, Mesh>();
  /** Matériau partagé par tous les chunks (la brume de hauteur s'y branche). */
  readonly material: PBRMaterial;
  private readonly surface: TerrainSurfacePlugin;
  private textures: GroundTextureSet;
  private quality: TerrainQuality;

  constructor(
    private readonly scene: Scene,
    quality: TerrainQuality,
  ) {
    this.quality = quality;
    this.material = new PBRMaterial('terrain', scene);
    this.material.albedoColor = Color3.White();
    this.material.metallic = 0;
    this.material.roughness = 1;
    this.material.environmentIntensity = TERRAIN_ENVIRONMENT_INTENSITY;
    // Les reflets du ciel s'éteignent dans les creux et sous l'horizon du relief : pas de liseré lumineux sur les pentes à l'ombre.
    this.material.useRadianceOcclusion = true;
    this.material.useHorizonOcclusion = true;
    this.textures = createGroundTextures(scene, quality.textureSize, quality.anisotropy);
    this.surface = new TerrainSurfacePlugin(this.material, this.textures, { normalMaps: quality.normalMaps });
  }

  /** Profil graphique : nouvelle taille de textures (refaites sur la carte graphique), filtrage, reliefs. */
  setQuality(quality: TerrainQuality): void {
    const old = this.textures;
    if (quality.textureSize !== this.quality.textureSize) {
      this.textures = createGroundTextures(this.scene, quality.textureSize, quality.anisotropy);
      this.surface.setTextures(this.textures, quality.normalMaps);
      disposeGroundTextures(old);
    } else {
      for (const layer of Object.values(this.textures)) {
        layer.color.anisotropicFilteringLevel = quality.anisotropy;
        layer.matter.anisotropicFilteringLevel = quality.anisotropy;
      }
      this.surface.setTextures(this.textures, quality.normalMaps);
    }
    this.quality = quality;
  }

  get textureSize(): number {
    return this.quality.textureSize;
  }

  /** Pluie qui tombe (0 à 1 : les flaques ondulent) et horloge réelle (s) des ondulations. */
  setRain(rain: number, timeS: number): void {
    this.surface.rain = rain;
    this.surface.timeS = timeS;
  }

  /** Sol mouillé par la météo (0 = sec, 1 = détrempé). */
  setWetness(wetness: number): void {
    this.surface.wetness = wetness;
  }

  get size(): number {
    return this.meshes.size;
  }

  has(key: string): boolean {
    return this.meshes.has(key);
  }

  add(key: string, cx: number, cz: number, data: ChunkMeshData): void {
    this.remove(key);
    const mesh = new Mesh(`chunk ${key}`, this.scene);
    const vertexData = new VertexData();
    vertexData.positions = data.positions;
    vertexData.normals = data.normals;
    vertexData.colors = data.colors;
    vertexData.indices = data.indices;
    vertexData.applyToMesh(mesh, false);
    mesh.setVerticesData(TERRAIN_LAYERS_ATTRIBUTE, data.layers, false, 3);
    mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    mesh.material = this.material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.freezeWorldMatrix();
    mesh.doNotSyncBoundingInfo = true;
    this.meshes.set(key, mesh);
  }

  remove(key: string): void {
    const mesh = this.meshes.get(key);
    if (mesh === undefined) return;
    mesh.dispose(false, false);
    this.meshes.delete(key);
  }

  dispose(): void {
    for (const key of [...this.meshes.keys()]) this.remove(key);
    disposeGroundTextures(this.textures);
    this.material.dispose();
  }
}
