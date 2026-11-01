import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { ChunkMeshData } from '../render-data/mesh-data';
import type { Rgb } from '../render-data/palette';
/** Côté (px) de chaque texture peinte : 512 px sur 3 à 8 m, soit moins de 2 cm par pixel de près. */
export declare const PAINTED_TEXTURE_SIZE = 512;
export declare class TerrainRenderer {
    private readonly scene;
    private readonly meshes;
    /** Matériau partagé par tous les chunks (la brume de hauteur s'y branche). */
    readonly material: StandardMaterial;
    private readonly ground;
    constructor(scene: Scene);
    /** Reflets de pluie : couleurs du ciel (près de l'horizon, au zénith), pluie qui fait onduler les flaques, horloge réelle (s). */
    setSkyReflection(horizon: Rgb, zenith: Rgb, rain: number, timeS: number): void;
    /** Sol mouillé par la météo (0 = sec, 1 = détrempé). */
    setWetness(wetness: number): void;
    get size(): number;
    has(key: string): boolean;
    add(key: string, cx: number, cz: number, data: ChunkMeshData): void;
    remove(key: string): void;
}
