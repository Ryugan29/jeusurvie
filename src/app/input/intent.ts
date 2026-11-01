// Intention de déplacement : touches (déjà traduites depuis KeyboardEvent.code) + lacet de la caméra → direction XZ.
import { forwardOf } from '../camera/camera-rig';

export interface MoveKeys {
  readonly forward: boolean;
  readonly back: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

/** Direction voulue, de longueur 1 (ou 0 à l'arrêt), relative au regard de la caméra. */
export function wishDirection(keys: MoveKeys, yaw: number): { readonly dx: number; readonly dz: number } {
  const ahead = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
  const side = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (ahead === 0 && side === 0) return { dx: 0, dz: 0 };
  const f = forwardOf(yaw);
  // Droite = avant tourné de 90° vers +X : (cos yaw, −sin yaw).
  const dx = ahead * f.x + side * f.z;
  const dz = ahead * f.z - side * f.x;
  const len = Math.hypot(dx, dz);
  return { dx: dx / len, dz: dz / len };
}
