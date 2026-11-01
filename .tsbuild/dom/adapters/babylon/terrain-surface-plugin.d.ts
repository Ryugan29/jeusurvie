import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import type { GroundTextureSet } from './ground-textures';
/** Nom de l'attribut de sommet qui porte les poids (terre, roche, neige) : render-data/mesh-data → ChunkMeshData.layers. */
export declare const TERRAIN_LAYERS_ATTRIBUTE = "paintedGroundLayers";
export declare class TerrainSurfacePlugin extends MaterialPluginBase {
    private textures;
    /** Sol mouillé (0 = sec, 1 = détrempé) : render-data/atmosphere → wetness, à chaque image. */
    wetness: number;
    /** Pluie qui tombe (0 à 1) : les flaques ondulent. */
    rain: number;
    /** Horloge (s) des ondulations. */
    timeS: number;
    private normalMaps;
    constructor(material: Material, textures: GroundTextureSet, options: {
        readonly normalMaps: boolean;
    });
    /** Nouvelles textures (changement de profil graphique) et lecture ou non des cartes de matière. */
    setTextures(textures: GroundTextureSet, normalMaps: boolean): void;
    getClassName(): string;
    isCompatible(shaderLanguage: ShaderLanguage): boolean;
    prepareDefines(defines: Record<string, unknown>): void;
    getAttributes(attributes: string[]): void;
    getSamplers(samplers: string[]): void;
    getUniforms(): {
        ubo: {
            name: string;
            size: number;
            type: string;
        }[];
        fragment: string;
    };
    bindForSubMesh(uniformBuffer: UniformBuffer): void;
    getActiveTextures(activeTextures: BaseTexture[]): void;
    hasTexture(texture: BaseTexture): boolean;
    getCustomCode(shaderType: string): Record<string, string> | null;
}
