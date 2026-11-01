// Cartes de relief (« normal maps ») des matériaux de la nature (PUR, sans Babylon). Elles donnent du grain aux écorces et du
// volume aux roches quand la lumière rase ; jamais au feuillage, à l'herbe ni aux fleurs (aplats peints, le relief y ferait du
// bruit). Les glTF préparés pour le projet n'y renvoient plus (cartes retirées au copiage) : on les rattache par nom de matériau.
// Écorces : cartes du pack Quaternius, ramenées à 1024 px. Roches : le pack n'en livre pas — la carte est dérivée de la couleur
// (Rocks_Diffuse : fissures et arêtes en creux ou en relief selon leur clarté).

export interface NormalMap {
  /** Fichier PNG dans assets/models/nature (nom simple, sans chemin). */
  readonly file: string;
  /** Force du relief (1 = telle que dessinée). */
  readonly level: number;
}

/** Par nom de matériau glTF. */
export const NORMAL_MAPS: Readonly<Record<string, NormalMap>> = {
  Bark_NormalTree: { file: 'Bark_NormalTree_Normal.png', level: 1 },
  Bark_DeadTree: { file: 'Bark_DeadTree_Normal.png', level: 1 },
  Rocks: { file: 'Rocks_Normal.png', level: 0.9 },
};

export function normalMapFor(materialName: string): NormalMap | undefined {
  return Object.hasOwn(NORMAL_MAPS, materialName) ? NORMAL_MAPS[materialName] : undefined;
}
