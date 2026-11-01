import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { ChunkMeshData } from '../render-data/mesh-data';
import type { TerrainQuality } from '../render-data/quality';
/** Part de l'éclairage d'environnement (le ciel de l'heure) que le sol reçoit, en plus de la lumière d'ambiance de la scène. */
export declare const TERRAIN_ENVIRONMENT_INTENSITY = 0.3;
export declare class TerrainRenderer {
    private readonly scene;
    private readonly meshes;
    /** Matériau partagé par tous les chunks (la brume de hauteur s'y branche). */
    readonly material: PBRMaterial;
    private readonly surface;
    private textures;
    private quality;
    constructor(scene: Scene, quality: TerrainQuality);
    /** Profil graphique : nouvelle taille de textures (refaites sur la carte graphique), filtrage, reliefs. */
    setQuality(quality: TerrainQuality): void;
    get textureSize(): number;
    /** Pluie qui tombe (0 à 1 : les flaques ondulent) et horloge réelle (s) des ondulations. */
    setRain(rain: number, timeS: number): void;
    /** Sol mouillé par la météo (0 = sec, 1 = détrempé). */
    setWetness(wetness: number): void;
    get size(): number;
    has(key: string): boolean;
    add(key: string, cx: number, cz: number, data: ChunkMeshData): void;
    remove(key: string): void;
    dispose(): void;
}
