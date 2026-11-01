import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import type { Scene } from '@babylonjs/core/scene';
import { type FarTerrainOptions, type FarTerrainRequest, type FarTerrainResult } from '../render-data/far-terrain';
/** Ce que le rendu attend du worker (un vrai Web Worker, ou un faux dans les tests). */
export interface FarTerrainWorkerLike {
    post(request: FarTerrainRequest): void;
    onResult(handler: (result: FarTerrainResult) => void): void;
}
export interface FarTerrainRendererOptions extends FarTerrainOptions {
    /** Rayon (m) autour du joueur où les chunks chargés sont dessinés : le relief lointain n'y est pas dessiné. */
    readonly innerRadiusM: number;
    /** Distance (m) du joueur au centre de la grille au-delà de laquelle elle est recalculée (aimantée sur ce pas). */
    readonly recenterM: number;
    /** Enfoncement (m) : dans la bande où chunks et relief lointain se recouvrent, le relief grossier reste dessous. */
    readonly sinkM: number;
}
/** Groupe de rendu du relief lointain : après la scène (groupe 0). */
export declare const FAR_TERRAIN_GROUP = 1;
/** Jette ce qui est sous les chunks chargés, fond le bord de la grille dans la brume. */
export declare class FarTerrainPlugin extends MaterialPluginBase {
    private readonly innerRadiusM;
    private readonly halfSizeM;
    private playerX;
    private playerZ;
    private centerX;
    private centerZ;
    constructor(material: Material, innerRadiusM: number, halfSizeM: number);
    setPlayer(x: number, z: number): void;
    setCenter(x: number, z: number): void;
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
    getCustomCode(shaderType: string): Record<string, string> | null;
}
/** Assombrissement du relief lointain détrempé : celui du sol proche (WET_DARKEN), moyenné entre pentes et plats. */
export declare const FAR_WET_DARKEN: number;
export declare class FarTerrainRenderer {
    private readonly scene;
    private readonly seed;
    private readonly options;
    private readonly worker;
    /** Matériau du relief lointain (la brume de hauteur s'y branche). */
    readonly material: StandardMaterial;
    private readonly plugin;
    private mesh;
    private shownCenter;
    private pendingId;
    private nextId;
    constructor(scene: Scene, seed: number, options: FarTerrainRendererOptions, worker: FarTerrainWorkerLike);
    /** Sol mouillé par la météo (0 = sec, 1 = détrempé) : le relief lointain fonce comme le sol proche. */
    setWetness(wetness: number): void;
    /** Centre de la grille affichée (undefined tant que le premier calcul n'est pas arrivé). */
    get center(): {
        x: number;
        z: number;
    } | undefined;
    /** À chaque image : position du joueur pour le shader ; demande un recentrage quand il s'est éloigné (un seul calcul à la fois). */
    update(playerX: number, playerZ: number): void;
    private show;
    dispose(): void;
}
/** Le vrai Web Worker du relief lointain (module ES, servi par Vite). */
export declare function createFarTerrainWorker(): FarTerrainWorkerLike;
