// Placement des ressources (végétation, rochers) sur une grille GLOBALE (docs/03-archi.md §5) : au plus une ressource
// par case, id stable « r:{gx}:{gz} », type selon le biome, la pente et l'altitude ; décalage, rotation et échelle tirés
// du hash ; rien ne pousse sur un sentier de terre (paths.ts). Les arbres se groupent en bosquets séparés par des
// clairières (forestFactorAt, bruit basse fréquence). Indépendant du découpage en chunks. Fait partie de genVersion 1
// (opérations de base seulement).
import { hash2 } from '../shared/hash';
import { smoothstep } from '../shared/math';
import { biomeAt } from './biome';
import { CHUNK_SIZE } from './chunk';
import { fbm2 } from './noise';
import { pathAt } from './paths';
import { heightAt } from './terrain';

/** Côté d'une case de la grille des ressources (m) : divise CHUNK_SIZE. */
export const RESOURCE_CELL_M = 8;
const CELLS_PER_CHUNK = CHUNK_SIZE / RESOURCE_CELL_M;

/** Au-dessus de cette part de sentier (pathAt), rien ne pousse : le sentier reste dégagé. */
export const PATH_CLEAR_THRESHOLD = 0.3;
/** Rayon (m) autour du point de départ laissé libre. */
export const SPAWN_CLEAR_RADIUS_M = 3;
/** Pente maximale (dénivelé par mètre) où pousse un arbre. */
export const TREE_MAX_SLOPE = 0.6;
const BUSH_MAX_SLOPE = 0.75;
const PLANT_MAX_SLOPE = 0.9;
const ROCK_MAX_SLOPE = 1.4;

/** Nombre de variantes tirées par case (voir resource-models : chaque type les répartit entre ses modèles). */
export const VARIANT_COUNT = 16;

export type ResourceKind = 'tree' | 'pine' | 'bush' | 'rock' | 'grass' | 'flowers';

export interface Resource {
  /** Identifiant stable : « r:{gx}:{gz} » (case de la grille globale). */
  readonly id: string;
  readonly kind: ResourceKind;
  /** Variante du modèle, entier de 0 à VARIANT_COUNT − 1 (resource-models en tire le modèle). */
  readonly variant: number;
  readonly x: number;
  readonly z: number;
  /** Rotation autour de la verticale, en tours (dans [0, 1)). */
  readonly rotation: number;
  /** Échelle uniforme, dans [RESOURCE_SCALE_MIN ; RESOURCE_SCALE_MAX] (0,8 à 1,25). */
  readonly scale: number;
}

export const RESOURCE_SCALE_MIN = 0.8;
const RESOURCE_SCALE_SPAN = 0.45;
export const RESOURCE_SCALE_MAX = RESOURCE_SCALE_MIN + RESOURCE_SCALE_SPAN;

/** Limite des arbres (m) : plus basse dans le froid. */
export function treeLineAt(cold: number): number {
  return 150 - 60 * cold;
}

/** Bosquets et clairières : bruit à ~90 m de maille, étiré (le fBm reste en pratique dans ±0,5), puis seuillé en douceur. */
const FOREST = { frequency: 1 / 90, octaves: 2, lacunarity: 2, gain: 0.5, salt: 71 } as const;
const FOREST_STRETCH = 2.2;
/** Le facteur va de FOREST_FLOOR (clairière) à FOREST_FLOOR + FOREST_SPAN (bosquet) ; sa moyenne vaut ≈ 1 (mesurée sur le bruit). */
const FOREST_FLOOR = 0.05, FOREST_SPAN = 2.4;
/** Valeurs du bruit où la clairière finit et où le plein bosquet commence : ≈ 40 % du pays en clairière, un tiers en bosquet. */
const FOREST_FROM = -0.15, FOREST_TO = 0.35;
export const FOREST_FACTOR_MAX = FOREST_FLOOR + FOREST_SPAN;

/**
 * Densité forestière relative au point (x, z) : multiplie la probabilité d'un arbre. ≈ 0,1 dans une clairière,
 * ≈ 2,4 au cœur d'un bosquet, 1 en moyenne : le nombre d'arbres reste du même ordre qu'avec une répartition uniforme.
 * Sert aussi au couvre-sol (sous-bois : fougères et plantes là où la forêt est dense).
 */
export function forestFactorAt(seed: number, x: number, z: number): number {
  const n = FOREST_STRETCH * fbm2(seed, x * FOREST.frequency, z * FOREST.frequency, FOREST, FOREST.salt);
  return FOREST_FLOOR + FOREST_SPAN * smoothstep(FOREST_FROM, FOREST_TO, n);
}

