import '@babylonjs/loaders/glTF';
import '@babylonjs/core/Animations/animatable';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
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
export declare function loadAnimatedModel(scene: Scene, url: string, options: AnimatedModelOptions): Promise<AnimatedModel>;
/** Animations d'un autre fichier, lues pour être rejouées sur un modèle : jamais ajouté à la scène, jamais dessiné. */
export interface AnimationSource {
    readonly groups: ReadonlyMap<string, AnimationGroup>;
    /** Os (et autres nœuds) du fichier par nom, dans leur pose de repos. */
    readonly nodes: ReadonlyMap<string, TransformNode>;
    dispose(): void;
}
export declare function loadAnimationSource(scene: Scene, url: string): Promise<AnimationSource>;
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
export declare function retargetAnimations(source: AnimationSource, target: AnimatedModel, names: readonly string[], options: RetargetOptions): Retargeted;
