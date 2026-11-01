// Sentiers de terre : lignes de niveau 0 d'un fBm basse fréquence, déformé (« domain warp ») pour qu'elles serpentent.
// Pur et déterministe (opérations de base seulement, comme le reste de core/world) ; ne lit ni hauteur ni pente :
// l'appelant décide d'atténuer le sentier sur la pente, la roche ou la neige (rendu) ou de le laisser (placement).
import { smoothstep } from '../shared/math';
import { fbm2 } from './noise';

/** Réseau : un fBm dont les lignes de niveau 0 sont les sentiers (un croisement environ tous les 100 m). */
const NETWORK = { frequency: 1 / 110, octaves: 2, lacunarity: 2, gain: 0.5, salt: 61 } as const;
/** Déformation du domaine : décale les coordonnées d'au plus 20 m (x avec `salt`, z avec `saltZ`) → lacets doux. */
const WARP = { frequency: 1 / 110, octaves: 2, lacunarity: 2, gain: 0.5, salt: 63, saltZ: 64, amplitude: 20 } as const;

/** Demi-largeur (m) du cœur du sentier (valeur 1) et distance (m) où la valeur retombe à 0 : ≈ 2,4 m à mi-hauteur. */
const CORE_HALF_WIDTH_M = 0.5;
const EDGE_HALF_WIDTH_M = 1.9;
/** Pas (m) de la différence finie qui donne la pente du réseau, donc la distance au sentier en mètres. */
const GRADIENT_STEP_M = 0.5;
/** Pente minimale du réseau (par mètre) : évite une division par ~0 aux sommets du bruit (le sentier s'y rétrécit). */
const MIN_GRADIENT = 0.002;
/**
 * Au-delà de cette valeur du réseau on est forcément à plus de EDGE_HALF_WIDTH_M d'un sentier : la pente mesurée
 * du réseau ne dépasse jamais 0,03 par mètre (≈ 0,065 au pire théorique), soit 1,9 m × 0,065 ≈ 0,12 < 0,15.
 */
const FAR_FROM_PATH = 0.15;

function networkAt(seed: number, x: number, z: number): number {
  const wx = x + WARP.amplitude * fbm2(seed, x * WARP.frequency, z * WARP.frequency, WARP, WARP.salt);
  const wz = z + WARP.amplitude * fbm2(seed, x * WARP.frequency, z * WARP.frequency, WARP, WARP.saltZ);
  return fbm2(seed, wx * NETWORK.frequency, wz * NETWORK.frequency, NETWORK, NETWORK.salt);
}

/**
 * Part de sentier de terre au point (x, z) du monde, dans [0, 1] : 1 au milieu du sentier, 0 hors sentier, bord adouci.
 * Le sentier fait ≈ 2,4 m de large (largeur mesurée en mètres : le réseau est divisé par sa pente), et on en croise un
 * tous les 100 m environ, sans quadrillage. Fait partie de genVersion 1 : les paramètres ci-dessus sont figés.
 * @param seed graine du monde, entier non signé 32 bits (validée à la frontière).
 */
export function pathAt(seed: number, x: number, z: number): number {
  const f = networkAt(seed, x, z);
  const distanceToZero = Math.abs(f);
  if (distanceToZero > FAR_FROM_PATH) return 0;
  const gx = (networkAt(seed, x + GRADIENT_STEP_M, z) - f) / GRADIENT_STEP_M;
  const gz = (networkAt(seed, x, z + GRADIENT_STEP_M) - f) / GRADIENT_STEP_M;
  // Distance (m) au sentier le plus proche : valeur du réseau / pente du réseau (approximation du premier ordre).
  const distance = distanceToZero / Math.max(Math.sqrt(gx * gx + gz * gz), MIN_GRADIENT);
  return 1 - smoothstep(CORE_HALF_WIDTH_M, EDGE_HALF_WIDTH_M, distance);
}
