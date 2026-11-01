import type { TimeOfDay } from '../../core/survival/time-of-day';
export interface Cosmos {
    /** Angle (rad, dans [0, 2π[) dont la voûte a tourné depuis le lever du jour. */
    readonly rotation: number;
    /** Force des aurores de cette nuit (AURORA_MIN à 1) ; le ciel ne les montre que de nuit, par temps dégagé. */
    readonly aurora: number;
}
/** Les aurores les plus faibles restent bien visibles. */
export declare const AURORA_MIN = 0.55;
export declare function cosmosFor(time: TimeOfDay): Cosmos;
