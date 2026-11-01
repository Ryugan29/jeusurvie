// Couvre-sol : herbe, trèfles, fleurs, fougères, champignons et cailloux posés sur le sol d'un chunk. PUREMENT VISUEL :
// ni collision, ni récolte, ni identifiant (les ressources de placement.ts restent les seules à compter pour le jeu).
// Pur et déterministe (opérations de base seulement, comme le reste de core/world) : mêmes graine et chunk, même liste.
//
// Le chunk est découpé en cases de 1 m. Pour chaque case, des bruits (tapis de prairie, touffes, plaques de trèfles et
// de fleurs, sous-bois) donnent une densité par type ; le nombre d'éléments est le tirage entier de cette densité, leur
// position, rotation et échelle viennent du hash de la case. Rien ne dépend des chunks voisins, sauf les arbres (lus
// dans la grille globale de placement.ts) : fougères et champignons s'y rattachent, même de l'autre côté d'un bord.
// Le sol (pente, altitude) vient des hauteurs du chunk, déjà calculées : pas de heightAt par case.
import { hash2 } from '../shared/hash';
import { smoothstep } from '../shared/math';
import { biomeAt } from './biome';
import { CHUNK_SIZE, CHUNK_VERTS, type ChunkData } from './chunk';
import { fbm2 } from './noise';
import { pathAt } from './paths';
import { forestFactorAt, RESOURCE_CELL_M, resourcesInCells, treeLineAt, type Resource } from './placement';
import { heightInQuad } from './triangulation';

export type CoverKind = 'grass' | 'clover' | 'flower' | 'fern' | 'mushroom' | 'pebble';

/**
 * Modèles 3D de chaque type (clés de assets/models/nature). L'herbe, la masse du couvre-sol, n'utilise que les deux
 * modèles les plus légers (155 et 326 triangles) ; les autres types sont rares ou en plaques.
 */
export const GROUND_COVER_MODELS: Readonly<Record<CoverKind, readonly string[]>> = {
  grass: ['Grass_Common_Short', 'Grass_Common_Tall'],
  clover: ['Clover_1', 'Clover_2'],
  flower: ['Petal_1', 'Petal_2', 'Petal_4', 'Flower_3_Single', 'Flower_4_Single'],
  fern: ['Fern_1', 'Plant_1', 'Plant_7', 'Plant_7_Big'],
  mushroom: ['Mushroom_Common'],
  pebble: ['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Square_2', 'Pebble_Square_4', 'RockPath_Square_Small_2'],
};

export interface CoverItem {
  readonly kind: CoverKind;
  /** Clé de modèle (de GROUND_COVER_MODELS[kind]). */
  readonly model: string;
  /** Position dans le monde (m), à l'intérieur du chunk. */
  readonly x: number;
  readonly z: number;
  /** Rotation autour de la verticale, en tours (dans [0, 1)). */
  readonly rotation: number;
  /** Échelle uniforme (> 0). */
  readonly scale: number;
}

/** Côté d'une case du couvre-sol (m) : divise CHUNK_SIZE. */
export const COVER_CELL_M = 1;
const CELLS = CHUNK_SIZE / COVER_CELL_M;
/** Pas (m) des hauteurs du chunk. */
const STEP = CHUNK_SIZE / (CHUNK_VERTS - 1);
/** Côté (m) des blocs où le biome (froid) est évalué : il varie sur des kilomètres. */
const BIOME_BLOCK_M = 8;
const BIOME_BLOCKS = CHUNK_SIZE / BIOME_BLOCK_M;

/** Pente (dénivelé par mètre) où les plantes commencent à se raréfier, et où elles ont disparu (la terre puis la roche suivent). */
const SLOPE_FROM = 0.3;
export const COVER_MAX_SLOPE = 0.62;
/** Part de sentier (pathAt) où les plantes commencent à se raréfier, et au-delà de laquelle il n'y en a plus du tout. */
const PATH_TAPER_FROM = 0.15;
export const COVER_PATH_MAX = 0.6;
/** Bande du bord d'un sentier où se posent les cailloux (pathAt). */
const PEBBLE_BAND = { from: 0.3, to: 0.7 } as const;

/** Les plantes s'arrêtent avec les arbres : pleines jusqu'à 10 m sous la limite des arbres, plus rien 20 m au-dessus. */
const ALTITUDE_FADE_BELOW_M = 10, ALTITUDE_FADE_ABOVE_M = 20;

