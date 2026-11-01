/**
 * Bruit de gradient 2D en (x, z) ; vaut 0 sur les nœuds entiers, reste dans [-1, 1].
 * `salt` donne un bruit indépendant pour la même graine (octaves, cartes différentes).
 */
export declare function gradientNoise2(seed: number, x: number, z: number, salt: number): number;
export interface NoiseSample {
    readonly value: number;
    /** Dérivées partielles de la valeur selon x et z (pente du bruit). */
    readonly dx: number;
    readonly dz: number;
}
/**
 * Bruit de gradient avec ses dérivées analytiques (exactes, opérations de base seulement).
 * `value` est identique bit à bit à gradientNoise2 (même calcul).
 */
export declare function gradientNoise2D(seed: number, x: number, z: number, salt: number): NoiseSample;
export interface FbmParams {
    /** Nombre de couches de bruit superposées : entier de 1 à MAX_OCTAVES. */
    readonly octaves: number;
    /** Multiplicateur de fréquence d'une octave à la suivante (souvent 2). */
    readonly lacunarity: number;
    /** Multiplicateur d'amplitude d'une octave à la suivante (souvent 0,5). */
    readonly gain: number;
}
/** Au-delà, les détails ajoutés sont plus fins que la précision utile (et le coût croît pour rien). */
export declare const MAX_OCTAVES = 64;
/**
 * fBm : somme d'octaves de bruit de gradient, normalisée par la somme des amplitudes → reste dans [-1, 1].
 * L'octave o utilise le sel `salt * 256 + o` : deux sels différents donnent des bruits indépendants.
 * Chaque octave est décalée d'une fraction de maille (jamais nulle) tirée du hash : sans cela, les nœuds de
 * toutes les octaves coïncident et le relief vaut exactement 0 sur une grille régulière, quelle que soit la graine.
 * @throws RangeError si `params.octaves` n'est pas un entier de 1 à MAX_OCTAVES (erreur de programmation :
 *   les paramètres viennent de params.ts, jamais du joueur).
 */
export declare function fbm2(seed: number, x: number, z: number, params: FbmParams, salt: number): number;
/**
 * Bruit à crêtes (« ridged ») : chaque octave vaut (1 − |n|)², maximale là où le bruit s'annule → lignes de crêtes
 * fines et vallées larges, comme des montagnes. Moyenne pondérée des octaves → reste dans [0, 1].
 * Mêmes octaves (fréquences, décalages, sels) que fbm2.
 * @throws RangeError comme fbm2.
 */
export declare function ridgedFbm2(seed: number, x: number, z: number, params: FbmParams, salt: number): number;
/**
 * Crêtes « multifractales » à poids (Musgrave) : chaque octave vaut (1 − |n|)², multipliée par un poids tiré de
 * l'octave précédente. Sur les crêtes le détail s'accumule (arêtes, aiguilles) ; dans les creux il s'éteint
 * (versants et vallées lisses). Normalisé → [0, 1]. Mêmes octaves (fréquences, décalages, sels) que fbm2.
 * @throws RangeError comme fbm2.
 */
export declare function ridgedMultifractal2(seed: number, x: number, z: number, params: FbmParams, salt: number): number;
/**
 * fBm « érodé » : chaque octave est atténuée par la pente accumulée des octaves précédentes (et la sienne),
 * n / (1 + |Σ∇n|²) — peu de détail sur les pentes fortes, plus sur les replats, comme un relief usé par l'eau.
 * Normalisé → [-1, 1]. Mêmes octaves que fbm2.
 * @throws RangeError comme fbm2.
 */
export declare function erodedFbm2(seed: number, x: number, z: number, params: FbmParams, salt: number): number;
