// ChunkData → tampons de maillage (PUR : n'importe pas Babylon). Tourne dans le worker ; les tampons sont
// transférés au fil principal sans copie.
import { biomeAt } from '../../core/world/biome';
import { CHUNK_SIZE, CHUNK_VERTS, type ChunkData } from '../../core/world/chunk';
import { pathAt } from '../../core/world/paths';
import { surfaceVariation } from '../../core/world/surface';
import { heightAt } from '../../core/world/terrain';
import { quadTriangles } from '../../core/world/triangulation';
import { terrainColor, terrainLayers, type SurfaceTint } from './palette';
import { SHADE_REACH, terrainShade } from './shade';

const V = CHUNK_VERTS;
const STEP = CHUNK_SIZE / (V - 1);
/** Bordure de sommets lus hors du chunk : normales (1) et ombrage (SHADE_REACH). */
const PAD = Math.max(1, SHADE_REACH);
const W = V + 2 * PAD;

export interface ChunkMeshData {
  /** Positions locales au chunk (x, y, z) ; le maillage est placé au coin (cx·64, 0, cz·64). */
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** Couleurs de sommets RGBA. */
  readonly colors: Float32Array;
  /** Poids des textures peintes par sommet (terre, roche, neige ; l'herbe prend le reste) : palette → terrainLayers. */
  readonly layers: Float32Array;
  readonly indices: Uint16Array;
}

/**
 * Hauteur d'un sommet (col, row) du chunk ou de sa bordure : le maillage lit jusqu'à PAD (= SHADE_REACH, 6) sommets
 * hors du chunk de chaque côté (normales et ombrage), chacun une seule fois (mis en cache).
 */
export type HeightSampler = (col: number, row: number) => number;
/** Variation de surface au sommet (col, row) du chunk (plaques d'herbe, limite de neige, biome, sentier). */
export type SurfaceSampler = (col: number, row: number) => SurfaceTint;

export interface MeshSamplers {
  readonly heights: HeightSampler;
  readonly surface: SurfaceSampler;
}

/**
 * Échantillonneur des hauteurs autour du chunk (cx, cz) : float32 de heightAt aux coordonnées monde,
 * exactement comme ChunkData.heights (contrat de generateChunk). Sert aux normales et à l'ombrage des bords.
 */
export function worldHeightSampler(seed: number, cx: number, cz: number): HeightSampler {
  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
  return (col, row) => Math.fround(heightAt(seed, ox + col * STEP, oz + row * STEP));
}

/** Échantillonneurs du monde de graine `seed` pour le chunk (cx, cz). */
export function worldSamplers(seed: number, cx: number, cz: number): MeshSamplers {
  const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
  return {
    heights: worldHeightSampler(seed, cx, cz),
    surface: (col, row) => {
      const x = ox + col * STEP, z = oz + row * STEP;
      return { ...surfaceVariation(seed, x, z), cold: biomeAt(seed, x, z).cold, path: pathAt(seed, x, z) };
    },
  };
}

export function buildChunkMesh(chunk: ChunkData, samplers: MeshSamplers): ChunkMeshData {
  const h = chunk.heights;
  // Grille bordée : l'intérieur vient du chunk, la bordure est lue une seule fois (cache).
  const grid = new Float32Array(W * W);
  for (let row = -PAD; row < V + PAD; row++) {
    for (let col = -PAD; col < V + PAD; col++) {
      const inside = col >= 0 && col < V && row >= 0 && row < V;
      grid[(row + PAD) * W + col + PAD] = inside ? h[row * V + col]! : samplers.heights(col, row);
    }
  }
  const at = (col: number, row: number): number => grid[(row + PAD) * W + col + PAD]!;

  const positions = new Float32Array(V * V * 3);
  const normals = new Float32Array(V * V * 3);
  const colors = new Float32Array(V * V * 4);
  const layers = new Float32Array(V * V * 3);
  for (let row = 0; row < V; row++) {
    for (let col = 0; col < V; col++) {
      const i = row * V + col;
      const y = h[i]!;
      positions[i * 3] = col * STEP;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = row * STEP;
      // Normale par différences centrées (les voisins hors du chunk viennent de la bordure : bords sans couture).
      const dhdx = (at(col + 1, row) - at(col - 1, row)) / (2 * STEP);
      const dhdz = (at(col, row + 1) - at(col, row - 1)) / (2 * STEP);
      const len = Math.hypot(dhdx, 1, dhdz);
      const ny = 1 / len;
      normals[i * 3] = -dhdx / len;
      normals[i * 3 + 1] = ny;
      normals[i * 3 + 2] = -dhdz / len;
      // Couleur de la palette (avec les variations de surface), modelée par l'occlusion cuite.
      const shade = terrainShade(at, col, row, ny);
      const tint = samplers.surface(col, row);
      const [r, g, b] = terrainColor(y, ny, tint);
      colors[i * 4] = Math.min(1, r * shade);
      colors[i * 4 + 1] = Math.min(1, g * shade);
      colors[i * 4 + 2] = Math.min(1, b * shade);
      colors[i * 4 + 3] = 1;
      const layer = terrainLayers(y, ny, tint);
      layers[i * 3] = layer.soil;
      layers[i * 3 + 1] = layer.rock;
      layers[i * 3 + 2] = layer.snow;
    }
  }

  const indices = new Uint16Array((V - 1) * (V - 1) * 6);
  let k = 0;
  for (let row = 0; row < V - 1; row++) {
    for (let col = 0; col < V - 1; col++) {
      for (const index of quadTriangles(col, row, V)) indices[k++] = index;
    }
  }
  return { positions, normals, colors, layers, indices };
}
