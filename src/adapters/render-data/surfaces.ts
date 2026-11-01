// Surfaces physiques (PUR, sans Babylon) : réglages PBR (métal / rugosité) des matériaux SOLIDES du jeu — roches, écorces,
// champignons, personnages. Le feuillage, l'herbe et les fleurs restent sur le matériau léger « peint » (vent, découpe lissée :
// adapters/babylon/foliage-plugin) : des aplats découpés n'ont rien à gagner d'une réflexion physique, et ils sont des dizaines de
// milliers à l'écran.
// Avec l'éclairage d'environnement (le ciel de l'heure, adapters/babylon/sky-environment), une surface PBR prend un liseré de ciel
// sur ses bords (Fresnel), un reflet doux selon sa rugosité, et des ombres d'ambiance cohérentes avec le ciel du moment.

/** Feuillages, herbes, plantes et fleurs : matériau léger, pas PBR. */
export const FOLIAGE_MATERIAL = /leaf|leaves|grass|flower|bush|clover|fern|plant|petal/i;

export function isFoliageMaterial(materialName: string): boolean {
  return FOLIAGE_MATERIAL.test(materialName);
}

export interface Surface {
  /** 0 = diélectrique (tout ici), 1 = métal. */
  readonly metallic: number;
  /** 0 = miroir, 1 = parfaitement mat. */
  readonly roughness: number;
  /** Part de l'éclairage d'environnement (ciel) reçue : < 1 car la lumière d'ambiance (hémisphérique) éclaire déjà les ombres. */
  readonly environmentIntensity: number;
}

/** Surface par défaut d'un objet solide (personnages, vêtements, objets) : satiné, un léger reflet de ciel. */
export const DEFAULT_SURFACE: Surface = { metallic: 0, roughness: 0.62, environmentIntensity: 0.55 };

/** Par motif de nom de matériau glTF (premier qui correspond). */
const SURFACES: readonly (readonly [RegExp, Surface])[] = [
  [/^rocks$|pathrocks|rock/i, { metallic: 0, roughness: 0.82, environmentIntensity: 0.5 }], // pierre : mate, arêtes accrochant le ciel
  [/bark/i, { metallic: 0, roughness: 0.9, environmentIntensity: 0.4 }], // écorce : très mate
  [/mushroom/i, { metallic: 0, roughness: 0.45, environmentIntensity: 0.6 }], // chapeaux humides, légèrement luisants
  [/hair/i, { metallic: 0, roughness: 0.42, environmentIntensity: 0.6 }], // cheveux : reflet marqué
  [/eye/i, { metallic: 0, roughness: 0.15, environmentIntensity: 0.8 }], // yeux : brillants (vivants)
  [/skin|body|superhero|demon/i, { metallic: 0, roughness: 0.55, environmentIntensity: 0.55 }], // peau : satinée
];

export function surfaceFor(materialName: string): Surface {
  for (const [pattern, surface] of SURFACES) if (pattern.test(materialName)) return surface;
  return DEFAULT_SURFACE;
}

/** Matière mouillée : la surface (plus lisse, même éclairage d'environnement), et la part de sa couleur qui reste (l'eau fonce la pierre, l'écorce, la peau). */
export interface WetSurface extends Surface {
  readonly darken: number;
}

// Mouillée : l'eau change l'ASPECT de la matière, pas la quantité de lumière qu'elle reçoit.
//  - plus lisse (jusqu'à 55 % de rugosité en moins) : le reflet du ciel se resserre en liseré net et luisant — c'est la brillance ;
//  - plus sombre (30 % de couleur en moins) : l'eau fonce la pierre, l'écorce, la peau ; c'est aussi ce qui paie le surcroît de reflet
//    (une matière moyenne renvoie 6 à 25 % de ciel en moins mouillée que sèche) ;
//  - AUCUN surcroît d'éclairage d'environnement : un ancien « +0,35 » (0,55 → 0,90) faisait recevoir 64 % de ciel gris en plus,
//    et personnages et roches ressortaient plus clairs que le sol sous la pluie. La part de ciel reçue reste celle du sec.
const WET_ROUGHNESS_DROP = 0.55;
const WET_DARKEN = 0.3;
/**
 * Rugosité plancher d'une surface mouillée : en dessous, le reflet est un miroir qui montre les pixels du petit cube de ciel
 * (128 px par face, sky-environment) et scintille sur les reliefs ; et le gain de reflet plafonne (albédo du lobe ≈ 0,080 à 0,15
 * contre 0,084 à 0,10). Une matière déjà plus lisse (yeux : 0,15 sec) ne devient donc que très peu plus lisse, jamais plus rugueuse.
 */
const WET_ROUGHNESS_FLOOR = 0.12;

/** La surface `s` mouillée à `wetness` (0 = sèche, inchangée ; 1 = détrempée ; bornée à [0, 1]). */
export function wetSurface(s: Surface, wetness: number): WetSurface {
  const w = Number.isFinite(wetness) ? Math.min(1, Math.max(0, wetness)) : 0;
  return {
    ...s,
    roughness: Math.min(s.roughness, Math.max(WET_ROUGHNESS_FLOOR, s.roughness * (1 - WET_ROUGHNESS_DROP * w))),
    environmentIntensity: s.environmentIntensity,
    darken: 1 - WET_DARKEN * w,
  };
}
