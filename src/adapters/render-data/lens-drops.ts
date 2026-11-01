// Gouttes sur l'objectif (PUR, sans Babylon) : combien la pluie en dépose selon où regarde la caméra, et comment l'objectif
// se mouille (vite) puis sèche (lentement) quand la pluie s'arrête. Le rendu des gouttes : adapters/babylon/lens-drops.
import { smoothstep } from '../../core/shared/math';

export const LENS = {
  /** Temps caractéristique (s) pour que l'objectif se couvre de gouttes. */
  wetUpS: 1.2,
  /** Temps caractéristique (s) pour qu'il sèche après la pluie. */
  dryS: 5,
  /** Part des gouttes gardée caméra baissée (le regard vers le sol protège un peu l'objectif). */
  lookDownShare: 0.4,
  /** Inclinaison (rad, positive vers le bas) où les gouttes sont au minimum, et où elles sont au maximum (regard vers le ciel). */
  pitchDown: 0.7,
  pitchUp: -0.35, // la caméra levée au maximum (MIN_PITCH de app/camera/camera-rig)
} as const;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Densité de gouttes visée (0 à 1) pour une pluie `rain` (0 à 1) et une inclinaison de caméra `pitch` (rad, + = vers le bas). */
export function lensRainTarget(rain: number, pitch: number): number {
  const r = clamp01(rain);
  if (r === 0) return 0;
  const p = Number.isFinite(pitch) ? pitch : 0;
  const look = LENS.lookDownShare + (1 - LENS.lookDownShare) * smoothstep(LENS.pitchDown, LENS.pitchUp, p);
  return clamp01(r * look);
}

/** Densité de gouttes après `dtS` secondes : rejoint `target` sans la dépasser, vite en montée, lentement en séchant. */
export function stepLensWetness(current: number, target: number, dtS: number): number {
  if (!(dtS > 0)) return current;
  const time = target > current ? LENS.wetUpS : LENS.dryS;
  return target + (current - target) * Math.exp(-dtS / time);
}
