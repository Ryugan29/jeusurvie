// Obstacles du joueur (docs/03-archi.md §4, ADR 0003) : des cercles vus du dessus, dans le plan du sol (x, z).
// Pas de moteur physique : on laisse le joueur avancer, puis on le repousse hors de ce qu'il traverse — ce qui le fait
// aussi longer l'obstacle au lieu de rester collé.
import type { Resource } from '../world/placement';
import { modelKeyFor } from '../world/resource-models';

export interface Circle {
  readonly x: number;
  readonly z: number;
  readonly r: number;
  /** Hauteur (m) de l'obstacle au-dessus du sol : la caméra peut passer au-dessus d'un rocher. Absent = assez haut pour toujours bloquer. */
  readonly height?: number;
}

/**
 * Empreinte au sol d'un modèle, à l'échelle 1, en mètres : centre du cercle (décalage par rapport à l'origine du modèle),
 * rayon `r`, et hauteur `h` du tronc ou du rocher (la caméra s'en sert, le joueur non).
 */
export interface Footprint {
  readonly ox: number;
  readonly oz: number;
  readonly r: number;
  readonly h: number;
}

/**
 * Ce qui arrête le joueur, par modèle de assets/models/nature : le pied du tronc, la masse du rocher. Mesuré sur les sommets
 * des modèles tels qu'ils sont affichés (axes du jeu : le chargement retourne le sens gauche-droite par rapport au fichier),
 * sous 1,8 m de haut. Le rayon d'un rocher est la moyenne de son étendue autour du centre : un cercle ne colle pas à un
 * rocher irrégulier, il vaut mieux un peu de mur invisible qu'un joueur dans la pierre.
 * Les modèles absents d'ici (buissons, herbe, fleurs) se traversent.
 */
export const FOOTPRINT_BY_MODEL: Readonly<Record<string, Footprint>> = {
  CommonTree_2: { ox: 0, oz: 0, r: 0.6, h: 6.7 },
  CommonTree_3: { ox: 0, oz: 0, r: 0.6, h: 8 },
  CommonTree_4: { ox: 0, oz: 0, r: 0.6, h: 7.9 },
  CommonTree_5: { ox: 0, oz: 0, r: 0.6, h: 5.4 },
  // Arbres morts : troncs plus épais que les feuillus (pied de 1,5 à 1,8 m de large).
  DeadTree_3: { ox: 0, oz: 0, r: 0.7, h: 12.9 },
  DeadTree_4: { ox: 0, oz: 0, r: 0.8, h: 12.4 },
  DeadTree_5: { ox: 0, oz: 0, r: 0.8, h: 16.1 },
  Pine_1: { ox: 0, oz: 0, r: 0.6, h: 6.8 },
  Pine_2: { ox: 0, oz: 0, r: 0.6, h: 6.8 },
  Pine_3: { ox: 0, oz: 0, r: 0.6, h: 7 },
  Pine_4: { ox: 0, oz: 0, r: 0.6, h: 9.7 },
  Pine_5: { ox: 0, oz: 0, r: 0.5, h: 8.3 },
  Rock_Medium_1: { ox: 0.11, oz: 0.35, r: 1.45, h: 2 },
  Rock_Medium_2: { ox: 0.18, oz: 0.08, r: 1.35, h: 1.85 },
  Rock_Medium_3: { ox: 0.11, oz: 0.85, r: 1.5, h: 2 },
};

/** Distance maximale (m, échelle 1) entre l'origine d'un modèle et le bord de son empreinte. */
export const MAX_COLLIDER_EXTENT_M = Math.max(...Object.values(FOOTPRINT_BY_MODEL).map((f) => Math.hypot(f.ox, f.oz) + f.r));

/**
 * Cercle d'obstacle d'une ressource, ou `undefined` si le joueur la traverse. L'empreinte suit l'instance dessinée :
 * même échelle, même rotation autour de la verticale (angle = rotation × 1 tour) que sa matrice (render-data/vegetation-instances).
 */
export function colliderOf(resource: Resource): Circle | undefined {
  const footprint = FOOTPRINT_BY_MODEL[modelKeyFor(resource)];
  if (footprint === undefined) return undefined;
  const angle = resource.rotation * 2 * Math.PI, c = Math.cos(angle), s = Math.sin(angle), sc = resource.scale;
  return {
    x: resource.x + sc * (footprint.ox * c + footprint.oz * s),
    z: resource.z + sc * (-footprint.ox * s + footprint.oz * c),
    r: footprint.r * sc,
    height: footprint.h * sc,
  };
}

/** Marge (m) sous laquelle un point posé sur le bord d'un cercle compte encore comme dehors (arrondis de calcul). */
const EDGE_TOLERANCE_M = 1e-6;

/** Le joueur (rayon `radius`) centré en `point` est-il dans un des cercles ? */
export function overlaps(point: { readonly x: number; readonly z: number }, radius: number, circles: readonly Circle[]): boolean {
  return circles.some((c) => Math.hypot(point.x - c.x, point.z - c.z) < c.r + radius - EDGE_TOLERANCE_M);
}

/** Passes max : deux obstacles qui se touchent se repoussent l'un l'autre, quelques passes suffisent à en sortir. */
const MAX_PASSES = 4;

/**
 * Repousse le point (x, z) hors des cercles, en gardant `radius` (le rayon du joueur) entre son centre et leur bord.
 * Un point libre est rendu tel quel.
 */
export function pushOut(point: { readonly x: number; readonly z: number }, radius: number, circles: readonly Circle[]): { x: number; z: number } {
  let x = point.x, z = point.z;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let moved = false;
    for (const c of circles) {
      const dx = x - c.x, dz = z - c.z;
      const reach = c.r + radius;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance >= reach) continue;
      moved = true;
      if (distance === 0) {
        x = c.x + reach; // pile au centre : n'importe quel côté vaut mieux que de rester dedans
      } else {
        x = c.x + (dx / distance) * reach;
        z = c.z + (dz / distance) * reach;
      }
    }
    if (!moved) break;
  }
  return { x, z };
}