// Bruits (le fBm reste en pratique dans ±0,5 : on l'étire avant de le seuiller).
const NOISE_STRETCH = 2.2;
const CARPET = { frequency: 1 / 30, octaves: 2, lacunarity: 2, gain: 0.5, salt: 72 } as const; // prairies denses ou clairsemées
const TUFT = { frequency: 1 / 4.5, octaves: 2, lacunarity: 2, gain: 0.5, salt: 73 } as const; // touffes (quelques mètres)
const CLOVER = { frequency: 1 / 10, octaves: 1, lacunarity: 2, gain: 0.5, salt: 74 } as const;
const FLOWERS = { frequency: 1 / 13, octaves: 1, lacunarity: 2, gain: 0.5, salt: 75 } as const;

/** Éléments par case, au plus : l'herbe d'une prairie dense (hors touffes) approche GRASS_PER_CELL. Herbe basse (écrasée au rendu,
 * render-data/ground-cover-instances) : plus de touffes pour un tapis continu plutôt que des plants isolés. */
const GRASS_PER_CELL = 6, CLOVER_PER_CELL = 1, FLOWER_PER_CELL = 1.2, FERN_PER_CELL = 0.25;
/** Cailloux : essais par case au bord d'un sentier (part gardée dans la bande), et éparpillés ailleurs (par case). */
const PEBBLE_TRIES = 3, PEBBLE_EDGE_CHANCE = 0.5, PEBBLE_SCATTER = 0.004;
/** Champignons : chance par arbre (feuillu, pin), grappes de 1 à 3 à 1,2–2 m du tronc, étalées de ± 25 cm. */
const MUSHROOM_CHANCE = { tree: 0.7, pine: 0.45 } as const;
const MUSHROOM_RING = { min: 1.2, max: 2 } as const;
const MUSHROOM_SPREAD_M = 0.25;
const MUSHROOM_RING_TRIES = 8;
/** Au pied d'un tronc l'herbe s'éclaircit : 20 % de la densité à 1,2 m, pleine densité à 3,2 m. */
const TRUNK_CLEAR_MIN = 0.2, TRUNK_CLEAR_FROM_M = 1.2, TRUNK_CLEAR_TO_M = 3.2;
/** Au-delà de cette distance (m) à un tronc, plus de « près d'un arbre » : le sous-bois dépend du bosquet seulement. */
const TREE_REACH_M = 8;

// Sels du hash (séparés de ceux de placement.ts, 51 à 53) : un bloc de 30 par type ; dedans, 3 tirages par élément (draw)
// et un tirage du nombre d'éléments (COUNT_OFFSET).
const SALT_GRASS = 300, SALT_CLOVER = 330, SALT_FLOWER = 360, SALT_FERN = 390, SALT_PEBBLE = 420, SALT_PEBBLE_SCATTER = 450, SALT_MUSHROOM = 480;
const COUNT_OFFSET = 29;
const UNIT = 1 / 65536;
const low = (h: number): number => (h & 0xffff) * UNIT;
const high = (h: number): number => (h >>> 16) * UNIT;

/** Les trois tirages indépendants de l'élément `k` du type `salt` de la case : position (2 × 16 bits), aspect (rotation, échelle), choix du modèle. */
function draw(seed: number, gx: number, gz: number, salt: number, k: number): { pos: number; look: number; roll: number } {
  return { pos: hash2(seed, gx, gz, salt + 3 * k), look: hash2(seed, gx, gz, salt + 3 * k + 1), roll: low(hash2(seed, gx, gz, salt + 3 * k + 2)) };
}

/** Choix pondéré : `roll` ∈ [0, 1[ désigne un des `weights`. */
function pick(roll: number, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]! / total;
    if (roll < acc) return i;
  }
  return weights.length - 1;
}

/** Distance (m) de chaque case au tronc le plus proche, bornée à TREE_REACH_M (case par case, ligne par ligne). */
function treeDistances(trees: readonly Resource[], ox: number, oz: number): Float32Array {
  const out = new Float32Array(CELLS * CELLS).fill(TREE_REACH_M);
  const reach = Math.ceil(TREE_REACH_M / COVER_CELL_M);
  for (const t of trees) {
    const tcx = Math.floor((t.x - ox) / COVER_CELL_M), tcz = Math.floor((t.z - oz) / COVER_CELL_M);
    for (let cz = Math.max(0, tcz - reach); cz <= Math.min(CELLS - 1, tcz + reach); cz++) {
      for (let cx = Math.max(0, tcx - reach); cx <= Math.min(CELLS - 1, tcx + reach); cx++) {
        const dx = ox + (cx + 0.5) * COVER_CELL_M - t.x, dz = oz + (cz + 0.5) * COVER_CELL_M - t.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < out[cz * CELLS + cx]!) out[cz * CELLS + cx] = d;
      }
    }
  }
  return out;
}

