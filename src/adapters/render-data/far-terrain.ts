// Relief lointain (PUR : n'importe pas Babylon) : une grille grossière du VRAI terrain (heightAt), sur plusieurs kilomètres
// autour du joueur, au-delà des chunks chargés. Sans elle, le monde s'arrêtait à ~360 m sur un mur de brume : ni chaînes de
// montagnes, ni plans successifs. Calculé dans un worker (adapters/worker/far-terrain.worker), une fois par recentrage.
// Couleurs : la palette du sol (pente, altitude, neige, biome), plus la masse des forêts (forestFactorAt) — de loin, les bosquets
// se lisent en taches vert profond, les clairières en prairie claire, les groupes de feuillus d'automne en or.
import { smoothstep } from '../../core/shared/math';
import { biomeAt } from '../../core/world/biome';
import { forestFactorAt, treeLineAt } from '../../core/world/placement';
import { heightAt } from '../../core/world/terrain';
import { quadTriangles } from '../../core/world/triangulation';
import { AUTUMN_FROM, AUTUMN_FULL, AUTUMN_GROUP_M, valueNoise } from './foliage';
import { terrainColor, type Rgb } from './palette';

export interface FarTerrainOptions {
  /** Demi-côté (m) de la grille, centrée sur (centerX, centerZ). */
  readonly halfSizeM: number;
  /** Pas (m) entre deux sommets. */
  readonly stepM: number;
}

export interface FarTerrainMesh {
  /** Positions RELATIVES au centre (le maillage est placé au centre) : précision float32 gardée loin de l'origine. */
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** Couleurs RGBA. */
  readonly colors: Float32Array;
  readonly indices: Uint32Array;
}

/** Demande au worker du relief lointain (adapters/worker/far-terrain.worker). */
export interface FarTerrainRequest {
  readonly id: number;
  readonly seed: number;
  readonly centerX: number;
  readonly centerZ: number;
  readonly options: FarTerrainOptions;
}

/** Réponse du worker : le maillage, tampons transférés. */
export interface FarTerrainResult {
  readonly id: number;
  readonly centerX: number;
  readonly centerZ: number;
  readonly mesh: FarTerrainMesh;
}

/** Feuillage vu de loin : vert profond des feuillus, bleu-vert des pins (froid), or des groupes d'automne. */
export const CANOPY: Rgb = [0.16, 0.24, 0.09];
const PINE_CANOPY: Rgb = [0.11, 0.19, 0.14];
const AUTUMN_CANOPY: Rgb = [0.5, 0.32, 0.11];
/** Densité forestière (forestFactorAt) où la canopée commence à se voir, et où elle couvre tout. */
const CANOPY_FROM = 0.5, CANOPY_FULL = 1.8;
/** Part maximale de canopée (même un bosquet dense laisse voir un peu de sol entre les cimes). */
export const CANOPY_MAX = 0.85;
/** Pente (1 − normale.y) au-delà de laquelle les arbres ne tiennent plus. */
const CANOPY_SLOPE_FROM = 0.25, CANOPY_SLOPE_GONE = 0.4;
/** Plus de 2²⁰ sommets : un réglage absurde (et des indices trop lourds pour le worker). */
const MAX_VERTICES = 1 << 20;

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Couleur d'un point lointain : sol (palette) recouvert par la canopée là où il y a forêt. */
export function farColor(seed: number, x: number, z: number, height: number, normalY: number): Rgb {
  const { cold } = biomeAt(seed, x, z);
  const ground = terrainColor(height, normalY, { patch: 0, snowJitter: 0, cold, path: 0 });
  const slopeOk = 1 - smoothstep(CANOPY_SLOPE_FROM, CANOPY_SLOPE_GONE, 1 - normalY);
  const line = treeLineAt(cold);
  const belowLine = 1 - smoothstep(line - 10, line + 5, height);
  const canopy = CANOPY_MAX * smoothstep(CANOPY_FROM, CANOPY_FULL, forestFactorAt(seed, x, z)) * slopeOk * belowLine;
  if (canopy <= 0) return ground;
  const autumn = smoothstep(AUTUMN_FROM, AUTUMN_FULL, valueNoise(x / AUTUMN_GROUP_M + 0.37, z / AUTUMN_GROUP_M - 0.61));
  const leaves = mix(mix(CANOPY, AUTUMN_CANOPY, autumn * 0.6), PINE_CANOPY, cold);
  return mix(ground, leaves, canopy);
}

/** Centre de grille pour un joueur en (x, z) : aimanté sur `snapM`, pour que la grille ne glisse pas d'un recentrage à l'autre. */
export function farCenterFor(x: number, z: number, snapM: number): { x: number; z: number } {
  return { x: Math.round(x / snapM) * snapM + 0, z: Math.round(z / snapM) * snapM + 0 };
}

/**
 * Maillage du relief lointain centré sur (centerX, centerZ) : (2·n + 1)² sommets, n = round(halfSizeM / stepM).
 * @throws RangeError si le pas ou le demi-côté ne sont pas des nombres finis > 0, ou si la grille dépasse 2²⁰ sommets.
 */
export function buildFarTerrain(seed: number, centerX: number, centerZ: number, options: FarTerrainOptions): FarTerrainMesh {
  const { halfSizeM, stepM } = options;
  if (!(Number.isFinite(stepM) && stepM > 0 && Number.isFinite(halfSizeM) && halfSizeM > 0)) {
    throw new RangeError(`grille lointaine invalide : demi-côté ${halfSizeM}, pas ${stepM}`);
  }
  const n = Math.round(halfSizeM / stepM);
  const side = 2 * n + 1;
  if (side * side > MAX_VERTICES) throw new RangeError(`grille lointaine trop grande : ${side} × ${side}`);
  // Hauteurs avec une bordure d'un sommet (normales des bords).
  const w = side + 2;
  const h = new Float64Array(w * w);
  for (let r = 0; r < w; r++) {
    for (let c = 0; c < w; c++) h[r * w + c] = heightAt(seed, centerX + (c - 1 - n) * stepM, centerZ + (r - 1 - n) * stepM);
  }
  const positions = new Float32Array(side * side * 3);
  const normals = new Float32Array(side * side * 3);
  const colors = new Float32Array(side * side * 4);
  for (let r = 0; r < side; r++) {
    for (let c = 0; c < side; c++) {
      const i = r * side + c, k = (r + 1) * w + (c + 1);
      const lx = (c - n) * stepM, lz = (r - n) * stepM, y = h[k]!;
      positions.set([lx, y, lz], i * 3);
      // Normale par différences centrées : (−dh/dx, 1, −dh/dz), normalisée.
      const nx = (h[k - 1]! - h[k + 1]!) / (2 * stepM), nz = (h[k - w]! - h[k + w]!) / (2 * stepM);
      const len = Math.hypot(nx, 1, nz);
      normals.set([nx / len, 1 / len, nz / len], i * 3);
      const [cr, cg, cb] = farColor(seed, centerX + lx, centerZ + lz, y, 1 / len);
      colors.set([cr, cg, cb, 1], i * 4);
    }
  }
  const indices = new Uint32Array((side - 1) * (side - 1) * 6);
  let o = 0;
  for (let r = 0; r < side - 1; r++) {
    for (let c = 0; c < side - 1; c++) for (const index of quadTriangles(c, r, side)) indices[o++] = index;
  }
  return { positions, normals, colors, indices };
}
