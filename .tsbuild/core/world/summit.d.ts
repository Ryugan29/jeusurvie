export interface SummitSearch {
    /** Rayon de recherche autour de l'origine (m). */
    readonly radiusM: number;
    /** Pas de la grille de départ (m). */
    readonly gridStepM: number;
}
export interface Summit {
    readonly x: number;
    readonly z: number;
    readonly height: number;
}
/**
 * Grille grossière, puis montée locale par pas décroissants, le dernier valant exactement 2 m (à égalité : le premier
 * trouvé). La montée reste dans le rayon + un pas de grille (sommet proche du bord de la zone).
 */
export declare function findSummit(seed: number, search: SummitSearch): Summit;
