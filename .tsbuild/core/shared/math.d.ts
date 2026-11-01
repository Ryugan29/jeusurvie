/** Transition douce (dérivée nulle aux bords) : 0 si x ≤ edge0, 1 si x ≥ edge1, 3t² − 2t³ entre les deux. */
export declare function smoothstep(edge0: number, edge1: number, x: number): number;
