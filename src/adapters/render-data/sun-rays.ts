// Rayons de soleil à l'écran (PUR, sans Babylon) : où l'astre tombe à l'écran, et à quel point les rayons se voient selon
// l'angle entre le regard et l'astre. Le shader (adapters/babylon/sun-rays) n'a plus qu'à les tracer.
import { smoothstep } from '../../core/shared/math';
import type { Vec3 } from '../../core/shared/vec';

/** Repère de la caméra (axes en coordonnées du monde, unitaires) et son champ de vue. */
export interface CameraBasis {
  readonly forward: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  /** Tangente de la moitié du champ de vue vertical. */
  readonly tanHalfFovY: number;
  /** Largeur / hauteur de l'image. */
  readonly aspect: number;
}

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * Position à l'écran (u, v dans [0, 1] à l'intérieur de l'image ; hors de [0, 1] si l'astre est hors champ ; v vers le haut) de
 * l'astre dans la direction `toSun` (unitaire, vers l'astre), et `facing` = cosinus de l'angle avec le regard.
 * Rien (undefined) si l'astre est derrière ou exactement de côté.
 */
export function sunScreenUv(toSun: Vec3, camera: CameraBasis): { u: number; v: number; facing: number } | undefined {
  const facing = dot(toSun, camera.forward);
  if (facing <= 1e-6) return undefined;
  const x = dot(toSun, camera.right) / facing;
  const y = dot(toSun, camera.up) / facing;
  return { u: 0.5 + (0.5 * x) / (camera.tanHalfFovY * camera.aspect), v: 0.5 + (0.5 * y) / camera.tanHalfFovY, facing };
}

/** Cosinus de l'angle (regard, astre) en deçà duquel les rayons disparaissent (≈ 78°) et au-delà duquel ils sont pleins (≈ 32°). */
const FACING_FROM = 0.2;
const FACING_FULL = 0.85;

/** Force des rayons (0 à `strength`) selon le cosinus de l'angle entre le regard et l'astre : seulement quand on regarde vers lui. */
export function sunRayIntensity(strength: number, facing: number): number {
  return strength * smoothstep(FACING_FROM, FACING_FULL, facing);
}
