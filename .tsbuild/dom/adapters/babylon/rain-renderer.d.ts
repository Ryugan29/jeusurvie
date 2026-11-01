import '@babylonjs/core/Particles/particleSystemComponent';
import type { Scene } from '@babylonjs/core/scene';
export declare const RAIN: {
    /** Demi-largeur (m) de la boîte de pluie autour de la caméra. */
    readonly radiusM: 14;
    /** Hauteur (m) de la boîte, au-dessus et au-dessous de la caméra. */
    readonly aboveM: 16;
    readonly belowM: 4;
    /** Vitesse de chute (m/s) et durée de vie d'une goutte (s) : elle traverse la boîte. */
    readonly speedMps: 18;
    readonly lifeS: 1.1;
    /** Inclinaison par vent plein (part de la vitesse de chute), sur x et z. */
    readonly slantX: 0.45;
    readonly slantZ: 0.22;
    /** Largeur et longueur (m) du trait. */
    readonly widthM: 0.025;
    readonly lengthM: 0.7;
    /** Teinte des gouttes en pleine lumière, et leur opacité. */
    readonly color: readonly [0.78, 0.82, 0.9];
    readonly alpha: 0.4;
};
/** Trait de goutte (RGBA, w × h) : blanc, opaque au centre, fondu sur les bords et aux deux extrémités. */
export declare function rainStreakSprite(w: number, h: number): Uint8Array;
export interface RainState {
    /** Force de la pluie (0 à 1). */
    readonly rain: number;
    /** Force du vent (0 à 1). */
    readonly wind: number;
    /** Lumière de la scène (≈ 1 de jour, faible la nuit) : les gouttes ne brillent pas dans le noir. */
    readonly brightness: number;
}
export declare class RainRenderer {
    private readonly drops;
    private readonly emitter;
    private readonly fall;
    private readonly color;
    private readonly capacity;
    constructor(scene: Scene, capacity: number);
    /** À chaque image : force de la pluie et du vent, lumière de la scène, position de la caméra. */
    update(state: RainState, x: number, y: number, z: number): void;
    dispose(): void;
}
