// ÉQUILIBRAGE : toutes les valeurs de réglage du jeu, durées en secondes (CLAUDE.md).
// Les paramètres du générateur de monde n'y sont PAS (ils changent le monde) : voir core/world/params.ts.

/** Fréquence de la simulation (ticks par seconde). */
export const SIM_HZ = 30;

/** Durée du jour, crépuscule compris, en secondes. */
export const DAY_LENGTH_S = 14 * 60;
/** Durée du crépuscule : les dernières secondes du jour. */
export const DUSK_LENGTH_S = 2 * 60;
/** Durée de la nuit, en secondes. */
export const NIGHT_LENGTH_S = 6 * 60;

/** Vitesse de marche du joueur, en mètres par seconde. */
export const PLAYER_WALK_SPEED_MPS = 5;
/** Rayon du joueur vu du dessus (m) : distance qu'il garde entre son centre et le bord d'un obstacle. */
export const PLAYER_RADIUS_M = 0.35;
/** Pente maximale que le joueur peut gravir (dénivelé / distance : 1 = 45°). */
export const PLAYER_MAX_SLOPE = 1;
