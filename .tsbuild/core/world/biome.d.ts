/** Rayon (m) autour du départ où les deux biomes sont garantis. */
export declare const START_BIOME_RADIUS_M = 800;
export interface Biome {
    /** Part du biome froid (0 = forêt tempérée, 1 = froid), continue près des frontières. */
    readonly cold: number;
    /** Humidité (0 = sec, 1 = humide) : module la densité de végétation. */
    readonly humidity: number;
}
export declare function biomeAt(seed: number, x: number, z: number): Biome;
