import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { type GroundLayer } from '../render-data/painted-ground';
import type { Rgb } from '../render-data/palette';
/** Nom de l'attribut de sommet qui porte les poids (terre, roche, neige) : render-data/mesh-data → ChunkMeshData.layers. */
export declare const PAINTED_GROUND_ATTRIBUTE = "paintedGroundLayers";
/** Sol détrempé : part de luminosité retirée, renfort de couleur, et part de l'effet gardée sur une pente raide. */
export declare const WET_DARKEN = 0.38;
export declare class PaintedGroundPlugin extends MaterialPluginBase {
    private readonly textures;
    /** Sol mouillé (0 = sec, 1 = détrempé) : render-data/atmosphere → wetness, à chaque image. */
    wetness: number;
    /** Pluie qui tombe (0 à 1) : les flaques ondulent. */
    rain: number;
    /** Couleurs du ciel reflétées : près de l'horizon (en rasant) et au zénith. */
    skyHorizon: Rgb;
    skyZenith: Rgb;
    /** Horloge (s) des ondulations. */
    timeS: number;
    constructor(material: Material, textures: Readonly<Record<GroundLayer, BaseTexture>>);
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
