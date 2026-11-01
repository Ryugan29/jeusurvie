export interface NormalMap {
    /** Fichier PNG dans assets/models/nature (nom simple, sans chemin). */
    readonly file: string;
    /** Force du relief (1 = telle que dessinée). */
    readonly level: number;
}
/** Par nom de matériau glTF. */
export declare const NORMAL_MAPS: Readonly<Record<string, NormalMap>>;
export declare function normalMapFor(materialName: string): NormalMap | undefined;
