// Bibliothèque de modèles 3D (glTF) : chaque modèle est chargé une fois, sa transformation « cuite » dans les sommets
// (le chargeur glTF ajoute un nœud racine qui retourne l'axe Z : il ne doit pas se mélanger aux matrices d'instances),
// puis gardé caché jusqu'à ce que vegetation-renderer lui donne ses instances (thin instances).
import '@babylonjs/loaders/glTF';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { FOLIAGE_HDR_HEADROOM, foliageProfileFor } from '../render-data/foliage';
import { normalMapFor, type NormalMap } from '../render-data/normal-maps';
import { FOLIAGE_MATERIAL, isFoliageMaterial, surfaceFor } from '../render-data/surfaces';
import { FoliagePlugin, type WindState } from './foliage-plugin';

/**
 * Matériau glTF (PBR) → matériau standard : même rendu mat « peint » que le terrain, éclairé par les mêmes lumières, et
 * des shaders bien plus légers à préparer et à dessiner (des centaines de lots de végétation).
 */
/**
 * Part de la couleur du modèle qui s'éclaire toute seule : un peu de lisibilité dans l'ombre, sans briller la nuit.
 * Une COULEUR fixe, jamais l'image du modèle : le shader standard AJOUTE l'image d'auto-éclairage à cette couleur — avec
 * l'image du modèle, chaque objet s'éclairait de sa couleur pleine, à toute heure (herbe vert fluo la nuit, orange perdu au
 * crépuscule), et une teinte (cheveux de l'héroïne) ne l'atteignait pas.
 */
const SELF_LIGHT = 0.1;
/** Feuillages, herbes, plantes et fleurs : le soleil les traverse (un peu plus d'auto-éclairage) et leur vert olive tire vers le jaune-vert. */
const FOLIAGE = FOLIAGE_MATERIAL;
// Presque nulle (ADR 0012) : la lumière diffusée à travers le feuillage (foliage-plugin) et le ciel éclairent déjà l'ombre ; plus
// forte, l'herbe restait claire au crépuscule et la nuit, comme éclairée de l'intérieur. Divisée par la marge de lumière (le shader
// multiplie la couleur d'autant).
const FOLIAGE_SELF_LIGHT = new Color3(0.02, 0.024, 0.014).scale(1 / FOLIAGE_HDR_HEADROOM);
/** Lumière reçue par la végétation, divisée par la marge (render-data/foliage → FOLIAGE_HDR_HEADROOM). */
const FOLIAGE_TINT = new Color3(1, 1, 1).scale(1 / FOLIAGE_HDR_HEADROOM);
/** Reflet cireux des feuilles et des brins : faible, large (une cuticule, pas un vernis). */
const FOLIAGE_SPECULAR = new Color3(0.045, 0.05, 0.04);
const FOLIAGE_GLOSSINESS = 18;

/** Matériaux des petites plantes du pack (herbe « Grass », plantes, trèfles, fougères « Leaves ») : pas les feuillages d'arbres. */
const GROUND_PLANTS = /^(grass|leaves)$/i;

/**
 * Faut-il l'ombrage cuit dans les couleurs de sommets (l'occlusion peinte par l'artiste) ? Oui pour les arbres, les roches…
 * Non pour l'herbe et les petites plantes : leur pied devient noir sous notre éclairage simplifié, alors que le dégradé de
 * leur texture donne déjà le pied sombre et la pointe claire des aperçus du pack.
 */
export function usesBakedShading(materialName: string): boolean {
  return !GROUND_PLANTS.test(materialName);
}

/**
 * Options de chargement glTF pour des matériaux standard : textures gardées telles quelles (sRGB). Sans ça, le chargeur
 * les décode en linéaire pour le PBR, et le matériau standard les affiche deux fois plus sombres (vert 0,48 → 0,2).
 */
export const GLTF_FOR_STANDARD = { pluginOptions: { gltf: { useSRGBBuffers: false } } } as const;

/** Donne la texture d'une carte de relief (render-data/normal-maps) ; la même pour tous les matériaux qui la partagent. */
export type NormalMapLoader = (map: NormalMap) => BaseTexture;

