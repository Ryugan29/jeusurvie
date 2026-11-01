// Messages échangés avec chunk.worker, et le travail qu'il fait (pur, donc testable sans worker).
import { generateChunk, type ChunkData } from '../../core/world/chunk';
import { groundCoverInChunk } from '../../core/world/ground-cover';
import { resourcesInChunk } from '../../core/world/placement';
import { groundCoverInstances } from '../render-data/ground-cover-instances';
import { buildChunkMesh, worldSamplers, type ChunkMeshData } from '../render-data/mesh-data';
import { vegetationInstances, type VegetationBatches } from '../render-data/vegetation-instances';

export interface ChunkRequestMsg {
  readonly type: 'generate';
  readonly seed: number;
  readonly cx: number;
  readonly cz: number;
  /** Calculer aussi le couvre-sol (le plus gros du travail visuel) ; faux : lots vides (démo ?couvert=0, mesures). */
  readonly groundCover: boolean;
}

export interface ChunkResultMsg {
  readonly type: 'chunk';
  /** Le chunk tel que généré (genVersion compris) ; ses hauteurs sont transférées sans copie. */
  readonly chunk: ChunkData;
  readonly mesh: ChunkMeshData;
  /** Matrices d'instances de la végétation, par modèle (clé de VEGETATION_MODELS). */
  readonly vegetation: VegetationBatches;
  /** Matrices d'instances du couvre-sol (herbe, fleurs, cailloux…), par modèle ; vide si la demande l'a coupé. */
  readonly groundCover: VegetationBatches;
}

/** Ce que le rendu reçoit pour un chunk prêt (tout ce qui se dessine, hors règles du jeu). */
export interface ChunkRenderData {
  readonly mesh: ChunkMeshData;
  readonly vegetation: VegetationBatches;
  readonly groundCover: VegetationBatches;
}

/** Génère le chunk et son maillage ; `transfer` liste les tampons à transférer (zéro copie). */
export function runChunkJob(req: ChunkRequestMsg): { result: ChunkResultMsg; transfer: ArrayBuffer[] } {
  const chunk = generateChunk(req.seed, req.cx, req.cz);
  const mesh = buildChunkMesh(chunk, worldSamplers(req.seed, req.cx, req.cz));
  const vegetation = vegetationInstances(resourcesInChunk(req.seed, req.cx, req.cz), chunk);
  const groundCover = req.groundCover ? groundCoverInstances(groundCoverInChunk(req.seed, chunk), chunk) : {};
  const buffers = [chunk.heights, mesh.positions, mesh.normals, mesh.colors, mesh.layers, mesh.indices, ...Object.values(vegetation), ...Object.values(groundCover)].map(
    (a) => a.buffer as ArrayBuffer,
  );
  return { result: { type: 'chunk', chunk, mesh, vegetation, groundCover }, transfer: buffers };
}
