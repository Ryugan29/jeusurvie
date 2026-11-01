import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import '@babylonjs/core/Engines/Extensions/engine.alphaToCoverage';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Scene } from '@babylonjs/core/scene';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { type FoliageProfile } from '../render-data/foliage';
/** Le vent, partagé par tous les matériaux de végétation : l'heure (s) avance à chaque image, la force coupe tout (?vent=0). */
export interface WindState {
    timeS: number;
    strength: number;
    /** Lumière de l'astre qui traverse les feuilles et les brins (mise à jour à chaque image ; absente : pas de translucidité). */
    sun?: SunGlow;
}
/** L'astre vu par la végétation : direction VERS lui (unitaire), couleur, force (0 la nuit sans lune, 1 en plein soleil). */
export interface SunGlow {
    readonly toSun: [number, number, number];
    readonly color: [number, number, number];
    strength: number;
}
export declare class FoliagePlugin extends MaterialPluginBase {
    private readonly profile;
    private readonly wind;
    constructor(material: Material, profile: FoliageProfile, wind: WindState);
    getClassName(): string;
    isCompatible(shaderLanguage: ShaderLanguage): boolean;
    prepareDefines(defines: Record<string, unknown>): void;
    getUniforms(): {
        ubo: {
            name: string;
            size: number;
            type: string;
        }[];
        vertex: string;
        fragment: string;
    };
    bindForSubMesh(uniformBuffer: UniformBuffer, _scene?: Scene, engine?: AbstractEngine): void;
    getCustomCode(shaderType: string): Record<string, string> | null;
}