/**
 * @param loadNormalMap fournit la carte de relief des écorces et des roches (par nom de matériau, render-data/normal-maps).
 *   Le glTF qui en porte déjà une (normalTexture) la garde. Jamais de relief sur le feuillage, l'herbe et les fleurs.
 */
/** Vent immobile : pour les matériaux chargés sans vent (personnages, tests). */
const NO_WIND: WindState = { timeS: 0, strength: 0 };

/**
 * @param wind le vent partagé par toute la végétation (render-data/foliage) : herbe, plantes, fleurs et feuillages reçoivent le plugin
 *   végétal (vent, dégradé pied → pointe, teinte par instance). Sans vent fourni, ils gardent dégradé et teinte, immobiles.
 */
export function toStandard(pbr: PBRMaterial, scene: Scene, loadNormalMap?: NormalMapLoader, wind: WindState = NO_WIND): StandardMaterial {
  const material = new StandardMaterial(pbr.name, scene);
  const foliage = FOLIAGE.test(pbr.name);
  material.diffuseColor = foliage ? pbr.albedoColor.multiply(FOLIAGE_TINT) : pbr.albedoColor.clone();
  material.diffuseTexture = pbr.albedoTexture;
  material.emissiveColor = foliage ? FOLIAGE_SELF_LIGHT.clone() : new Color3(SELF_LIGHT, SELF_LIGHT, SELF_LIGHT);
  material.specularColor = foliage ? FOLIAGE_SPECULAR.clone() : Color3.Black();
  material.specularPower = FOLIAGE_GLOSSINESS;
  material.backFaceCulling = pbr.backFaceCulling;
  material.twoSidedLighting = pbr.twoSidedLighting;
  material.transparencyMode = pbr.transparencyMode;
  material.alphaCutOff = pbr.alphaCutOff;
  // Sans ça, le découpage (glTF MASK) compare un alpha resté à 1 : le fond des images de feuilles s'affiche en noir.
  material.useAlphaFromDiffuseTexture = pbr.transparencyMode !== null && pbr.transparencyMode !== PBRMaterial.MATERIAL_OPAQUE;
  if (!foliage) applyRelief(material, pbr, scene, loadNormalMap);
  const profile = foliageProfileFor(pbr.name);
  if (profile !== undefined) new FoliagePlugin(material, profile, wind);
  return material;
}

/**
 * Matériau glTF gardé en PBR (roches, écorces, champignons, personnages) : métal / rugosité de render-data/surfaces, carte de relief,
 * éclairage d'environnement (le ciel de l'heure, sky-environment) dosé. Modifié sur place et rendu.
 * @param tint teinte multipliée à l'albédo (textures livrées en gris pour être teintées : cheveux du pack).
 */
export function toPhysical(pbr: PBRMaterial, scene: Scene, loadNormalMap?: NormalMapLoader, tint?: Color3): PBRMaterial {
  const surface = surfaceFor(pbr.name);
  pbr.metallic = surface.metallic;
  pbr.roughness = surface.roughness;
  pbr.environmentIntensity = surface.environmentIntensity;
  // La texture métal/rugosité du glTF (absente ou neutre dans ces packs) céderait aux réglages : on garde nos valeurs.
  pbr.metallicTexture = null;
  // Le liseré de ciel (Fresnel) sur les bords, et l'occlusion des reflets dans les creux : les volumes se lisent.
  pbr.useRadianceOcclusion = true;
  pbr.useHorizonOcclusion = true;
  if (tint !== undefined) pbr.albedoColor = pbr.albedoColor.multiply(tint);
  if (!pbr.bumpTexture && loadNormalMap !== undefined) {
    const map = normalMapFor(pbr.name);
    if (map !== undefined) {
      const texture = loadNormalMap(map);
      texture.level = map.level;
      pbr.bumpTexture = texture;
      // Cartes glTF (Y vers le haut) en repère main gauche : même convention que le chargeur glTF.
      pbr.invertNormalMapX = !scene.useRightHandedSystem;
      pbr.invertNormalMapY = scene.useRightHandedSystem;
    }
  }
  return pbr;
}

