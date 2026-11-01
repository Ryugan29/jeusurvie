// Petites fonctions de calcul partagées (opérations de base seulement : utilisables par le générateur de monde).

/** Transition douce (dérivée nulle aux bords) : 0 si x ≤ edge0, 1 si x ≥ edge1, 3t² − 2t³ entre les deux. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
