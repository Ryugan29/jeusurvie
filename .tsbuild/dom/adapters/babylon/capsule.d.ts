export declare const CAPSULE_OPTIONS: {
    readonly height: 1.8;
    readonly radius: 0.35;
    readonly tessellation: 16;
};
/** Point le plus bas du maillage capsule, relatif à son origine (mesuré sur les sommets réels de Babylon). */
export declare function capsuleMinY(options: {
    readonly height: number;
    readonly radius: number;
    readonly tessellation: number;
}): number;
