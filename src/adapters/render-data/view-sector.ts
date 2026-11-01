// Élagage par secteur de vue (PUR, sans Babylon) : la végétation et le couvre-sol sont dessinés en un appel par modèle, toutes
// instances confondues (« thin instances ») ; la carte graphique traitait donc AUSSI les dizaines de milliers de brins et d'arbres
// derrière la caméra (leurs sommets sont calculés avant d'être jetés). On ne garde que ce qui est dans le secteur horizontal vu
// par la caméra (demi-angle de vue + marge) ou tout près du joueur (la caméra est derrière lui, à quelques mètres).
// Le cap de la caméra est arrondi par pas : les tampons ne sont refaits qu'à chaque pas franchi, pas à chaque image ; la marge
// couvre le pas (rien n'apparaît au bord de l'écran en tournant).

/** Secteur de vue horizontal : direction (unitaire) et cosinus du demi-angle gardé. */
export interface ViewSector {
  readonly dirX: number;
  readonly dirZ: number;
  readonly cosHalf: number;
  /** En deçà de cette distance (m) du joueur, tout est gardé (derrière la caméra compris). */
  readonly nearM: number;
}

/** Pas d'arrondi du cap (rad) : 15°. */
export const SECTOR_STEP_RAD = Math.PI / 12;
/** Marge (rad) ajoutée au demi-angle de vue : le pas d'arrondi + un peu (grands objets à cheval sur le bord). */
export const SECTOR_MARGIN_RAD = SECTOR_STEP_RAD + Math.PI / 18;
/** Rayon (m) toujours gardé autour du joueur (caméra derrière lui, ombres de contact, objets qui débordent dans le champ). */
export const SECTOR_NEAR_M = 14;

/** Cap arrondi au pas (rad). */
export function quantizedYaw(yaw: number): number {
  return Math.round(yaw / SECTOR_STEP_RAD) * SECTOR_STEP_RAD;
}

/**
 * Secteur pour une caméra regardant selon le cap `yaw` (rad, direction (sin yaw, cos yaw) au sol), de champ vertical `fovY` (rad) et
 * de rapport largeur / hauteur `aspect`. Un demi-angle (marge comprise) qui atteindrait 180° garde tout (cosHalf = −1).
 */
export function viewSectorFor(yaw: number, fovY: number, aspect: number, nearM = SECTOR_NEAR_M): ViewSector {
  const q = quantizedYaw(yaw);
  const halfH = Math.atan(Math.tan(fovY / 2) * Math.max(aspect, 0.1));
  const half = halfH + SECTOR_MARGIN_RAD;
  return { dirX: Math.sin(q), dirZ: Math.cos(q), cosHalf: half >= Math.PI ? -1 : Math.cos(Math.min(Math.PI, half)), nearM };
}

/** Un point (x, z) est-il gardé, vu depuis le joueur (px, pz) ? `radiusM` : taille de l'objet (il élargit le secteur). */
export function inSector(s: ViewSector, px: number, pz: number, x: number, z: number, radiusM = 0): boolean {
  const dx = x - px, dz = z - pz;
  const d = Math.hypot(dx, dz);
  if (d <= s.nearM + radiusM) return true;
  const cos = (dx * s.dirX + dz * s.dirZ) / d;
  if (cos >= s.cosHalf) return true;
  if (radiusM <= 0) return false;
  // Élargi par l'angle sous lequel l'objet est vu : cos(a − b) = cos a cos b + sin a sin b.
  const widen = Math.asin(Math.min(1, radiusM / d));
  const half = Math.acos(Math.max(-1, Math.min(1, s.cosHalf)));
  return cos >= Math.cos(Math.min(Math.PI, half + widen));
}

/** Deux secteurs donnent-ils le même élagage (même cap arrondi, même ouverture) ? */
export function sameSector(a: ViewSector | undefined, b: ViewSector | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.dirX === b.dirX && a.dirZ === b.dirZ && a.cosHalf === b.cosHalf && a.nearM === b.nearM;
}
