import { describe, expect, it } from 'vitest';
import { PLAYER_RADIUS_M, SIM_HZ } from '../../core/config/balance';
import { colliderOf, type Circle } from '../../core/physics/colliders';
import { resourcesInChunk } from '../../core/world/placement';
import { CAMERA_OBSTACLE_MARGIN } from '../camera/camera-rig';
import { GameSession } from '../loop/game-session';
import { ObstacleIndex } from './obstacle-index';

const SEED = 12345;

/** Distance du point `p` au segment [a, b]. */
function distanceToSegment(p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

describe('ObstacleIndex (obstacles autour d’un point, mêmes ressources que celles dessinées)', () => {
  it('chaque tronc et chaque rocher du chunk est retrouvé à sa position', () => {
    const index = new ObstacleIndex(SEED);
    const solid = resourcesInChunk(SEED, 3, -2).filter((r) => colliderOf(r) !== undefined);
    expect(solid.length).toBeGreaterThan(0); // le test ne prouve rien sans obstacle
    for (const r of solid) {
      const own = colliderOf(r)!;
      expect(index.near(r.x, r.z), r.id).toContainEqual(own);
    }
  });

  it('ne renvoie jamais les plantes traversables', () => {
    const index = new ObstacleIndex(SEED);
    const plants = resourcesInChunk(SEED, 3, -2).filter((r) => colliderOf(r) === undefined);
    expect(plants.length).toBeGreaterThan(0);
    // Tous les obstacles possibles autour : ceux du chunk et de ses 8 voisins.
    const solid = [];
    for (let cx = 2; cx <= 4; cx++) for (let cz = -3; cz <= -1; cz++) for (const r of resourcesInChunk(SEED, cx, cz)) if (colliderOf(r) !== undefined) solid.push(colliderOf(r)!);
    for (const p of plants) for (const o of index.near(p.x, p.z)) expect(solid).toContainEqual(o); // rien d'autre que des obstacles
  });

  it('un joueur qui touche un obstacle le voit, de tous les côtés, y compris à travers un bord de case', () => {
    const index = new ObstacleIndex(SEED);
    const missed: string[] = [];
    let checked = 0;
    for (let cx = 2; cx <= 4; cx++) {
      for (let cz = -3; cz <= -1; cz++) {
        for (const r of resourcesInChunk(SEED, cx, cz)) {
          const c = colliderOf(r);
          if (c === undefined) continue;
          const touch = c.r + PLAYER_RADIUS_M - 0.01; // à un cheveu de l'obstacle : le joueur le touche
          for (let k = 0; k < 16; k++) {
            const angle = (k / 16) * 2 * Math.PI;
            const seen = index.near(c.x + touch * Math.cos(angle), c.z + touch * Math.sin(angle));
            if (!seen.some((o) => o.x === c.x && o.z === c.z && o.r === c.r)) missed.push(`${r.id} à ${k}/16`);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
    expect(missed).toEqual([]);
  });

  it('along : tout obstacle que la perche de la caméra frôle (rayon + marge) est dans la réponse', () => {
    const index = new ObstacleIndex(SEED);
    const solid: Circle[] = [];
    for (let cx = 4; cx <= 6; cx++) for (let cz = -4; cz <= -2; cz++) for (const r of resourcesInChunk(SEED, cx, cz)) if (colliderOf(r) !== undefined) solid.push(colliderOf(r)!);
    // Départs dans le chunk (5, −3) (un bosquet : 18 troncs et rochers), perches de 14 m (la plus longue possible) dans 24 directions.
    const starts = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) starts.push({ x: 330 + i * 15, z: -182 + j * 15 });
    const missed: string[] = [];
    let touched = 0;
    for (const start of starts) {
      for (let k = 0; k < 24; k++) {
        const angle = (k / 24) * 2 * Math.PI;
        const end = { x: start.x + 14 * Math.cos(angle), z: start.z + 14 * Math.sin(angle) };
        const found = index.along(start.x, start.z, end.x, end.z);
        for (const c of solid) {
          if (distanceToSegment(c, start, end) >= c.r + CAMERA_OBSTACLE_MARGIN) continue;
          touched++;
          if (!found.some((o) => o.x === c.x && o.z === c.z && o.r === c.r)) missed.push(`départ ${start.x} ${start.z}, direction ${k} : obstacle à ${c.x.toFixed(1)} ${c.z.toFixed(1)}`);
        }
      }
    }
    expect(touched).toBeGreaterThan(20); // le test ne prouve rien si aucun obstacle n'est touché
    expect(missed).toEqual([]);
  });

  it('along : un segment réduit à un point = near', () => {
    const index = new ObstacleIndex(SEED);
    expect(index.along(100, 100, 100, 100)).toEqual(index.near(100, 100));
  });

  it('même réponse à la 2e question et pour deux index de même graine', () => {
    const a = new ObstacleIndex(SEED), b = new ObstacleIndex(SEED);
    const first = a.near(100, 100);
    expect(a.near(100, 100)).toEqual(first);
    expect(b.near(100, 100)).toEqual(first);
  });

  it('mémoire bornée : la réponse reste la même après avoir vidé les cases gardées', () => {
    const small = new ObstacleIndex(SEED, 2), reference = new ObstacleIndex(SEED);
    for (let i = 0; i < 20; i++) expect(small.near(i * 7, i * 5)).toEqual(reference.near(i * 7, i * 5));
    expect(small.near(100, 100)).toEqual(reference.near(100, 100));
  });

  it('de bout en bout : marcher droit sur un vrai arbre du monde arrête le joueur exactement à son bord', () => {
    const index = new ObstacleIndex(SEED);
    const tree = resourcesInChunk(SEED, 3, -2).find((r) => r.kind === 'tree' || r.kind === 'pine')!;
    const c = colliderOf(tree)!;
    const s = new GameSession({ spawn: { x: c.x - 6, z: c.z }, ground: () => 0, obstacles: (x, z) => index.near(x, z) });
    for (let i = 0; i < 3 * SIM_HZ; i++) s.frame(1000 / SIM_HZ, true, { dx: 1, dz: 0 });
    expect(s.current.x).toBeCloseTo(c.x - c.r - PLAYER_RADIUS_M, 6);
  });

  it('autre graine, autres obstacles', () => {
    const r = resourcesInChunk(SEED, 3, -2).find((x) => colliderOf(x) !== undefined)!;
    expect(new ObstacleIndex(SEED + 1).near(r.x, r.z)).not.toContainEqual(colliderOf(r)!);
  });
});
