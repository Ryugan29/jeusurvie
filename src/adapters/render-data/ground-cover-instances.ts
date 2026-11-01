// Couvre-sol d'un chunk → matrices d'instances par modèle (PUR : n'importe pas Babylon), puis, à chaque déplacement du
// joueur, mise à portée et rétrécissement vers le bord du rayon de rendu (pas d'apparition brutale à la lisière).
import type { ChunkData } from '../../core/world/chunk';
import type { CoverItem } from '../../core/world/ground-cover';
import { instanceMatrices } from './instance-matrices';

/** Rayon (m) autour du joueur où le couvre-sol est dessiné, et largeur (m) de la bande où il rétrécit avant ce bord. */
export const COVER_RADIUS_M = 70;
export const COVER_FADE_M = 25;
/** Enfoncement dans le sol (m, × échelle) : les racines sont cachées, rien ne flotte sur une pente. */
export const COVER_SINK_M = 0.03;
/** Sous cette taille relative, une instance est invisible : on ne la dessine pas. */
const MIN_VISIBLE_SCALE = 0.02;
/** Indices de la partie rotation-échelle (3 × 3) d'une matrice 4 × 4 stockée ligne par ligne. */
const SCALED = [0, 1, 2, 4, 5, 6, 8, 9, 10] as const;

/**
 * Écrasement vertical des herbes : les modèles du pack mesurent 1,3 m (courte) et 1,8 m (haute) — posés tels quels, la prairie
 * montait aux hanches du perso et ressemblait à des touffes de roseaux. Écrasées, elles gardent leur largeur (le sol reste
 * couvert) et arrivent à la cheville ou à mi-mollet : 0,3 à 0,5 m, les hautes touffes jusqu'au genou.
 */
export const GRASS_HEIGHT_SCALE: Readonly<Record<string, number>> = { Grass_Common_Short: 0.4, Grass_Common_Tall: 0.45 };

/** Matrices d'instances (16 nombres chacune) des éléments d'un chunk, par clé de modèle. */
export function groundCoverInstances(items: readonly CoverItem[], chunk: ChunkData): Record<string, Float32Array> {
  return instanceMatrices(items, (i) => i.model, chunk, COVER_SINK_M, (model) => GRASS_HEIGHT_SCALE[model] ?? 1);
}

/**
 * Taille relative d'un élément à `distanceM` du joueur : 1 jusqu'à `radiusM − fadeM`, puis décroît en douceur
 * (3t² − 2t³) jusqu'à 0 au bord du rayon, et reste 0 au-delà.
 */
export function coverScaleAt(distanceM: number, radiusM: number, fadeM: number): number {
  const t = Math.min(1, Math.max(0, (radiusM - distanceM) / fadeM));
  return t * t * (3 - 2 * t);
}

/**
 * Copie dans `out`, à partir de l'instance `at`, les instances de `src` (16 nombres chacune) qui sont à portée du
 * joueur (px, pz), l'échelle multipliée par coverScaleAt ; la position et la hauteur ne changent pas. `src` n'est pas
 * modifié ; les instances invisibles (taille quasi nulle) et celles qui ne tiennent plus dans `out` sont ignorées.
 * @returns le nombre total d'instances dans `out` après l'écriture (at + celles écrites).
 */
export function shrinkInstances(src: Float32Array, px: number, pz: number, at: number, radiusM: number, fadeM: number, out: Float32Array): number {
  const capacity = Math.floor(out.length / 16);
  let n = at;
  for (let i = 0; i + 16 <= src.length && n < capacity; i += 16) {
    const dx = src[i + 12]! - px, dz = src[i + 14]! - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radiusM * radiusM) continue; // hors rayon : pas même besoin de la racine carrée
    const f = coverScaleAt(Math.sqrt(d2), radiusM, fadeM);
    if (f < MIN_VISIBLE_SCALE) continue;
    const o = n * 16;
    for (let k = 0; k < 16; k++) out[o + k] = src[i + k]!;
    for (const k of SCALED) out[o + k] = src[i + k]! * f;
    n++;
  }
  return n;
}

