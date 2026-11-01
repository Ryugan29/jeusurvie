import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PLAYER_MAX_SLOPE } from '../config/balance';
import { CHUNK_SIZE, CHUNK_VERTS, chunkKey, generateChunk, type ChunkData } from '../world/chunk';
import { groundHeight, groundHeightIn, moveOnGround } from './ground';

const STEP = CHUNK_SIZE / (CHUNK_VERTS - 1);
const seed = fc.integer({ min: 0, max: 0xffffffff });
const cc = fc.integer({ min: -50, max: 50 });
const vertex = fc.integer({ min: 0, max: CHUNK_VERTS - 1 });

describe('groundHeight (hauteurs float32 du chunk, même triangulation que le maillage)', () => {
  it('vaut exactement la hauteur stockée sur chaque sommet', () => {
    fc.assert(
      fc.property(seed, cc, cc, vertex, vertex, (s, cx, cz, col, row) => {
        const c = generateChunk(s, cx, cz);
        const origin = { x: cx * CHUNK_SIZE, z: cz * CHUNK_SIZE };
        // === et non Object.is : un sommet float32 peut valoir -0, qui est la même hauteur que 0.
        expect(groundHeight(c.heights, origin, origin.x + col * STEP, origin.z + row * STEP) === c.heights[row * CHUNK_VERTS + col]).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  it('reste entre le min et le max des 4 coins du quad', () => {
    fc.assert(
      fc.property(seed, fc.double({ min: 0, max: 64, noNaN: true }), fc.double({ min: 0, max: 64, noNaN: true }), (s, lx, lz) => {
        const c = generateChunk(s, 0, 0);
        const h = groundHeight(c.heights, { x: 0, z: 0 }, lx, lz)!;
        const col = Math.min(Math.floor(lx / STEP), CHUNK_VERTS - 2), row = Math.min(Math.floor(lz / STEP), CHUNK_VERTS - 2);
        const corners = [0, 1, CHUNK_VERTS, CHUNK_VERTS + 1].map((o) => c.heights[row * CHUNK_VERTS + col + o]!);
        expect(h).toBeGreaterThanOrEqual(Math.min(...corners) - 1e-9);
        expect(h).toBeLessThanOrEqual(Math.max(...corners) + 1e-9);
      }),
      { numRuns: 50 },
    );
  });

  it('hors du chunk : undefined', () => {
    const c = generateChunk(1, 0, 0);
    expect(groundHeight(c.heights, { x: 0, z: 0 }, -0.01, 3)).toBeUndefined();
    expect(groundHeight(c.heights, { x: 0, z: 0 }, 3, 64.01)).toBeUndefined();
    expect(groundHeight(c.heights, { x: 0, z: 0 }, 64, 64)).toBe(c.heights[CHUNK_VERTS * CHUNK_VERTS - 1]);
  });

  it('groundHeightIn : cherche le bon chunk chargé, undefined si le chunk est absent', () => {
    const chunks = new Map<string, ChunkData>([[chunkKey(1, -1), generateChunk(7, 1, -1)]]);
    const c = chunks.get(chunkKey(1, -1))!;
    expect(groundHeightIn(chunks, 64 + 10, -64 + 20)).toBe(groundHeight(c.heights, { x: 64, z: -64 }, 74, -44));
    expect(groundHeightIn(chunks, 10, 10)).toBeUndefined();
  });
});

describe('moveOnGround (minimal : déplacement XZ + pose sur le sol)', () => {
  const flat = (): number => 2;
  const ramp = (slope: number) => (x: number): number => x * slope;

  it('sur le plat : avance et se pose sur le sol', () => {
    expect(moveOnGround({ x: 0, y: 9, z: 0 }, { dx: 1, dz: -2 }, flat, PLAYER_MAX_SLOPE)).toEqual({ x: 1, y: 2, z: -2 });
  });

  it('sans sol chargé à l’arrivée : ne bouge pas', () => {
    const ground = (x: number): number | undefined => (x < 1 ? 0 : undefined);
    expect(moveOnGround({ x: 0, y: 0, z: 0 }, { dx: 2, dz: 0 }, ground, PLAYER_MAX_SLOPE)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('montée trop raide refusée, descente et pente douce acceptées', () => {
    const steep = ramp(PLAYER_MAX_SLOPE * 1.5);
    expect(moveOnGround({ x: 0, y: 0, z: 0 }, { dx: 1, dz: 0 }, steep, PLAYER_MAX_SLOPE)).toEqual({ x: 0, y: 0, z: 0 });
    const down = moveOnGround({ x: 1, y: steep(1), z: 0 }, { dx: -1, dz: 0 }, steep, PLAYER_MAX_SLOPE);
    expect(down.x).toBe(0);
    const gentle = moveOnGround({ x: 0, y: 0, z: 0 }, { dx: 1, dz: 0 }, ramp(PLAYER_MAX_SLOPE * 0.5), PLAYER_MAX_SLOPE);
    expect(gentle).toEqual({ x: 1, y: PLAYER_MAX_SLOPE * 0.5, z: 0 });
  });

  it('immobile : reste en place, posé sur le sol', () => {
    expect(moveOnGround({ x: 3, y: 50, z: 4 }, { dx: 0, dz: 0 }, flat, PLAYER_MAX_SLOPE)).toEqual({ x: 3, y: 2, z: 4 });
  });
});
