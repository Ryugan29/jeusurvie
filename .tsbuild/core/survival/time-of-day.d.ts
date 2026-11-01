export type DayPhase = 'jour' | 'crepuscule' | 'nuit';
export interface TimeOfDay {
    /** Numéro du jour, à partir de 1. */
    readonly day: number;
    /** Position dans le cycle complet (jour + nuit) : 0 = lever du jour, tend vers 1 en fin de nuit. */
    readonly dayFraction: number;
    readonly phase: DayPhase;
}
/** Heure du monde à partir du temps de jeu écoulé (secondes). La partie commence au lever du jour. */
export declare function timeOfDay(elapsedSeconds: number): TimeOfDay;
