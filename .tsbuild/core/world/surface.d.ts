export interface SurfaceVariation {
    /** Plaques (dizaines de mètres) : −1 = herbe plus foncée, +1 = plus claire. */
    readonly patch: number;
    /** Irrégularité de la limite de neige : −1 = plus basse, +1 = plus haute. */
    readonly snowJitter: number;
}
export declare function surfaceVariation(seed: number, x: number, z: number): SurfaceVariation;
