import { DAY_LENGTH_S, DUSK_LENGTH_S, NIGHT_LENGTH_S } from '../config/balance';

export type DayPhase = 'jour' | 'crepuscule' | 'nuit';

export interface TimeOfDay {
  /** Numéro du jour, à partir de 1. */
  readonly day: number;
  /** Position dans le cycle complet (jour + nuit) : 0 = lever du jour, tend vers 1 en fin de nuit. */
  readonly dayFraction: number;
  readonly phase: DayPhase;
}

const CYCLE_S = DAY_LENGTH_S + NIGHT_LENGTH_S;

/** Heure du monde à partir du temps de jeu écoulé (secondes). La partie commence au lever du jour. */
export function timeOfDay(elapsedSeconds: number): TimeOfDay {
  const elapsed = Number.isFinite(elapsedSeconds) && elapsedSeconds > 0 ? elapsedSeconds : 0;
  const cycles = Math.floor(elapsed / CYCLE_S);
  const inCycle = elapsed - cycles * CYCLE_S;
  const phase: DayPhase =
    inCycle < DAY_LENGTH_S - DUSK_LENGTH_S ? 'jour' : inCycle < DAY_LENGTH_S ? 'crepuscule' : 'nuit';
  return { day: cycles + 1, dayFraction: inCycle / CYCLE_S, phase };
}
