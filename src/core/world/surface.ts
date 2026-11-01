// Variations d'aspect du sol, tirées de la graine (pures, déterministes). N'influencent PAS les hauteurs :
// elles servent au rendu (plaques d'herbe plus claires ou plus foncées, limite de la neige irrégulière).
// Le bruit restant interne à core/world, ce module l'expose sous une forme utile au rendu.
import { fbm2 } from './noise';

const PATCHES = { frequency: 1 / 90, octaves: 3, lacunarity: 2, gain: 0.5, salt: 31 } as const;
const SNOW_LINE = { frequency: 1 / 160, octaves: 2, lacunarity: 2, gain: 0.5, salt: 32 } as const;
/** Le fBm reste en pratique dans ±0,5 : on l'étire pour utiliser toute la plage [-1, 1]. */
const STRETCH = 2;

export interface SurfaceVariation {
  /** Plaques (dizaines de mètres) : −1 = herbe plus foncée, +1 = plus claire. */
  readonly patch: number;
  /** Irrégularité de la limite de neige : −1 = plus basse, +1 = plus haute. */
  readonly snowJitter: number;
}

const clamp1 = (v: number): number => Math.min(1, Math.max(-1, v));

export function surfaceVariation(seed: number, x: number, z: number): SurfaceVariation {
  return {
    patch: clamp1(STRETCH * fbm2(seed, x * PATCHES.frequency, z * PATCHES.frequency, PATCHES, PATCHES.salt)) + 0,
    snowJitter: clamp1(STRETCH * fbm2(seed, x * SNOW_LINE.frequency, z * SNOW_LINE.frequency, SNOW_LINE, SNOW_LINE.salt)) + 0,
  };
}
