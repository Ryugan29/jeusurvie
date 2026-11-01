import type { ChunkData } from '../../core/world/chunk';
import type { CoverItem } from '../../core/world/ground-cover';
import { type ViewSector } from './view-sector';
/** Rayon (m) autour du joueur où le couvre-sol est dessiné, et largeur (m) de la bande où il rétrécit avant ce bord. */
export declare const COVER_RADIUS_M = 70;
export declare const COVER_FADE_M = 25;
/** Enfoncement dans le sol (m, × échelle) : les racines sont cachées, rien ne flotte sur une pente. */
export declare const COVER_SINK_M = 0.03;
/**
 * Écrasement vertical des herbes : les modèles du pack mesurent 1,3 m (courte) et 1,8 m (haute) — posés tels quels, la prairie
 * montait aux hanches du perso et ressemblait à des touffes de roseaux. Écrasées, elles gardent leur largeur (le sol reste
 * couvert) et arrivent à la cheville ou à mi-mollet : 0,3 à 0,5 m, les hautes touffes jusqu'au genou.
 */
export declare const GRASS_HEIGHT_SCALE: Readonly<Record<string, number>>;
/** Matrices d'instances (16 nombres chacune) des éléments d'un chunk, par clé de modèle. */
export declare function groundCoverInstances(items: readonly CoverItem[], chunk: ChunkData): Record<string, Float32Array>;
/**
 * Taille relative d'un élément à `distanceM` du joueur : 1 jusqu'à `radiusM − fadeM`, puis décroît en douceur
 * (3t² − 2t³) jusqu'à 0 au bord du rayon, et reste 0 au-delà.
 */
export declare function coverScaleAt(distanceM: number, radiusM: number, fadeM: number): number;
/**
 * Garde-t-on l'élément posé en (x, z) quand seule une part `density` (0 à 1) du couvre-sol est dessinée ? Tirage fixe par
 * position (toujours le même élément gardé, aucun scintillement), réparti sans motif.
 */
export declare function coverKept(x: number, z: number, density: number): boolean;
/**
 * Copie dans `out`, à partir de l'instance `at`, les instances de `src` (16 nombres chacune) qui sont à portée du
 * joueur (px, pz), l'échelle multipliée par coverScaleAt ; la position et la hauteur ne changent pas. `src` n'est pas
 * modifié ; les instances invisibles (taille quasi nulle), celles écartées par la densité (coverKept) et celles qui ne
 * tiennent plus dans `out` sont ignorées.
 * @returns le nombre total d'instances dans `out` après l'écriture (at + celles écrites).
 */
export declare function shrinkInstances(src: Float32Array, px: number, pz: number, at: number, radiusM: number, fadeM: number, out: Float32Array, density?: number, view?: {
    readonly sector: ViewSector;
    readonly x: number;
    readonly z: number;
}): number;
