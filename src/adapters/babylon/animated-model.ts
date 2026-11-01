// Modèle 3D animé (personnage, créature) : chargé depuis un glTF, mis à la taille voulue avec les pieds sur l'origine de son
// « pivot » (position = pieds, lacet = cap). Les animations du fichier sont rangées par nom, à l'arrêt. Les animations d'un
// autre fichier (même squelette, autre corps) se rejouent par reciblage : os appariés par nom.
import '@babylonjs/loaders/glTF';
import '@babylonjs/core/Animations/animatable';
import type { Animation } from '@babylonjs/core/Animations/animation';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { GLTF_FOR_STANDARD, toPhysical } from './asset-library';

export interface AnimatedModel {
  /**
   * Nœud à déplacer : sa position est celle des pieds, `rotation.y` le cap (0 = regarde vers +Z, π/2 = vers +X, comme la
   * caméra). Son échelle est celle qui amène le modèle à sa taille : ne pas y toucher.
   */
  readonly pivot: TransformNode;
  /** Maillages dessinés (ce qui projette une ombre). */
  readonly meshes: readonly Mesh[];
  /** Nœuds du fichier par nom (os compris). */
  readonly nodes: ReadonlyMap<string, TransformNode>;
  /** Animations du fichier par nom, arrêtées. */
  readonly animations: ReadonlyMap<string, AnimationGroup>;
}

export interface AnimatedModelOptions {
  /** Taille voulue (m), des pieds au sommet du modèle au repos. */
  readonly heightM: number;
  /**
   * Teinte par nom de matériau, multipliée à sa couleur (éclairage et auto-éclairage). Sert aux textures livrées en gris
   * pour être teintées par le moteur (les cheveux du pack).
   */
  readonly tints?: Readonly<Record<string, Color3>>;
}

export async function loadAnimatedModel(scene: Scene, url: string, options: AnimatedModelOptions): Promise<AnimatedModel> {
  const container = await LoadAssetContainerAsync(url, scene, GLTF_FOR_STANDARD);
  container.addAllToScene();
  for (const group of container.animationGroups) group.stop(); // le chargeur lance la première animation tout seul

  // Personnages en PBR (render-data/surfaces) : peau satinée, cheveux et yeux qui accrochent le ciel, liseré de lumière sur la silhouette.
  const physical = new Set<PBRMaterial>();
  const meshes: Mesh[] = [];
  for (const mesh of container.meshes) {
    if (!(mesh instanceof Mesh) || mesh.getTotalVertices() === 0) continue;
    if (mesh.material instanceof PBRMaterial && !physical.has(mesh.material)) {
      toPhysical(mesh.material, scene, undefined, options.tints?.[mesh.material.name]);
      physical.add(mesh.material);
    }
    mesh.isPickable = false;
    // Maillage animé par un squelette : sa boîte de repos ne dit pas où il est dessiné, il ne doit jamais être écarté.
    mesh.alwaysSelectAsActiveMesh = true;
    meshes.push(mesh);
  }

  // Mesure du modèle au repos (pivot encore neutre), puis mise à la taille : pivot (échelle) > fit (décalage) > racines.
  const { minY, maxY } = restHeightRange(meshes);
  const pivot = new TransformNode('pivot', scene);
  const fit = new TransformNode('fit', scene);
  fit.parent = pivot;
  fit.position.y = -minY;
  pivot.scaling.setAll(options.heightM / (maxY - minY));
  for (const root of container.rootNodes) root.parent = fit;

  const nodes = new Map<string, TransformNode>();
  for (const node of [...container.transformNodes, ...container.meshes]) nodes.set(node.name, node);
  const animations = new Map(container.animationGroups.map((group) => [group.name, group] as const));
  return { pivot, meshes, nodes, animations };
}

/** Plus bas et plus haut point (monde) des maillages au repos. */
function restHeightRange(meshes: readonly Mesh[]): { minY: number; maxY: number } {
  let minY = Infinity, maxY = -Infinity;
  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    minY = Math.min(minY, box.minimumWorld.y);
    maxY = Math.max(maxY, box.maximumWorld.y);
  }
  return { minY, maxY };
}

/** Animations d'un autre fichier, lues pour être rejouées sur un modèle : jamais ajouté à la scène, jamais dessiné. */
export interface AnimationSource {
  readonly groups: ReadonlyMap<string, AnimationGroup>;
  /** Os (et autres nœuds) du fichier par nom, dans leur pose de repos. */
  readonly nodes: ReadonlyMap<string, TransformNode>;
  dispose(): void;
}

export async function loadAnimationSource(scene: Scene, url: string): Promise<AnimationSource> {
  // Sans matériaux ni textures : on ne veut que les animations et la pose de repos des os.
  const container = await LoadAssetContainerAsync(url, scene, { pluginOptions: { gltf: { skipMaterials: true } } });
  const nodes = new Map<string, TransformNode>();
  for (const node of container.transformNodes) nodes.set(node.name, node);
  const groups = new Map(container.animationGroups.map((group) => [group.name, group] as const));
  return { groups, nodes, dispose: () => container.dispose() };
}

export interface RetargetOptions {
  /**
   * Os dont on garde le déplacement (le bassin : il monte et descend avec la foulée). Il est décalé de la différence de
   * repos entre les deux squelettes. Les autres os ne reprennent que les rotations : ils gardent leurs proportions.
   */
  readonly moveBones: readonly string[];
}

export interface Retargeted {
  readonly groups: ReadonlyMap<string, AnimationGroup>;
  /** Os animés par la source et absents du modèle cible (leurs animations sont ignorées). */
  readonly missingBones: readonly string[];
}

/**
 * Rejoue sur `target` les animations `names` de `source`, os appariés par nom. Rejette si l'une des animations manque.
 * Les groupes rendus sont dans la scène, arrêtés ; ils restent valables après `source.dispose()`.
 */
export function retargetAnimations(source: AnimationSource, target: AnimatedModel, names: readonly string[], options: RetargetOptions): Retargeted {
  const absent = names.filter((name) => !source.groups.has(name));
  if (absent.length > 0) throw new Error(`animations absentes de la source : ${absent.join(', ')}`);
  const scene = target.pivot.getScene();
  const moved = new Set(options.moveBones);
  const missing = new Set<string>();
  const groups = new Map<string, AnimationGroup>();
  for (const name of names) {
    const group = new AnimationGroup(name, scene);
    for (const { animation, target: from } of source.groups.get(name)!.targetedAnimations) {
      const bone = from as TransformNode;
      const to = target.nodes.get(bone.name);
      if (to === undefined) {
        missing.add(bone.name);
        continue;
      }
      if (animation.targetProperty === 'rotationQuaternion') group.addTargetedAnimation(animation, to);
      else if (animation.targetProperty === 'position' && moved.has(bone.name)) {
        group.addTargetedAnimation(shiftedKeys(animation, to.position.subtract(bone.position)), to);
      }
    }
    group.stop();
    groups.set(name, group);
  }
  return { groups, missingBones: [...missing] };
}

/** Copie de l'animation de position dont toutes les valeurs sont décalées de `delta`. */
function shiftedKeys(animation: Animation, delta: Vector3): Animation {
  const copy = animation.clone();
  copy.setKeys(animation.getKeys().map((key) => ({ ...key, value: (key.value as Vector3).add(delta) })));
  return copy;
}
