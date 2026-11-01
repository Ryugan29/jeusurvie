// Matières du sol (PUR, sans Babylon) : ce que les textures générées sur la carte graphique décrivent pour chaque couche
// (adapters/babylon/ground-textures) et comment le matériau physique du terrain les relit (adapters/babylon/terrain-surface-plugin).
// Direction artistique (ADR 0012) : des matières CRÉDIBLES vues à hauteur d'homme — herbe couchée et chaume sur une terre sombre,
// terre à cailloux et fissures, roche fracturée à lichens, neige ridée par le vent — et non plus des aplats peints.
// Une texture de couleur porte un FACTEUR (moyenne ≈ 1 par canal) multiplié à la couleur du sommet (palette : la teinte du biome,
// des plaques, des sentiers) : la palette garde la main sur la teinte d'ensemble, la texture apporte la matière.

export const SURFACE_LAYERS = ['grass', 'soil', 'rock', 'snow'] as const;
export type SurfaceLayer = (typeof SURFACE_LAYERS)[number];

export interface SurfaceLayerSpec {
  /** Côté (m) du motif dans le monde. */
  readonly tileM: number;
  /** Profondeur (m) du relief que la carte de normales représente (différence entre le plus haut et le plus creux). */
  readonly bumpDepthM: number;
  /** Albédo moyen (linéaire) que la texture générée dessine : son facteur = albédo / cette valeur (moyenne ≈ 1). */
  readonly referenceAlbedo: readonly [number, number, number];
  /** Rugosité si les cartes de matière ne sont pas lues (profil LOW). */
  readonly roughness: number;
}

export const SURFACE_LAYER_SPECS: Readonly<Record<SurfaceLayer, SurfaceLayerSpec>> = {
  grass: { tileM: 3, bumpDepthM: 0.012, referenceAlbedo: [0.072, 0.088, 0.04], roughness: 0.85 },
  soil: { tileM: 2.5, bumpDepthM: 0.02, referenceAlbedo: [0.125, 0.098, 0.074], roughness: 0.88 },
  rock: { tileM: 9, bumpDepthM: 0.09, referenceAlbedo: [0.19, 0.18, 0.165], roughness: 0.8 },
  snow: { tileM: 6, bumpDepthM: 0.03, referenceAlbedo: [0.78, 0.81, 0.86], roughness: 0.55 },
};

/** Plus grand facteur codable dans un octet : 255 ↔ ce facteur (code √(f / max), plus de précision dans les sombres). */
export const ALBEDO_FACTOR_MAX = 3;

/** Code d'un facteur d'albédo dans [0, 1] (octet / 255) : √(f / ALBEDO_FACTOR_MAX), borné. */
export function encodeAlbedoFactor(factor: number): number {
  const f = Number.isFinite(factor) ? Math.min(ALBEDO_FACTOR_MAX, Math.max(0, factor)) : 0;
  return Math.sqrt(f / ALBEDO_FACTOR_MAX);
}

/** Facteur d'albédo relu : l'inverse exact de encodeAlbedoFactor (le shader fait le même calcul). */
export function decodeAlbedoFactor(code: number): number {
  return code * code * ALBEDO_FACTOR_MAX;
}

/**
 * Pente (dénivelé par texel) de la carte de normales : une différence de hauteur `dh` (en part de bumpDepthM) entre deux texels
 * voisins d'une texture de `size` px vaut dh × bumpDepthM / (tileM / size) en pente réelle.
 */
export function normalSlopeScale(layer: SurfaceLayer, size: number): number {
  const s = SURFACE_LAYER_SPECS[layer];
  return (s.bumpDepthM * size) / s.tileM;
}

/** Sol mouillé (constantes partagées avec le relief lointain) : part de luminosité retirée par l'eau, rugosité de la terre trempée. */
export const WET_ALBEDO_DARKEN = 0.42;
export const WET_ROUGHNESS = 0.32;
/** Rugosité de l'eau des flaques : presque un miroir (la scène s'y reflète avec les reflets à l'écran, le ciel sinon). */
export const PUDDLE_ROUGHNESS = 0.04;
