// Biomes v1 (ADR 0004, docs/03-archi.md §5) : forêt tempérée et biome froid, à partir de cartes de température et
// d'humidité à très basse fréquence. Opérations de base seulement ; fait partie de genVersion 1.
import { hash2 } from '../shared/hash';
import { smoothstep } from '../shared/math';
import { fbm2 } from './noise';

/** Rayon (m) autour du départ où les deux biomes sont garantis. */
export const START_BIOME_RADIUS_M = 800;

const TEMPERATURE = { frequency: 1 / 3500, octaves: 3, lacunarity: 2, gain: 0.5, salt: 41 } as const;
const HUMIDITY = { frequency: 1 / 2500, octaves: 3, lacunarity: 2, gain: 0.5, salt: 42 } as const;
/** Le fBm reste en pratique dans ±0,5 : on l'étire. */
const STRETCH = 2.2;
/**
 * Départ : sur le disque de rayon START_BIOME_RADIUS_M, le froid suit une rampe le long d'une direction tirée de la
 * graine (8 directions fixes, sans trigonométrie) : forêt au centre, froid au-delà de ~0,44 R de ce côté-là. Entre
 * R et 2R, la rampe se fond dans les cartes normales. Les deux biomes sont ainsi garantis près du départ.
 */
const START_DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0], [0.7071067811865476, 0.7071067811865476], [0, 1], [-0.7071067811865476, 0.7071067811865476],
  [-1, 0], [-0.7071067811865476, -0.7071067811865476], [0, -1], [0.7071067811865476, -0.7071067811865476],
];
const START_SALT = 43;
const RAMP_AT_START = -0.8, RAMP_GAIN = 1.8;

/** Froid au-dessus de cette « froideur » (−1..1), avec une bande de mélange. */
const COLD_FROM = -0.15, COLD_TO = 0.15;

export interface Biome {
  /** Part du biome froid (0 = forêt tempérée, 1 = froid), continue près des frontières. */
  readonly cold: number;
  /** Humidité (0 = sec, 1 = humide) : module la densité de végétation. */
  readonly humidity: number;
}

export function biomeAt(seed: number, x: number, z: number): Biome {
  const base = -STRETCH * fbm2(seed, x * TEMPERATURE.frequency, z * TEMPERATURE.frequency, TEMPERATURE, TEMPERATURE.salt);
  const [dx, dz] = START_DIRECTIONS[hash2(seed, 0, 0, START_SALT) & 7]!;
  const ramp = Math.min(1, Math.max(-1, RAMP_AT_START + (RAMP_GAIN * (x * dx + z * dz)) / START_BIOME_RADIUS_M));
  const away = smoothstep(START_BIOME_RADIUS_M, 2 * START_BIOME_RADIUS_M, Math.sqrt(x * x + z * z));
  const coldness = ramp * (1 - away) + base * away;
  const humidity = Math.min(1, Math.max(0, 0.5 + STRETCH * fbm2(seed, x * HUMIDITY.frequency, z * HUMIDITY.frequency, HUMIDITY, HUMIDITY.salt)));
  return { cold: smoothstep(COLD_FROM, COLD_TO, coldness), humidity: humidity + 0 };
}
