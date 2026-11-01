import '@babylonjs/loaders/glTF';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { type NormalMap } from '../render-data/normal-maps';
import { type WindState } from './foliage-plugin';
/**
 * Faut-il l'ombrage cuit dans les couleurs de sommets (l'occlusion peinte par l'artiste) ? Oui pour les arbres, les roches…
 * Non pour l'herbe et les petites plantes : leur pied devient noir sous notre éclairage simplifié, alors que le dégradé de
 * leur texture donne déjà le pied sombre et la pointe claire des aperçus du pack.
 */
export declare function usesBakedShading(materialName: string): boolean;
/**
 * Options de chargement glTF pour des matériaux standard : textures gardées telles quelles (sRGB). Sans ça, le chargeur
 * les décode en linéaire pour le PBR, et le matériau standard les affiche deux fois plus sombres (vert 0,48 → 0,2).
 */
export declare const GLTF_FOR_STANDARD: {
    readonly pluginOptions: {
        readonly gltf: {
            readonly useSRGBBuffers: false;
        };
    };
};
/** Donne la texture d'une carte de relief (render-data/normal-maps) ; la même pour tous les matériaux qui la partagent. */
export type NormalMapLoader = (map: NormalMap) => BaseTexture;
/**
 * @param wind le vent partagé par toute la végétation (render-data/foliage) : herbe, plantes, fleurs et feuillages reçoivent le plugin
 *   végétal (vent, dégradé pied → pointe, teinte par instance). Sans vent fourni, ils gardent dégradé et teinte, immobiles.
 */
export declare function toStandard(pbr: PBRMaterial, scene: Scene, loadNormalMap?: NormalMapLoader, wind?: WindState): StandardMaterial;
/**
 * Matériau glTF gardé en PBR (roches, écorces, champignons, personnages) : métal / rugosité de render-data/surfaces, carte de relief,
 * éclairage d'environnement (le ciel de l'heure, sky-environment) dosé. Modifié sur place et rendu.
 * @param tint teinte multipliée à l'albédo (textures livrées en gris pour être teintées : cheveux du pack).
 */
export declare function toPhysical(pbr: PBRMaterial, scene: Scene, loadNormalMap?: NormalMapLoader, tint?: Color3): PBRMaterial;
export declare class AssetLibrary {
    private readonly scene;
    private readonly baseUrl;
    /** Vent partagé par toute la végétation chargée ici (immobile par défaut). */
    private readonly wind;
    private readonly normalMaps;
    private readonly parts;
    private readonly standardOf;
    /** Matériaux gardés en PBR, déjà réglés (un matériau partagé par plusieurs modèles ne l'est qu'une fois). */
    private readonly physical;
    /** `baseUrl` : dossier des modèles, avec « / » final (ex. /assets/models/nature/). */
    constructor(scene: Scene, baseUrl: string, 
    /** Vent partagé par toute la végétation chargée ici (immobile par défaut). */
    wind?: WindState);
    /** Charge les modèles `<clé>.gltf`. Les autres se chargent même si l'un échoue ; rejette ensuite en nommant les absents. */
    load(keys: readonly string[]): Promise<void>;
    /** Morceaux (maillage + matériau) d'un modèle chargé : un arbre = tronc + feuillage. Vide si pas chargé. */
    partsOf(key: string): readonly Mesh[];
    /** Charge la carte de relief une seule fois (les arbres d'une même espèce se la partagent). Pas de miroir vertical : les UV sont ceux du glTF. */
    private normalMapTexture;
    private loadOne;
}
