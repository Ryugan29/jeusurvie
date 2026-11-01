import { describe, expect, it } from 'vitest';
import { generateChunk } from '../../core/world/chunk';
import { groundCoverInChunk } from '../../core/world/ground-cover';
import { resourcesInChunk } from '../../core/world/placement';
import { groundCoverInstances } from '../render-data/ground-cover-instances';
import { buildChunkMesh, worldSamplers } from '../render-data/mesh-data';
import { vegetationInstances } from '../render-data/vegetation-instances';
import { runChunkJob } from './chunk-protocol';

describe('runChunkJob (travail du worker, pur)', () => {
  it('rend le chunk et son maillage, identiques aux fonctions pures', () => {
    const { result } = runChunkJob({ type: 'generate', seed: 42, cx: -3, cz: 7, groundCover: true });
    const chunk = generateChunk(42, -3, 7);
    expect(result).toEqual({
      type: 'chunk',
      chunk,
      mesh: buildChunkMesh(chunk, worldSamplers(42, -3, 7)),
      vegetation: vegetationInstances(resourcesInChunk(42, -3, 7), chunk),
      groundCover: groundCoverInstances(groundCoverInChunk(42, chunk), chunk),
    });
    expect(Object.keys(result.groundCover).length).toBeGreaterThan(0);
  });

  it('sans couvre-sol (groundCover: false) : aucun lot de couvre-sol, le reste est identique et rien n’est calculé pour rien', () => {
    const on = runChunkJob({ type: 'generate', seed: 42, cx: -3, cz: 7, groundCover: true }).result;
    const off = runChunkJob({ type: 'generate', seed: 42, cx: -3, cz: 7, groundCover: false }).result;
    expect(off.groundCover).toEqual({});
    expect(off.chunk).toEqual(on.chunk);
    expect(off.mesh).toEqual(on.mesh);
    expect(off.vegetation).toEqual(on.vegetation);
  });

  it('liste tous les tampons à transférer sans copie, chacun une seule fois', () => {
    const { result, transfer } = runChunkJob({ type: 'generate', seed: 1, cx: 0, cz: 0, groundCover: true });
    const expected = [result.chunk.heights.buffer, result.mesh.positions.buffer, result.mesh.normals.buffer, result.mesh.colors.buffer, result.mesh.layers.buffer, result.mesh.indices.buffer];
    const vegetation = Object.values(result.vegetation).map((m) => m.buffer);
    expect(vegetation.length).toBeGreaterThan(0); // le point de départ (0, 0) est entouré de végétation
    expected.push(...vegetation);
    const cover = Object.values(result.groundCover).map((m) => m.buffer);
    expect(cover.length).toBeGreaterThan(0);
    expected.push(...cover);
    expect(transfer).toHaveLength(expected.length);
    expect(new Set(transfer).size).toBe(expected.length);
    for (const b of expected) expect(transfer).toContain(b);
  });
});
