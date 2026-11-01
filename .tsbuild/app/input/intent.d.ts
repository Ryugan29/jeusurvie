export interface MoveKeys {
    readonly forward: boolean;
    readonly back: boolean;
    readonly left: boolean;
    readonly right: boolean;
}
/** Direction voulue, de longueur 1 (ou 0 à l'arrêt), relative au regard de la caméra. */
export declare function wishDirection(keys: MoveKeys, yaw: number): {
    readonly dx: number;
    readonly dz: number;
};
