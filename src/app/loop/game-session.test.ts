import { describe, expect, it } from 'vitest';
import { DAY_LENGTH_S, NIGHT_LENGTH_S, PLAYER_MAX_SLOPE, PLAYER_RADIUS_M, PLAYER_WALK_SPEED_MPS, SIM_HZ } from '../../core/config/balance';
import { GameSession } from './game-session';

const STEP_MS = 1000 / SIM_HZ;
const CYCLE_S = DAY_LENGTH_S + NIGHT_LENGTH_S;
const still = { dx: 0, dz: 0 };

describe('GameSession (temps en ticks entiers)', () => {
  it('le temps du monde = ticks / SIM_HZ, exactement (pas de somme de flottants)', () => {
    const s = new GameSession({ spawn: { x: 0, z: 0 }, ground: () => 0 });
    for (let i = 0; i < 1000; i++) s.frame(1000 / 60, true, still);
    expect(Number.isInteger(s.worldTicks)).toBe(true);
    expect(s.elapsedWorldSeconds).toBe(s.worldTicks / SIM_HZ);
    expect(s.worldTicks).toBeGreaterThanOrEqual(499);
    expect(s.worldTicks).toBeLessThanOrEqual(501);
  });

  it('en pause (simulation arrêtée) : aucun tick', () => {
    const s = new GameSession({ spawn: { x: 0, z: 0 }, ground: () => 0 });
    s.frame(500, false, still);
    expect(s.worldTicks).toBe(0);
  });

  it('cycle accéléré : chaque tick avance le temps du monde de `timeScale` ticks (entier)', () => {
    const s = new GameSession({ spawn: { x: 0, z: 0 }, ground: () => 0 });
    s.timeScale = 60;
    s.frame(STEP_MS, true, still);
    expect(s.worldTicks).toBe(60);
  });

  it('setTimeOfDay : place l’heure dans le cycle en cours, en ticks entiers', () => {
    const s = new GameSession({ spawn: { x: 0, z: 0 }, ground: () => 0 });
    s.setTimeOfDay(0.3);
    expect(s.worldTicks).toBe(Math.round(0.3 * CYCLE_S * SIM_HZ));
  });
});