function applyRelief(material: StandardMaterial, pbr: PBRMaterial, scene: Scene, loadNormalMap: NormalMapLoader | undefined): void {
  if (pbr.bumpTexture) {
    material.bumpTexture = pbr.bumpTexture;
    material.invertNormalMapX = pbr.invertNormalMapX;
    material.invertNormalMapY = pbr.invertNormalMapY;
    return;
  }
  const map = loadNormalMap === undefined ? undefined : normalMapFor(pbr.name);
  if (map === undefined || loadNormalMap === undefined) return;
  const texture = loadNormalMap(map);
  texture.level = map.level;
  material.bumpTexture = texture;
  // Cartes glTF (Y vers le haut) : le chargeur inverse X dans un repère main gauche pour le PBR ; le matériau standard doit faire de même.
  material.invertNormalMapX = !scene.useRightHandedSystem;
  material.invertNormalMapY = scene.useRightHandedSystem;
}

/** Filtrage anisotrope des cartes de relief : les troncs se voient souvent de biais. */
const NORMAL_MAP_ANISOTROPY = 4;

export class AssetLibrary {
  private readonly normalMaps = new Map<string, Texture>();
  private readonly parts = new Map<string, Mesh[]>();
  private readonly standardOf = new Map<PBRMaterial, StandardMaterial>();
  /** Matériaux gardés en PBR, déjà réglés (un matériau partagé par plusieurs modèles ne l'est qu'une fois). */
  private readonly physical = new Set<PBRMaterial>();

  /** `baseUrl` : dossier des modèles, avec « / » final (ex. /assets/models/nature/). */
  constructor(
    private readonly scene: Scene,
    private readonly baseUrl: string,
    /** Vent partagé par toute la végétation chargée ici (immobile par défaut). */
    private readonly wind: WindState = NO_WIND,
  ) {}

  /** Charge les modèles `<clé>.gltf`. Les autres se chargent même si l'un échoue ; rejette ensuite en nommant les absents. */
  async load(keys: readonly string[]): Promise<void> {
    const results = await Promise.allSettled(keys.map((key) => this.loadOne(key)));
    const failed = keys.filter((_, i) => results[i]!.status === 'rejected');
    if (failed.length > 0) throw new Error(`modèles illisibles : ${failed.join(', ')}`);
  }

  /** Morceaux (maillage + matériau) d'un modèle chargé : un arbre = tronc + feuillage. Vide si pas chargé. */
  partsOf(key: string): readonly Mesh[] {
    return this.parts.get(key) ?? [];
  }

  /** Charge la carte de relief une seule fois (les arbres d'une même espèce se la partagent). Pas de miroir vertical : les UV sont ceux du glTF. */
  private normalMapTexture(map: NormalMap): Texture {
    let texture = this.normalMaps.get(map.file);
    if (texture === undefined) {
      texture = new Texture(`${this.baseUrl}${map.file}`, this.scene, false, false);
      texture.anisotropicFilteringLevel = NORMAL_MAP_ANISOTROPY;
      this.normalMaps.set(map.file, texture);
    }
    return texture;
  }

  private async loadOne(key: string): Promise<void> {
    const container = await LoadAssetContainerAsync(`${this.baseUrl}${key}.gltf`, this.scene, GLTF_FOR_STANDARD);
    container.addAllToScene();
    const parts: Mesh[] = [];
    for (const mesh of container.meshes) {
      if (!(mesh instanceof Mesh) || mesh.getTotalVertices() === 0) continue;
      mesh.computeWorldMatrix(true);
      mesh.setParent(null);
      mesh.bakeCurrentTransformIntoVertices(true, true);
      if (mesh.material instanceof PBRMaterial && isFoliageMaterial(mesh.material.name)) {
        let standard = this.standardOf.get(mesh.material);
        if (standard === undefined) {
          standard = toStandard(mesh.material, this.scene, (map) => this.normalMapTexture(map), this.wind);
          this.standardOf.set(mesh.material, standard);
        }
        mesh.material = standard;
      } else if (mesh.material instanceof PBRMaterial && !this.physical.has(mesh.material)) {
        toPhysical(mesh.material, this.scene, (map) => this.normalMapTexture(map));
        this.physical.add(mesh.material);
      }
      mesh.useVertexColors = usesBakedShading(mesh.material?.name ?? '');
      mesh.isPickable = false;
      mesh.setEnabled(false); // caché tant que le rendu ne lui a pas donné d'instances
      parts.push(mesh);
    }
    this.parts.set(key, parts);
  }
}
