export declare const LENS: {
    /** Temps caractéristique (s) pour que l'objectif se couvre de gouttes. */
    readonly wetUpS: 1.2;
    /** Temps caractéristique (s) pour qu'il sèche après la pluie. */
    readonly dryS: 5;
    /** Part des gouttes gardée caméra baissée (le regard vers le sol protège un peu l'objectif). */
    readonly lookDownShare: 0.4;
    /** Inclinaison (rad, positive vers le bas) où les gouttes sont au minimum, et où elles sont au maximum (regard vers le ciel). */
    readonly pitchDown: 0.7;
    readonly pitchUp: -0.35;
};
/** Densité de gouttes visée (0 à 1) pour une pluie `rain` (0 à 1) et une inclinaison de caméra `pitch` (rad, + = vers le bas). */
export declare function lensRainTarget(rain: number, pitch: number): number;
/** Densité de gouttes après `dtS` secondes : rejoint `target` sans la dépasser, vite en montée, lentement en séchant. */
export declare function stepLensWetness(current: number, target: number, dtS: number): number;