describe('GameSession (déplacement et interpolation)', () => {
  it('l’intention fait marcher le joueur sur le sol, à la vitesse de marche', () => {
    const s = new GameSession({ spawn: { x: 0, z: 0 }, ground: (x) => x * 0.1 });
    for (let i = 0; i < SIM_HZ; i++) s.frame(STEP_MS, true, { dx: 1, dz: 0 });
    expect(s.current.x).toBeCloseTo(PLAYER_WALK_SPEED_MPS, 9);
    expect(s.current.y).toBeCloseTo(PLAYER_WALK_SPEED_MPS * 0.1, 9);
  });

  it('interpole entre l’état précédent et l’état courant', () => {
    const s = new GameSession({ spawn: { x: 0, z: 0 }, ground: () => 0 });
    s.frame(STEP_MS, true, { dx: 1, dz: 0 });
    s.frame(STEP_MS, true, { dx: 1, dz: 0 });
    const half = s.interpolated(0.5);
    expect(half.x).toBeCloseTo((s.previous.x + s.current.x) / 2, 12);
  });

  it('un obstacle arrête le joueur à son bord, sans le traverser', () => {
    const tree = { x: 3, z: 0, r: 0.6 };
    const s = new GameSession({ spawn: { x: 0, z: 0 }, ground: () => 0, obstacles: () => [tree] });
    for (let i = 0; i < 3 * SIM_HZ; i++) s.frame(STEP_MS, true, { dx: 1, dz: 0 });
    expect(s.current.x).toBeCloseTo(tree.x - tree.r - PLAYER_RADIUS_M, 6);
    expect(s.current.z).toBeCloseTo(0, 6);
  });

  it('en poussant de biais, le joueur longe l’obstacle au lieu de rester collé', () => {
    const tree = { x: 3, z: 0, r: 0.6 };
    const s = new GameSession({ spawn: { x: 0, z: -0.3 }, ground: () => 0, obstacles: () => [tree] });
    const wish = { dx: Math.SQRT1_2, dz: Math.SQRT1_2 };
    for (let i = 0; i < 4 * SIM_HZ; i++) {
      s.frame(STEP_MS, true, wish);
      expect(Math.hypot(s.current.x - tree.x, s.current.z - tree.z)).toBeGreaterThanOrEqual(tree.r + PLAYER_RADIUS_M - 1e-9);
    }
    expect(s.current.z).toBeGreaterThan(1); // il a contourné, il ne reste pas bloqué contre le tronc
  });

  it('l’obstacle est interrogé à la position d’arrivée (pas à celle de départ)', () => {
    const asked: { x: number; z: number }[] = [];
    const s = new GameSession({
      spawn: { x: 0, z: 0 },
      ground: () => 0,
      obstacles: (x, z) => {
        asked.push({ x, z });
        return [];
      },
    });
    s.frame(STEP_MS, true, { dx: 1, dz: 0 });
    expect(asked.at(-1)!.x).toBeCloseTo(PLAYER_WALK_SPEED_MPS / SIM_HZ, 9);
  });

  it('repoussé sur un sol pas encore chargé : le joueur reste où il était', () => {
    const tree = { x: 1.5, z: 0, r: 0.6 };
    // Sol partout, sauf un trou là où le tronc repousse le joueur (1,5 − 0,6 − 0,35 = 0,55).
    const ground = (x: number): number | undefined => (x >= 0.54 && x <= 0.56 ? undefined : 0);
    const s = new GameSession({ spawn: { x: 0.4, z: 0 }, ground, obstacles: () => [tree] });
    for (let i = 0; i < SIM_HZ; i++) {
      s.frame(STEP_MS, true, { dx: 1, dz: 0 });
      expect(s.current.x).toBeCloseTo(0.4, 12);
    }
  });

  it('un passage plus étroit que le joueur reste infranchissable, sans jamais entrer dans un tronc', () => {
    const trees = [{ x: 0, z: 0.9, r: 0.6 }, { x: 0, z: -0.9, r: 0.6 }]; // 0,6 m de passage pour un joueur de 0,7 m
    const s = new GameSession({ spawn: { x: -3, z: 0 }, ground: () => 0, obstacles: () => trees });
    for (let i = 0; i < 4 * SIM_HZ; i++) {
      s.frame(STEP_MS, true, { dx: 1, dz: 0 });
      for (const t of trees) expect(Math.hypot(s.current.x - t.x, s.current.z - t.z)).toBeGreaterThanOrEqual(t.r + PLAYER_RADIUS_M - 1e-6);
    }
    expect(s.current.x).toBeLessThan(0);
  });

  it('un joueur déjà dans un tronc au départ en sort et peut repartir', () => {
    const tree = { x: 3, z: 0, r: 0.6 };
    const s = new GameSession({ spawn: { x: 3.1, z: 0 }, ground: () => 0, obstacles: () => [tree] });
    for (let i = 0; i < SIM_HZ; i++) s.frame(STEP_MS, true, { dx: -1, dz: 0 });
    expect(s.current.x).toBeLessThan(tree.x - tree.r - PLAYER_RADIUS_M + 1e-6);
  });

  it('repoussé par un rocher, le joueur ne gravit jamais plus raide que la pente permise', () => {
    const rock = { x: 4, z: 0, r: 1.3 };
    const ground = (x: number): number => 1.4 * x; // plus raide que PLAYER_MAX_SLOPE
    let worst = 0;
    for (let start = 0; start < 24; start++) {
      const from = (start / 24) * 2 * Math.PI;
      const spawn = { x: rock.x + 2.2 * Math.cos(from), z: rock.z + 2.2 * Math.sin(from) };
      for (let d = 0; d < 72; d++) {
        const to = (d / 72) * 2 * Math.PI;
        const s = new GameSession({ spawn, ground, obstacles: () => [rock] });
        for (let i = 0; i < 40; i++) {
          s.frame(STEP_MS, true, { dx: Math.cos(to), dz: Math.sin(to) });
          const run = Math.hypot(s.current.x - s.previous.x, s.current.z - s.previous.z);
          if (run > 1e-9) worst = Math.max(worst, (s.current.y - s.previous.y) / run);
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(PLAYER_MAX_SLOPE + 1e-9);
  });

  it('recalage initial : quand le sol apparaît, le joueur y est posé sans glisser depuis y = 0', () => {
    const world: { ground: number | undefined } = { ground: undefined };
    const s = new GameSession({ spawn: { x: 5, z: 5 }, ground: () => world.ground });
    s.frame(16, false, still); // sol pas encore chargé
    world.ground = 12;
    s.frame(16, false, still); // toujours en attente du clic : aucun tick
    for (const alpha of [0, 0.3, 0.99]) expect(s.interpolated(alpha).y).toBe(12);
    s.frame(STEP_MS, true, still);
    for (const alpha of [0, 0.5]) expect(s.interpolated(alpha).y).toBe(12);
  });
});
