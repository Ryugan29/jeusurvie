/** Une image plus longue (onglet en arrière-plan, gros ralentissement) compte pour cette durée. */
export declare const MAX_FRAME_MS = 250;
export interface AdvanceResult {
    /** Nombre de ticks de simulation à jouer pour cette image. */
    readonly steps: number;
    /** Temps restant, à reporter à l'image suivante (toujours < stepMs). */
    readonly accMs: number;
    /** Avancement vers le prochain tick, dans [0, 1) : sert à interpoler le rendu. */
    readonly alpha: number;
}
export declare function advance(accMs: number, frameMs: number, stepMs: number, maxSteps?: number): AdvanceResult;
