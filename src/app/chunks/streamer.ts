// Choix des chunks à garder autour du joueur (pur). Le worker les génère, le rendu les affiche.
import { CHUNK_SIZE, chunkCoordOf, chunkKey, type ChunkCoord } from '../../core/world/chunk';
import { WORLD_RADIUS_M } from '../../core/world/params';

export interface StreamParams {
  /** Distance de vue voulue : un chunk est voulu si son centre est à cette distance ou moins (m). */
  readonly viewRadiusM: number;
  /** Marge avant déchargement, pour éviter de charger/décharger en boucle à la frontière (m). */
  readonly unloadMarginM: number;
  /** Nombre maximal de chunks chargés (ou demandés) en même temps. */
  readonly maxChunks: number;
}

export interface StreamPlan {
  /** Chunks à avoir (déjà chargés gardés + à charger), du plus proche au plus lointain. */
  readonly wanted: readonly ChunkCoord[];
  /** Chunks voulus pas encore chargés, du plus proche au plus lointain. */
  readonly toLoad: readonly ChunkCoord[];
  /** Clés des chunks chargés à libérer. */
  readonly toUnload: readonly string[];
}

/**
 * Distance de vue réellement utilisée : celle demandée, réduite pour que le disque de vue tienne dans le plafond
 * (π·(r/64)² ≤ maxChunks). Ainsi le plafond ne coupe presque jamais le disque, ce qui évite les va-et-vient.
 */
export function effectiveViewRadius(viewRadiusM: number, maxChunks: number): number {
  return Math.min(viewRadiusM, CHUNK_SIZE * Math.sqrt(Math.max(0, maxChunks) / Math.PI));
}

const centerD2 = (x: number, z: number, c: ChunkCoord): number => {
  const dx = (c.cx + 0.5) * CHUNK_SIZE - x, dz = (c.cz + 0.5) * CHUNK_SIZE - z;
  return dx * dx + dz * dz;
};

const insideWorld = (c: ChunkCoord, worldLimitM: number): boolean => centerD2(0, 0, c) <= worldLimitM * worldLimitM;

/**
 * Chunks dont le centre est à `radiusM` ou moins de (x, z), triés par distance (égalités : z puis x), limités aux
 * `maxChunks` plus proches, et jamais au-delà de `worldLimitM` de l'origine (par défaut WORLD_RADIUS_M + radiusM :
 * on peut voir le bord du monde, pas plus loin). Le chunk sous les pieds est toujours le premier.
 */
export function chunksAround(
  x: number,
  z: number,
  radiusM: number,
  maxChunks: number,
  worldLimitM = WORLD_RADIUS_M + radiusM,
): ChunkCoord[] {
  const here = chunkCoordOf(x, z);
  const span = Math.ceil(radiusM / CHUNK_SIZE) + 1;
  const r2 = radiusM * radiusM;
  const found: { c: ChunkCoord; d2: number }[] = [];
  for (let dz = -span; dz <= span; dz++) {
    for (let dx = -span; dx <= span; dx++) {
      if (dx === 0 && dz === 0) continue;
      const c = { cx: here.cx + dx, cz: here.cz + dz };
      const d2 = centerD2(x, z, c);
      if (d2 <= r2 && insideWorld(c, worldLimitM)) found.push({ c, d2 });
    }
  }
  found.sort((a, b) => a.d2 - b.d2 || a.c.cz - b.c.cz || a.c.cx - b.c.cx);
  return [here, ...found.map((f) => f.c)].slice(0, Math.max(0, maxChunks));
}

/**
 * Ce qu'il faut charger et décharger pour un joueur en (x, z), sachant ce qui est déjà chargé.
 * Priorité aux chunks déjà chargés : ils restent tant qu'ils sont dans la vue + la marge (et sous le plafond) ;
 * les nouveaux comblent la place restante, du plus proche au plus lointain.
 */
export function planStreaming(
  x: number,
  z: number,
  loaded: ReadonlyMap<string, ChunkCoord>,
  params: StreamParams,
): StreamPlan {
  const radius = effectiveViewRadius(params.viewRadiusM, params.maxChunks);
  const worldLimitM = WORLD_RADIUS_M + radius;
  const here = chunkCoordOf(x, z);
  const keepR = radius + params.unloadMarginM;
  const keepable = (c: ChunkCoord): boolean =>
    (c.cx === here.cx && c.cz === here.cz) || (centerD2(x, z, c) <= keepR * keepR && insideWorld(c, worldLimitM));

  const byDistance = (a: ChunkCoord, b: ChunkCoord): number => centerD2(x, z, a) - centerD2(x, z, b) || a.cz - b.cz || a.cx - b.cx;
  const kept = [...loaded.values()].filter(keepable).sort(byDistance).slice(0, Math.max(0, params.maxChunks));
  const keptKeys = new Set(kept.map((c) => chunkKey(c.cx, c.cz)));
  const toUnload = [...loaded.keys()].filter((k) => !keptKeys.has(k));

  const budget = Math.max(0, params.maxChunks - kept.length);
  const toLoad = chunksAround(x, z, radius, params.maxChunks, worldLimitM)
    .filter((c) => !loaded.has(chunkKey(c.cx, c.cz)))
    .slice(0, budget);
  return { wanted: [...kept, ...toLoad].sort(byDistance), toLoad, toUnload };
}
