// Un maillage Babylon par chunk, à partir des tampons préparés dans le worker : couleurs de sommets (la teinte, palette)
// et poids des couches peintes (terre, roche, neige), multipliées par quatre textures « peintes à la main » générées au
// démarrage (render-data/painted-ground) et mélangées sur la carte graphique (painted-ground-plugin).
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { CHUNK_SIZE } from '../../core/world/chunk';
import type { ChunkMeshData } from '../render-data/mesh-data';
import { GROUND_LAYERS, PAINT_GAIN, paintedLayerRgba, type GroundLayer } from '../render-data/painted-ground';
import { PAINTED_GROUND_ATTRIBUTE, PaintedGroundPlugin } from './painted-ground-plugin';
import type { Rgb } from '../render-data/palette';

/** Côté (px) de chaque texture peinte : 512 px sur 3 à 8 m, soit moins de 2 cm par pixel de près. */
export const PAINTED_TEXTURE_SIZE = 512;
/** Filtrage anisotrope (le sol se voit presque à plat) : 4× suffit à garder la matière nette sans coût notable. */
const ANISOTROPY = 4;

export class TerrainRenderer {
  private readonly meshes = new Map<string, Mesh>();
  /** Matériau partagé par tous les chunks (la brume de hauteur s'y branche). */
  readonly material: StandardMaterial;
  private readonly ground: PaintedGroundPlugin;

  constructor(private readonly scene: Scene) {
    this.material = new StandardMaterial('terrain', scene);
    // Les octets des textures (≤ 1) codent des facteurs jusqu'à PAINT_GAIN : la couleur diffuse les restitue.
    this.material.diffuseColor = new Color3(PAINT_GAIN, PAINT_GAIN, PAINT_GAIN);
    // Pas de reflet brillant : rendu mat, « peint ».
    this.material.specularColor = Color3.Black();
    const textures = Object.fromEntries(GROUND_LAYERS.map((l) => [l, createLayerTexture(scene, l)])) as Record<GroundLayer, Texture>;
    this.ground = new PaintedGroundPlugin(this.material, textures);
  }

  /** Reflets de pluie : couleurs du ciel (près de l'horizon, au zénith), pluie qui fait onduler les flaques, horloge réelle (s). */
  setSkyReflection(horizon: Rgb, zenith: Rgb, rain: number, timeS: number): void {
    this.ground.skyHorizon = horizon;
    this.ground.skyZenith = zenith;
    this.ground.rain = rain;
    this.ground.timeS = timeS;
  }

  /** Sol mouillé par la météo (0 = sec, 1 = détrempé). */
  setWetness(wetness: number): void {
    this.ground.wetness = wetness;
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
    mesh.setVerticesData(PAINTED_GROUND_ATTRIBUTE, data.layers, false, 3);
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
}

/** Texture d'une couche : générée ici (aucun fichier), répétée, avec mipmaps — de loin la matière se fond dans la couleur. */
function createLayerTexture(scene: Scene, layer: GroundLayer): Texture {
  const texture = RawTexture.CreateRGBATexture(
    paintedLayerRgba(layer, PAINTED_TEXTURE_SIZE),
    PAINTED_TEXTURE_SIZE,
    PAINTED_TEXTURE_SIZE,
    scene,
    true, // mipmaps
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  texture.name = `terrain-${layer}`;
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = ANISOTROPY;
  return texture;
}
