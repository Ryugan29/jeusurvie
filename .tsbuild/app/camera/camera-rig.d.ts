import type { Circle } from '../../core/physics/colliders';
import type { Vec3 } from '../../core/shared/vec';
export interface CameraRig {
    /** Lacet (rad) : 0 = regard vers +Z, π/2 = vers +X. */
    readonly yaw: number;
    /** Tangage (rad) : positif = caméra au-dessus du joueur, regard plongeant. */
    readonly pitch: number;
    /** Distance caméra–cible (m). */
    readonly distance: number;
}
export declare const MIN_PITCH = -0.35;
export declare const MAX_PITCH = 1.25;
export declare const MIN_DISTANCE = 2.5;
export declare const MAX_DISTANCE = 14;
/** Hauteur minimale de la caméra au-dessus du sol sous elle (m). */
export declare const CAMERA_GROUND_CLEARANCE = 0.4;
/** Marge (m) gardée entre la caméra et le bord d'un obstacle : doit rester sous le rayon du joueur (le joueur est toujours plus loin). */
export declare const CAMERA_OBSTACLE_MARGIN = 0.3;
/** Perche minimale (m) quand un obstacle est collé au joueur : pas de caméra dans la tête du personnage. */
export declare const MIN_CAMERA_BOOM = 1.2;
/** Direction horizontale du regard pour un lacet donné. */
export declare function forwardOf(yaw: number): {
    readonly x: number;
    readonly z: number;
};
/** Mouvement de souris (pixels) → nouveau lacet / tangage. Droite = tourner à droite ; bas = regarder plus bas. */
export declare function applyLook(rig: CameraRig, dxPx: number, dyPx: number, sensitivity: number): CameraRig;
/** Molette → distance (positif = s'éloigner). */
export declare function applyZoom(rig: CameraRig, wheelDelta: number): CameraRig;
/** Obstacles que peut toucher la perche entre (ax, az) et (bx, bz) (vue du dessus) : voir app/world/obstacle-index. */
export type ObstaclesAlong = (ax: number, az: number, bx: number, bz: number) => readonly Circle[];
/**
 * Position de la caméra : derrière la cible selon le lacet, relevée selon le tangage, raccourcie par les obstacles
 * (`obstacles`, optionnel) sans descendre sous MIN_CAMERA_BOOM, et jamais sous le sol (`groundAt` : hauteur du sol connue
 * en un point, ou undefined si le chunk n'est pas chargé).
 */
export declare function cameraPose(rig: CameraRig, target: Vec3, groundAt?: (x: number, z: number) => number | undefined, obstacles?: ObstaclesAlong): {
    readonly position: Vec3;
    readonly target: Vec3;
};
