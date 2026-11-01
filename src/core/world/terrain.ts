// Hauteur du sol en coordonnées monde (mètres). Calculée point par point à partir de la seule graine :
// deux chunks voisins calculent leur bord commun aux mêmes coordonnées, donc à l'identique (ADR 0004).
// Opérations de base seulement (Math en liste blanche) : même monde sur tous les moteurs JS.
//
// Recette (genVersion 1) :
// 1. déformation du domaine : les coordonnées sont légèrement tordues, les formes perdent leur régularité ;
// 2. régions à très grande échelle : plaines, collines ou montagnes ;
// 3. houle très douce partout, puis ondulations d'amplitude faible en plaine et forte en collines ;
// 4. en montagne : chaînes (crêtes multifractales à poids, pics pointus) et détail « érodé » ;
// 5. vallées sinueuses, plus profondes en montagne, qui entaillent aussi les chaînes (cols, passages) ;
// 6. autour du départ, des collines : relief visible, jamais de montagnes (terrain praticable garanti).
import { smoothstep } from '../shared/math';
import { erodedFbm2, fbm2, ridgedMultifractal2 } from './noise';
import { TERRAIN_V1 } from './params';

export interface TerrainRegions {
  /** Part « collines » de l'amplitude des ondulations, dans [0, 1]. */
  readonly hills: number;
  /** Présence des montagnes, dans [0, 1] (0 = aucune montagne). */
  readonly mountains: number;
}

/**
 * Régions au point (x, z) : plaine, collines, montagnes (sur les coordonnées non tordues : grandes zones stables),
 * avec la contrainte du départ (collines garanties, aucune montagne jusqu'à startCalmRadius).
 */
export function terrainRegionsAt(seed: number, x: number, z: number): TerrainRegions {
  const p = TERRAIN_V1, g = p.regions;
  const raw = Math.min(1, Math.max(0, 0.5 + g.contrast * fbm2(seed, x * g.frequency, z * g.frequency, g, g.salt)));
  const away = smoothstep(p.startCalmRadius, 2 * p.startCalmRadius, Math.sqrt(x * x + z * z));
  const region = Math.max(p.startMinRegion * (1 - away), Math.min(raw, p.startMaxRegion + (1 - p.startMaxRegion) * away));
  return { hills: smoothstep(g.hillsFrom, g.hillsTo, region), mountains: smoothstep(g.mountainsFrom, g.mountainsTo, region) };
}

/**
 * Hauteur exacte (float64) du relief au point (x, z), en mètres.
 * Réservée au générateur : le jeu (physique, rendu) lit les hauteurs float32 de `ChunkData.heights`.
 * @param seed graine du monde, entier non signé 32 bits (validée à la frontière, pas ici).
 * @param x coordonnée monde en mètres (axe X).
 * @param z coordonnée monde en mètres (axe Z).
 */
export function heightAt(seed: number, x: number, z: number): number {
  const p = TERRAIN_V1;

  // 1. Déformation du domaine.
  const w = p.warp;
  const wx = x + w.amplitude * fbm2(seed, x * w.frequency, z * w.frequency, w, w.salt);
  const wz = z + w.amplitude * fbm2(seed, x * w.frequency, z * w.frequency, w, w.saltZ);

  // 2. Régions.
  const regions = terrainRegionsAt(seed, x, z);

  // 3. Houle, puis ondulations générales.
  const sw = p.swells;
  let h = p.baseHeight + sw.amplitude * fbm2(seed, wx * sw.frequency, wz * sw.frequency, sw, sw.salt);
  const hl = p.hills;
  const amplitude = hl.plainsAmplitude + (hl.hillsAmplitude - hl.plainsAmplitude) * regions.hills;
  h += amplitude * fbm2(seed, wx * hl.frequency, wz * hl.frequency, hl, hl.salt);

  // 5 (calculé avant 4). Vallées : proximité d'une ligne de vallée, 1 au fond, 0 hors de la vallée.
  const v = p.valleys;
  const valleyNoise = Math.abs(fbm2(seed, wx * v.frequency, wz * v.frequency, v, v.salt));
  const valley = 1 - smoothstep(0, v.width, valleyNoise);

  // 4. Montagnes : chaînes aux pics pointus, abaissées au fond des vallées (cols), puis détail érodé.
  if (regions.mountains > 0) {
    const m = p.mountains, e = p.erosion;
    const ridge = ridgedMultifractal2(seed, wx * m.frequency, wz * m.frequency, m, m.salt);
    const cut = 1 - smoothstep(0, v.mountainCutWidth, valleyNoise);
    h += m.amplitude * regions.mountains * ridge * Math.sqrt(ridge) * (1 - v.mountainCut * cut);
    h += e.amplitude * regions.mountains * erodedFbm2(seed, wx * e.frequency, wz * e.frequency, e, e.salt);
  }

  // 5. Vallées : creusées, deux fois plus profondes en montagne.
  h -= v.depth * valley * (1 + regions.mountains);

  return h + 0; // jamais -0
}