/** Part de cases occupées au plus (bosquet dense humide : tous les types additionnés, ≈ 0,77) : au-delà du tirage, la case est vide. */
const MAX_OCCUPANCY = 0.8;

const SALT_KIND = 51, SALT_SPOT = 52, SALT_LOOK = 53;
const UNIT = 1 / 65536;

/** Ressources des cases [gx0, gx1) × [gz0, gz1), dans l'ordre des cases (z puis x). */
export function resourcesInCells(seed: number, gx0: number, gz0: number, gx1: number, gz1: number): Resource[] {
  const out: Resource[] = [];
  for (let gz = gz0; gz < gz1; gz++) {
    for (let gx = gx0; gx < gx1; gx++) {
      const r = resourceInCell(seed, gx, gz);
      if (r !== undefined) out.push(r);
    }
  }
  return out;
}

/** Ressources du chunk (cx, cz) : les cases qui le composent. */
export function resourcesInChunk(seed: number, cx: number, cz: number): Resource[] {
  return resourcesInCells(seed, cx * CELLS_PER_CHUNK, cz * CELLS_PER_CHUNK, (cx + 1) * CELLS_PER_CHUNK, (cz + 1) * CELLS_PER_CHUNK);
}

function resourceInCell(seed: number, gx: number, gz: number): Resource | undefined {
  const kindHash = hash2(seed, gx, gz, SALT_KIND);
  const roll = (kindHash & 0xffff) * UNIT;
  // Rien du tout dans 20 % des cases au moins : évite de calculer le terrain pour rien.
  if (roll >= MAX_OCCUPANCY) return undefined;
  const spot = hash2(seed, gx, gz, SALT_SPOT);
  const x = (gx + 0.15 + 0.7 * (spot & 0xffff) * UNIT) * RESOURCE_CELL_M;
  const z = (gz + 0.15 + 0.7 * (spot >>> 16) * UNIT) * RESOURCE_CELL_M;
  const { cold, humidity } = biomeAt(seed, x, z);
  const forest = cold < 0.5;
  // Probabilités cumulées par type (la somme reste < MAX_OCCUPANCY : arbres au plus 0,47, autres types 0,33 au plus).
  const grove = forestFactorAt(seed, x, z);
  const treeP = (0.1 + 0.08 * humidity) * grove;
  const kinds: [ResourceKind, number][] = [
    [forest ? 'tree' : 'pine', treeP],
    ['bush', 0.03 + 0.02 * grove],
    ['rock', 0.03 + 0.05 * cold],
    ['grass', 0.12 * (1 - 0.5 * cold)],
    ['flowers', forest ? 0.05 : 0],
  ];
  let acc = 0;
  let kind: ResourceKind | undefined;
  for (const [k, p] of kinds) {
    acc += p;
    if (roll < acc) {
      kind = k;
      break;
    }
  }
  if (kind === undefined) return undefined;
  // Départ dégagé.
  if (x * x + z * z < SPAWN_CLEAR_RADIUS_M * SPAWN_CLEAR_RADIUS_M) return undefined;
  // Terrain : pente (dénivelé par mètre, sur 1 m) et altitude.
  const h = heightAt(seed, x, z);
  const slope = Math.max(Math.abs(heightAt(seed, x + 1, z) - h), Math.abs(heightAt(seed, x, z + 1) - h));
  const maxSlope = kind === 'tree' || kind === 'pine' ? TREE_MAX_SLOPE : kind === 'bush' ? BUSH_MAX_SLOPE : kind === 'rock' ? ROCK_MAX_SLOPE : PLANT_MAX_SLOPE;
  if (slope > maxSlope) return undefined;
  // Ni arbres ni plantes au-dessus de la limite des arbres (les rochers, si).
  if (kind !== 'rock' && h >= treeLineAt(cold)) return undefined;
  // Le sentier de terre reste dégagé (calculé en dernier : seulement pour les ressources qui survivent aux tests).
  if (pathAt(seed, x, z) > PATH_CLEAR_THRESHOLD) return undefined;
  const look = hash2(seed, gx, gz, SALT_LOOK);
  return {
    id: `r:${gx}:${gz}`,
    kind,
    variant: ((kindHash >>> 16) & 0xffff) % VARIANT_COUNT,
    x,
    z,
    rotation: (look & 0xffff) * UNIT,
    scale: RESOURCE_SCALE_MIN + RESOURCE_SCALE_SPAN * (look >>> 16) * UNIT,
  };
}
