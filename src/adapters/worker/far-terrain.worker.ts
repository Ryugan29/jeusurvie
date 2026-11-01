// Point d'entrée du Web Worker du relief lointain : reçoit un centre, rend le maillage en tampons transférés (render-data/far-terrain).
import { buildFarTerrain, type FarTerrainRequest, type FarTerrainResult } from '../render-data/far-terrain';

const scope = self as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<FarTerrainRequest>) => {
  const { id, seed, centerX, centerZ, options } = event.data;
  const mesh = buildFarTerrain(seed, centerX, centerZ, options);
  const result: FarTerrainResult = { id, centerX, centerZ, mesh };
  scope.postMessage(result, [mesh.positions.buffer, mesh.normals.buffer, mesh.colors.buffer, mesh.indices.buffer]);
};
