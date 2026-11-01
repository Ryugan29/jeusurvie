import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import type { HeightFog } from '../render-data/fog';
import type { Rgb } from '../render-data/palette';
export declare class HeightFogPlugin extends MaterialPluginBase {
    private fog;
    private baseY;
    private color;
    private readonly code;
    constructor(material: Material);
    /** Réglages courants (appelés à chaque image ; aucune allocation). */
    set(fog: HeightFog, baseY: number, color: Rgb): void;
    getClassName(): string;
    isCompatible(shaderLanguage: ShaderLanguage): boolean;
    prepareDefines(defines: Record<string, unknown>): void;
    getUniforms(): {
        ubo: {
            name: string;
            size: number;
            type: string;
        }[];
        fragment: string;
    };
    bindForSubMesh(uniformBuffer: UniformBuffer): void;
    getCustomCode(shaderType: string): {
        CUSTOM_FRAGMENT_BEFORE_FOG: string;
    } | null;
}
