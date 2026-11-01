// Palette du terrain (ADR 0009, style stylisé coloré « fantasy ») : pure, sans Babylon.
// Couleur d'un sommet selon sa hauteur (m), sa pente (composante verticale de la normale, 1 = plat) et les
// variations de surface tirées de la graine (plaques d'herbe, irrégularité de la limite de neige).
// Les teintes de base (mousse, herbe, prairie, roche, neige) sont celles validées par José ; la terre s'ajoute.
// Les sentiers (core/world/paths) y ajoutent une terre claire et chaude, effacée sur les pentes, la roche et la neige.
import { smoothstep } from '../../core/shared/math';

export type Rgb = readonly [number, number, number];

/** Variations de surface au sommet (voir core/world/surface), chacune dans [-1, 1]. */
export interface SurfaceTint {
  readonly patch: number;
  readonly snowJitter: number;
  /** Part du biome froid (0 = forêt tempérée, 1 = froid). */
  readonly cold: number;
  /** Part de sentier de terre (core/world/paths) : 0 = hors sentier, 1 = milieu du sentier. */
  readonly path: number;
}

const MOSS: Rgb = [0.34, 0.5, 0.16]; // creux : vert olive sombre
const GRASS: Rgb = [0.48, 0.68, 0.22]; // herbe, vert-jaune doux (aperçus du pack nature)
const MEADOW: Rgb = [0.66, 0.74, 0.28]; // prairie jaune-ocre des hauteurs et des plaques claires
const DIRT: Rgb = [0.52, 0.41, 0.28]; // terre des pentes moyennes
const COLD_GRASS: Rgb = [0.6, 0.72, 0.7]; // herbe rase du biome froid : pâle, bleutée
const ROCK: Rgb = [0.56, 0.5, 0.46]; // roche chaude
const SNOW: Rgb = [0.95, 0.96, 1]; // neige
const PATH_DIRT: Rgb = [0.78, 0.64, 0.42]; // terre battue des sentiers : beige clair, plus claire et plus chaude que l'herbe et la prairie ocre

/** Écart de luminosité des plaques d'herbe (± 18 %). */
const PATCH_CONTRAST = 0.18;
/** Part de « prairie dorée » ajoutée ou retirée par les plaques (mélange de deux teintes de base existantes). */
const PATCH_MEADOW = 0.45;
/** Pente (1 − normale.y) où la terre apparaît / couvre tout ; puis où la roche apparaît / couvre tout. */
const DIRT_FROM = 0.08, DIRT_FULL = 0.16;
const ROCK_FROM = 0.2, ROCK_FULL = 0.34;
/** Dans le froid : la roche apparaît dès une pente moyenne. */
const COLD_ROCK_FROM = 0.08, COLD_ROCK_FULL = 0.15;
/** Pente (1 − normale.y) où le sentier commence à s'effacer, et où il a disparu (la roche prend le relais). */
const PATH_SLOPE_FROM = 0.06, PATH_SLOPE_GONE = 0.14;
/** Abaissement de la limite de neige dans le froid (m). */
const COLD_SNOW_DROP = 70;
/** Limite moyenne de la neige (m), son irrégularité (± m) et la largeur de la transition (m). */
const SNOW_LINE = 182, SNOW_JITTER_M = 15, SNOW_BAND = 6;

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Parts successives des couches (chacune recouvre ce qui précède) : terre de pente, roche, sentier, neige. */
interface Coverage {
  readonly dirtT: number;
  readonly rockT: number;
  readonly pathT: number;
  readonly snowT: number;
}

function coverage(height: number, normalY: number, tint: SurfaceTint): Coverage {
  const steepness = 1 - normalY;
  const rockFrom = ROCK_FROM + (COLD_ROCK_FROM - ROCK_FROM) * tint.cold;
  const rockFull = ROCK_FULL + (COLD_ROCK_FULL - ROCK_FULL) * tint.cold;
  const rockT = smoothstep(rockFrom, rockFull, steepness);
  // Sentier de terre : par-dessus l'herbe, effacé sur les pentes et la roche (la neige le recouvre plus bas, par snowT).
  const pathT = tint.path * (1 - smoothstep(PATH_SLOPE_FROM, PATH_SLOPE_GONE, steepness)) * (1 - rockT);
  // Neige des sommets, limite irrégulière ; elle tient mal sur les pentes raides.
  const line = SNOW_LINE - COLD_SNOW_DROP * tint.cold + SNOW_JITTER_M * tint.snowJitter;
  const snowT = smoothstep(line - SNOW_BAND, line + SNOW_BAND, height) * (1 - 0.7 * rockT);
  return { dirtT: smoothstep(DIRT_FROM, DIRT_FULL, steepness), rockT, pathT, snowT };
}

export function terrainColor(height: number, normalY: number, tint: SurfaceTint): Rgb {
  const low = mix(MOSS, GRASS, smoothstep(-20, 0, height));
  const meadowT = Math.min(1, Math.max(0, smoothstep(4, 16, height) + PATCH_MEADOW * tint.patch));
  const base = mix(mix(low, MEADOW, meadowT), COLD_GRASS, tint.cold);
  // Plaques d'herbe : même teinte, plus claire ou plus foncée.
  const k = 1 + PATCH_CONTRAST * tint.patch;
  const grass: Rgb = [Math.min(1, base[0] * k), Math.min(1, base[1] * k), Math.min(1, base[2] * k)];
  const { dirtT, rockT, pathT, snowT } = coverage(height, normalY, tint);
  const slopeGround = mix(mix(grass, DIRT, dirtT), ROCK, rockT);
  return mix(mix(slopeGround, PATH_DIRT, pathT), SNOW, snowT);
}

/** Poids des textures peintes du sol (render-data/painted-ground) ; l'herbe prend le reste (1 − soil − rock − snow). */
export interface TerrainLayers {
  readonly soil: number;
  readonly rock: number;
  readonly snow: number;
}

/** Mêmes limites que terrainColor : la terre des pentes et des sentiers, la roche, la neige, chacune recouvrant la précédente. */
export function terrainLayers(height: number, normalY: number, tint: SurfaceTint): TerrainLayers {
  const { dirtT, rockT, pathT, snowT } = coverage(height, normalY, tint);
  const notSnow = 1 - snowT;
  return {
    soil: (dirtT * (1 - rockT) * (1 - pathT) + pathT) * notSnow,
    rock: rockT * (1 - pathT) * notSnow,
    snow: snowT,
  };
}
