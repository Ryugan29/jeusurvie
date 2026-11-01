export interface TerrainRegions {
    /** Part « collines » de l'amplitude des ondulations, dans [0, 1]. */
    readonly hills: number;
    /** Présence des montagnes, dans [0, 1] (0 = aucune montagne). */
    readonly mountains: number;
}
/**
 * Régions au point (x, z) : plaine, collines, montagnes (sur les coordonnées non tordues : grandes zones stables),
 * avec la contrainte du départ (collines garanties, aucune montagne jusqu'à startCalmRadius).
 */
export declare function terrainRegionsAt(seed: number, x: number, z: number): TerrainRegions;
/**
 * Hauteur exacte (float64) du relief au point (x, z), en mètres.
 * Réservée au générateur : le jeu (physique, rendu) lit les hauteurs float32 de `ChunkData.heights`.
 * @param seed graine du monde, entier non signé 32 bits (validée à la frontière, pas ici).
 * @param x coordonnée monde en mètres (axe X).
 * @param z coordonnée monde en mètres (axe Z).
 */
export declare function heightAt(seed: number, x: number, z: number): number;
