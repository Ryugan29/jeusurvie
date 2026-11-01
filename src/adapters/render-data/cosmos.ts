// Voûte céleste (PUR, sans Babylon) : les étoiles, la voie lactée et la planète géante tournent ensemble, d'un tour par cycle
// jour + nuit, autour d'un pôle penché (adapters/babylon/sky-dome) ; des aurores dansent chaque nuit, plus ou moins fortes
// selon la nuit. Purement visuel : aucune règle de jeu n'en dépend.
import { hash2 } from '../../core/shared/hash';
import type { TimeOfDay } from '../../core/survival/time-of-day';

export interface Cosmos {
  /** Angle (rad, dans [0, 2π[) dont la voûte a tourné depuis le lever du jour. */
  readonly rotation: number;
  /** Force des aurores de cette nuit (AURORA_MIN à 1) ; le ciel ne les montre que de nuit, par temps dégagé. */
  readonly aurora: number;
}

/** Les aurores les plus faibles restent bien visibles. */
export const AURORA_MIN = 0.55;
const AURORA_SALT = 0xa0a0;

export function cosmosFor(time: TimeOfDay): Cosmos {
  const fraction = time.dayFraction - Math.floor(time.dayFraction);
  const h = hash2(0, time.day, 0, AURORA_SALT) / 0x100000000;
  return { rotation: 2 * Math.PI * fraction, aurora: AURORA_MIN + (1 - AURORA_MIN) * h };
}
