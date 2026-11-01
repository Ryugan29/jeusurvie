import '@babylonjs/core/Materials/Textures/Procedurals/proceduralTextureSceneComponent';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Scene } from '@babylonjs/core/scene';
import { type SurfaceLayer } from '../render-data/ground-materials';
export type GroundTextureKind = 'color' | 'matter';
/** Nom du shader (dans le magasin de Babylon) d'une passe d'une couche. */
export declare function groundShaderName(layer: SurfaceLayer, kind: GroundTextureKind): string;
/** Source GLSL complète d'une passe (exportée pour les tests : structure, uniformes, périodicité). */
export declare function groundShaderSource(layer: SurfaceLayer, kind: GroundTextureKind): string;
/** Les deux textures d'une couche. */
export interface GroundLayerTextures {
    readonly color: Texture;
    readonly matter: Texture;
}
export type GroundTextureSet = Readonly<Record<SurfaceLayer, GroundLayerTextures>>;
/**
 * Crée les huit textures (quatre couches × couleur et matière) à la taille demandée. Elles sont calculées une seule fois par la
 * carte graphique, au premier rendu où elles sont prêtes (refreshRate 0), puis gardées avec leurs mipmaps.
 */
export declare function createGroundTextures(scene: Scene, size: number, anisotropy: number): GroundTextureSet;
export declare function disposeGroundTextures(set: GroundTextureSet): void;
