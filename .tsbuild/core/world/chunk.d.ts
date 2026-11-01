/** Côté d'un chunk, en mètres. */
export declare const CHUNK_SIZE = 64;
/** Sommets par côté (un sommet tous les CHUNK_SIZE / (CHUNK_VERTS - 1) = 2 m, bords inclus). */
export declare const CHUNK_VERTS = 33;
export interface ChunkData {
    /** Coordonnée entière du chunk en X (le chunk couvre [cx·64, cx·64 + 64] m). */
    readonly cx: number;
    /** Coordonnée entière du chunk en Z (le chunk couvre [cz·64, cz·64 + 64] m). */
    readonly cz: number;
    readonly genVersion: 1;
    /**
     * Hauteurs des sommets, ligne par ligne : index = row (axe Z) * CHUNK_VERTS + col (axe X).
     *
     * CONTRAT (testé) : `heights[row * CHUNK_VERTS + col] === Math.fround(heightAt(seed, cx*64 + col*2, cz*64 + row*2))`.
     * Ces valeurs float32 sont LA vérité du sol : le maillage rendu ET `physics/ground` les lisent, jamais `heightAt`
     * (sinon le personnage flotterait ou s'enfoncerait de l'écart d'arrondi float64 → float32).
     */
    readonly heights: Float32Array;
}
/**
 * Génère le chunk (cx, cz) du monde de graine `seed`. Fonction pure : mêmes arguments ⇒ même chunk, partout.
 * @param seed graine du monde, entier non signé 32 bits (0 … 4 294 967 295).
 * @param cx coordonnée entière du chunk en X.
 * @param cz coordonnée entière du chunk en Z.
 * La validation de ces domaines se fait à la frontière (création de partie, chargement), pas dans la boucle.
 */
export declare function generateChunk(seed: number, cx: number, cz: number): ChunkData;
/** Coordonnées entières d'un chunk. */
export interface ChunkCoord {
    readonly cx: number;
    readonly cz: number;
}
/** Clé texte unique d'un chunk, ex. « 3,-2 » (pour les Map et Set). */
export declare function chunkKey(cx: number, cz: number): string;
/** Chunk qui contient le point (x, z) du monde, en mètres (bords ouest et nord inclus). */
export declare function chunkCoordOf(x: number, z: number): ChunkCoord;