/**
 * Couvre-sol du chunk, dans l'ordre des cases (z puis x), les champignons à la fin.
 * @param seed graine du monde, entier non signé 32 bits (validée à la frontière).
 * @param chunk le chunk déjà généré : ses hauteurs donnent la pente et l'altitude de chaque case.
 */
export function groundCoverInChunk(seed: number, chunk: ChunkData): CoverItem[] {
  const ox = chunk.cx * CHUNK_SIZE, oz = chunk.cz * CHUNK_SIZE;
  const out: CoverItem[] = [];
  const H = chunk.heights, V = CHUNK_VERTS;

  // Arbres du chunk et d'une case de marge (8 m) : sous-bois, champignons.
  const gx0 = chunk.cx * (CHUNK_SIZE / RESOURCE_CELL_M), gz0 = chunk.cz * (CHUNK_SIZE / RESOURCE_CELL_M);
  const span = CHUNK_SIZE / RESOURCE_CELL_M;
  const trees = resourcesInCells(seed, gx0 - 1, gz0 - 1, gx0 + span + 1, gz0 + span + 1).filter((r) => r.kind === 'tree' || r.kind === 'pine');
  const treeDist = treeDistances(trees, ox, oz);

  // Froid (limite des arbres, nombre de fleurs) : une valeur par bloc de 8 m.
  const cold = new Float32Array(BIOME_BLOCKS * BIOME_BLOCKS);
  for (let bz = 0; bz < BIOME_BLOCKS; bz++) {
    for (let bx = 0; bx < BIOME_BLOCKS; bx++) cold[bz * BIOME_BLOCKS + bx] = biomeAt(seed, ox + (bx + 0.5) * BIOME_BLOCK_M, oz + (bz + 0.5) * BIOME_BLOCK_M).cold;
  }

  for (let cz = 0; cz < CELLS; cz++) {
    for (let cx = 0; cx < CELLS; cx++) {
      // --- Sol : pente et altitude de la case, sur le triangle du sol qui la contient (même triangulation que le rendu).
      const col = Math.floor((cx * COVER_CELL_M) / STEP), row = Math.floor((cz * COVER_CELL_M) / STEP);
      const fx = ((cx + 0.5) * COVER_CELL_M - col * STEP) / STEP, fz = ((cz + 0.5) * COVER_CELL_M - row * STEP) / STEP;
      const i = row * V + col;
      const h00 = H[i]!, h10 = H[i + 1]!, h01 = H[i + V]!, h11 = H[i + V + 1]!;
      const upper = fx >= fz; // triangle (a, b, d), sinon (a, d, c)
      const gradX = upper ? (h10 - h00) / STEP : (h11 - h01) / STEP;
      const gradZ = upper ? (h11 - h10) / STEP : (h01 - h00) / STEP;
      const slopeK = 1 - smoothstep(SLOPE_FROM, COVER_MAX_SLOPE, Math.sqrt(gradX * gradX + gradZ * gradZ));
      if (slopeK <= 0) continue;
      const mx = ox + (cx + 0.5) * COVER_CELL_M, mz = oz + (cz + 0.5) * COVER_CELL_M;
      const coldHere = cold[Math.floor((cz * COVER_CELL_M) / BIOME_BLOCK_M) * BIOME_BLOCKS + Math.floor((cx * COVER_CELL_M) / BIOME_BLOCK_M)]!;
      const line = treeLineAt(coldHere);
      const altK = 1 - smoothstep(line - ALTITUDE_FADE_BELOW_M, line + ALTITUDE_FADE_ABOVE_M, heightInQuad(h00, h10, h01, h11, fx, fz));
      const terrainK = slopeK * altK;
      if (terrainK <= 0) continue;

      // --- Sentier : au centre de la case ; si la case est touchée, chaque élément est contrôlé à sa propre position.
      const pathHere = pathAt(seed, mx, mz);
      const nearPath = pathHere > 0;
      const pathK = 1 - smoothstep(PATH_TAPER_FROM, COVER_PATH_MAX, pathHere);
      const gcx = chunk.cx * CELLS + cx, gcz = chunk.cz * CELLS + cz;
      const x0 = ox + cx * COVER_CELL_M, z0 = oz + cz * COVER_CELL_M;
      const free = (x: number, z: number): boolean => !nearPath || pathAt(seed, x, z) < COVER_PATH_MAX;
      const emit = (kind: CoverKind, model: string, d: { pos: number; look: number }, scaleMin: number, scaleSpan: number): void => {
        const x = x0 + low(d.pos) * COVER_CELL_M, z = z0 + high(d.pos) * COVER_CELL_M;
        if (!free(x, z)) return;
        out.push({ kind, model, x, z, rotation: low(d.look), scale: scaleMin + scaleSpan * high(d.look) });
      };
      /** Nombre entier d'éléments d'une case : `density` × `perCell`, arrondi au hasard (le tirage est celui de la case). */
      const count = (density: number, perCell: number, salt: number): number => Math.floor(density * perCell + low(hash2(seed, gcx, gcz, salt + COUNT_OFFSET)));

      const forest = forestFactorAt(seed, mx, mz);
      const carpet = smoothstep(-0.3, 0.3, NOISE_STRETCH * fbm2(seed, mx * CARPET.frequency, mz * CARPET.frequency, CARPET, CARPET.salt));
      const tuft = smoothstep(-0.15, 0.35, NOISE_STRETCH * fbm2(seed, mx * TUFT.frequency, mz * TUFT.frequency, TUFT, TUFT.salt));
      const cloverK = terrainK * pathK * (1 - coldHere) * smoothstep(0.25, 0.6, NOISE_STRETCH * fbm2(seed, mx * CLOVER.frequency, mz * CLOVER.frequency, CLOVER, CLOVER.salt));
      const flowerK = terrainK * pathK * (1 - coldHere) * smoothstep(0.25, 0.55, NOISE_STRETCH * fbm2(seed, mx * FLOWERS.frequency, mz * FLOWERS.frequency, FLOWERS, FLOWERS.salt));

      // --- Herbe : tapis (prairie) × touffes, moins dans le froid, dans les plaques de trèfles et au pied des troncs
      // (sol dégagé : les champignons et les fougères s'y voient).
      const trunkDistance = treeDist[cz * CELLS + cx]!;
      const trunkK = TRUNK_CLEAR_MIN + (1 - TRUNK_CLEAR_MIN) * smoothstep(TRUNK_CLEAR_FROM_M, TRUNK_CLEAR_TO_M, trunkDistance);
      const grassK = terrainK * pathK * (0.3 + 0.7 * carpet) * (0.2 + 0.8 * tuft) * (1 - 0.5 * coldHere) * (1 - 0.6 * cloverK) * trunkK;
      for (let k = 0, n = count(grassK, GRASS_PER_CELL, SALT_GRASS); k < n; k++) {
        const d = draw(seed, gcx, gcz, SALT_GRASS, k);
        const tall = tuft > 0.6 && d.roll < 0.4; // les hautes touffes (2 fois plus lourdes) seulement au cœur des touffes
        emit('grass', GROUND_COVER_MODELS.grass[tall ? 1 : 0]!, d, tall ? 0.5 : 0.6, tall ? 0.3 : 0.35);
      }

      // --- Trèfles et fleurs : en plaques.
      for (let k = 0, n = count(cloverK, CLOVER_PER_CELL, SALT_CLOVER); k < n; k++) {
        const d = draw(seed, gcx, gcz, SALT_CLOVER, k);
        emit('clover', GROUND_COVER_MODELS.clover[pick(d.roll, [5, 1])]!, d, 0.3, 0.2);
      }
      for (let k = 0, n = count(flowerK, FLOWER_PER_CELL, SALT_FLOWER); k < n; k++) {
        const d = draw(seed, gcx, gcz, SALT_FLOWER, k);
        const which = pick(d.roll, [1.4, 1.4, 1.4, 0.9, 0.5]); // trois pétales (légers), puis deux fleurs sur tige
        const single = which >= 3;
        emit('flower', GROUND_COVER_MODELS.flower[which]!, d, single ? 0.28 : 0.55, single ? 0.12 : 0.4);
      }

      // --- Sous-bois : fougères et plantes dans les bosquets, surtout près des troncs.
      const near = 1 - smoothstep(1.5, TREE_REACH_M, trunkDistance);
      const fernK = terrainK * pathK * (0.25 + 0.75 * smoothstep(0.5, 1.8, forest)) * (0.2 + 0.8 * near) * (1 - 0.6 * coldHere);
      for (let k = 0, n = count(fernK, FERN_PER_CELL, SALT_FERN); k < n; k++) {
        const d = draw(seed, gcx, gcz, SALT_FERN, k);
        const which = pick(d.roll, [11, 3, 3, 3]); // surtout la grande fougère
        emit('fern', GROUND_COVER_MODELS.fern[which]!, d, which === 0 ? 0.45 : which === 1 ? 0.5 : 0.7, which === 0 ? 0.35 : which === 1 ? 0.4 : 0.6);
      }

      // --- Cailloux : au bord des sentiers (essais dans la bande de bord), quelques-uns éparpillés ailleurs.
      if (nearPath) {
        for (let k = 0; k < PEBBLE_TRIES; k++) {
          const d = draw(seed, gcx, gcz, SALT_PEBBLE, k);
          if (d.roll >= PEBBLE_EDGE_CHANCE) continue;
          const x = x0 + low(d.pos) * COVER_CELL_M, z = z0 + high(d.pos) * COVER_CELL_M;
          const p = pathAt(seed, x, z);
          if (p >= PEBBLE_BAND.from && p <= PEBBLE_BAND.to) out.push(pebble(x, z, d, d.roll / PEBBLE_EDGE_CHANCE));
        }
      } else {
        const d = draw(seed, gcx, gcz, SALT_PEBBLE_SCATTER, 0);
        if (d.roll < PEBBLE_SCATTER * terrainK) out.push(pebble(x0 + low(d.pos) * COVER_CELL_M, z0 + high(d.pos) * COVER_CELL_M, d, d.roll / (PEBBLE_SCATTER * terrainK)));
      }
    }
  }

  // --- Champignons : en grappes au pied des arbres (arbres du chunk et de ses voisins ; seuls ceux d'ici sont gardés).
  for (const t of trees) {
    const gx = Math.floor(t.x / RESOURCE_CELL_M), gz = Math.floor(t.z / RESOURCE_CELL_M);
    if (low(hash2(seed, gx, gz, SALT_MUSHROOM)) >= MUSHROOM_CHANCE[t.kind === 'pine' ? 'pine' : 'tree']) continue;
    // Centre de la grappe : un point de l'anneau autour du tronc (essais dans le carré, sans trigonométrie).
    let ringX: number = MUSHROOM_RING.min, ringZ = 0;
    for (let a = 0; a < MUSHROOM_RING_TRIES; a++) {
      const h = hash2(seed, gx, gz, SALT_MUSHROOM + 1 + a);
      const dx = (2 * low(h) - 1) * MUSHROOM_RING.max, dz = (2 * high(h) - 1) * MUSHROOM_RING.max;
      const r2 = dx * dx + dz * dz;
      if (r2 >= MUSHROOM_RING.min * MUSHROOM_RING.min && r2 <= MUSHROOM_RING.max * MUSHROOM_RING.max) {
        ringX = dx;
        ringZ = dz;
        break;
      }
    }
    const n = 1 + Math.floor(low(hash2(seed, gx, gz, SALT_MUSHROOM + 20)) * 3);
    for (let k = 0; k < n; k++) {
      const h = hash2(seed, gx, gz, SALT_MUSHROOM + 21 + 2 * k), look = hash2(seed, gx, gz, SALT_MUSHROOM + 22 + 2 * k);
      const x = t.x + ringX + (2 * low(h) - 1) * MUSHROOM_SPREAD_M, z = t.z + ringZ + (2 * high(h) - 1) * MUSHROOM_SPREAD_M;
      if (x < ox || x >= ox + CHUNK_SIZE || z < oz || z >= oz + CHUNK_SIZE) continue;
      if (pathAt(seed, x, z) >= COVER_PATH_MAX) continue;
      out.push({ kind: 'mushroom', model: GROUND_COVER_MODELS.mushroom[0]!, x, z, rotation: low(look), scale: 0.9 + 0.6 * high(look) });
    }
  }
  return out;
}

/** Un caillou en (x, z) : le modèle selon `choice` (tirage dans [0, 1[ indépendant de l'acceptation), plus petit pour les dalles de sentier (RockPath, 1 m de large à l'échelle 1). */
function pebble(x: number, z: number, d: { look: number }, choice: number): CoverItem {
  const which = pick(choice, [30, 25, 20, 15, 10]);
  const slab = which === 4;
  return { kind: 'pebble', model: GROUND_COVER_MODELS.pebble[which]!, x, z, rotation: low(d.look), scale: (slab ? 0.5 : 0.6) + (slab ? 0.4 : 0.7) * high(d.look) };
}
