// Caméra 3e personne en orbite autour du joueur (pure). La souris change le lacet et le tangage à chaque image,
// hors tick : le regard n'a aucune latence (docs/03-archi.md §3). Un tronc ou un rocher entre le joueur et la caméra
// raccourcit la perche : la caméra se rapproche au lieu de traverser l'obstacle.
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

export const MIN_PITCH = -0.35;
export const MAX_PITCH = 1.25;
export const MIN_DISTANCE = 2.5;
export const MAX_DISTANCE = 14;
/** Hauteur minimale de la caméra au-dessus du sol sous elle (m). */
export const CAMERA_GROUND_CLEARANCE = 0.4;
/** Marge (m) gardée entre la caméra et le bord d'un obstacle : doit rester sous le rayon du joueur (le joueur est toujours plus loin). */
export const CAMERA_OBSTACLE_MARGIN = 0.3;
/** Perche minimale (m) quand un obstacle est collé au joueur : pas de caméra dans la tête du personnage. */
export const MIN_CAMERA_BOOM = 1.2;
/** Mètres de distance par unité de molette. */
const ZOOM_PER_WHEEL_UNIT = 0.01;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Direction horizontale du regard pour un lacet donné. */
export function forwardOf(yaw: number): { readonly x: number; readonly z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

/** Mouvement de souris (pixels) → nouveau lacet / tangage. Droite = tourner à droite ; bas = regarder plus bas. */
export function applyLook(rig: CameraRig, dxPx: number, dyPx: number, sensitivity: number): CameraRig {
  return { ...rig, yaw: rig.yaw + dxPx * sensitivity, pitch: clamp(rig.pitch + dyPx * sensitivity, MIN_PITCH, MAX_PITCH) };
}

/** Molette → distance (positif = s'éloigner). */
export function applyZoom(rig: CameraRig, wheelDelta: number): CameraRig {
  return { ...rig, distance: clamp(rig.distance + wheelDelta * ZOOM_PER_WHEEL_UNIT, MIN_DISTANCE, MAX_DISTANCE) };
}

/** Obstacles que peut toucher la perche entre (ax, az) et (bx, bz) (vue du dessus) : voir app/world/obstacle-index. */
export type ObstaclesAlong = (ax: number, az: number, bx: number, bz: number) => readonly Circle[];

/**
 * Fraction (0 à 1) de la perche, depuis la cible, avant de rencontrer l'obstacle ; 1 s'il n'est pas sur le chemin.
 * Le cercle est élargi de CAMERA_OBSTACLE_MARGIN. La perche passe au-dessus d'un obstacle bas si elle est plus haute que
 * lui là où elle y entre (pas de test à la sortie : elle monte ou presque à plat, jamais assez pour y replonger).
 */
function boomFractionBlockedBy(
  from: Vec3,
  to: Vec3,
  c: Circle,
  groundAt: ((x: number, z: number) => number | undefined) | undefined,
): number {
  const dx = to.x - from.x, dz = to.z - from.z;
  const a = dx * dx + dz * dz;
  if (a === 0) return 1;
  const reach = c.r + CAMERA_OBSTACLE_MARGIN;
  const fx = from.x - c.x, fz = from.z - c.z;
  const startGap = fx * fx + fz * fz - reach * reach;
  if (startGap <= 0) return 1; // la cible est déjà dans la marge : rien à raccourcir, on l'ignore
  const b = 2 * (dx * fx + dz * fz);
  const discriminant = b * b - 4 * a * startGap;
  if (discriminant < 0) return 1;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  if (t < 0 || t > 1) return 1;
  if (c.height !== undefined) {
    const base = groundAt?.(c.x, c.z); // sol inconnu : on suppose l'obstacle assez haut pour bloquer
    if (base !== undefined && from.y + t * (to.y - from.y) >= base + c.height) return 1;
  }
  return t;
}

/**
 * Position de la caméra : derrière la cible selon le lacet, relevée selon le tangage, raccourcie par les obstacles
 * (`obstacles`, optionnel) sans descendre sous MIN_CAMERA_BOOM, et jamais sous le sol (`groundAt` : hauteur du sol connue
 * en un point, ou undefined si le chunk n'est pas chargé).
 */
export function cameraPose(
  rig: CameraRig,
  target: Vec3,
  groundAt?: (x: number, z: number) => number | undefined,
  obstacles?: ObstaclesAlong,
): { readonly position: Vec3; readonly target: Vec3 } {
  const f = forwardOf(rig.yaw);
  const horizontal = Math.cos(rig.pitch) * rig.distance;
  const wanted: Vec3 = {
    x: target.x - f.x * horizontal,
    y: target.y + Math.sin(rig.pitch) * rig.distance,
    z: target.z - f.z * horizontal,
  };
  let t = 1;
  if (obstacles !== undefined) {
    for (const c of obstacles(target.x, target.z, wanted.x, wanted.z)) t = Math.min(t, boomFractionBlockedBy(target, wanted, c, groundAt));
    t = Math.max(t, Math.min(1, MIN_CAMERA_BOOM / rig.distance));
  }
  const x = target.x + (wanted.x - target.x) * t, z = target.z + (wanted.z - target.z) * t;
  const free = target.y + (wanted.y - target.y) * t;
  const ground = groundAt?.(x, z);
  const y = ground === undefined ? free : Math.max(free, ground + CAMERA_GROUND_CLEARANCE);
  return { position: { x, y, z }, target };
}
