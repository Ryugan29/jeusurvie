import { type FarTerrainMesh, type FarTerrainOptions } from '../render-data/far-terrain';
export interface FarTerrainRequest {
    readonly id: number;
    readonly seed: number;
    readonly centerX: number;
    readonly centerZ: number;
    readonly options: FarTerrainOptions;
}
export interface FarTerrainResult {
    readonly id: number;
    readonly centerX: number;
    readonly centerZ: number;
    readonly mesh: FarTerrainMesh;
}
