// Obstacles du joueur autour d'un point : les troncs et rochers des cases de la grille globale des ressources
// (core/world/placement), donc EXACTEMENT ceux que le rendu dessine. Calculés à la demande puis gardés.
import { colliderOf, MAX_COLLIDER_EXTENT_M, type Circle } from '../../core/physics/colliders';
import { PLAYER_RADIUS_M } from '../../core/config/balance';
import { RESOURCE_CELL_M, RESOURCE_SCALE_MAX, resourcesInCells } from '../../core/world/placement';

/** Cases gardées au plus (chacune pèse quelques octets) : au-delà on repart de zéro, le résultat est le même. */
const MAX_CACHED_CELLS = 50_000;
/** Plus grande distance (m) entre le joueur et l'origine d'une ressource dont l'obstacle peut encore le toucher (échelle max, plus le joueur). */
const REACH_M = MAX_COLLIDER_EXTENT_M * RESOURCE_SCALE_MAX + PLAYER_RADIUS_M;

export class ObstacleIndex {
  /** Par case « gx:gz » : le cercle de sa ressource, ou null si elle n'a rien de solide. */
  private readonly cells = new Map<string, Circle | null>();

  constructor(
    private readonly seed: number,
    private readonly maxCachedCells = MAX_CACHED_CELLS,
  ) {}

  /** Obstacles susceptibles de toucher un joueur au point (x, z). */
  near(x: number, z: number): Circle[] {
    return this.inBox(x, z, x, z);
  }

  /** Obstacles susceptibles de toucher la perche de la caméra, du point (ax, az) au point (bx, bz) (marge de la caméra < rayon du joueur). */
  along(ax: number, az: number, bx: number, bz: number): Circle[] {
    return this.inBox(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
  }

  /** Obstacles dont l'origine est à moins de REACH_M du rectangle [x0, x1] × [z0, z1]. */
  private inBox(x0: number, z0: number, x1: number, z1: number): Circle[] {
    const out: Circle[] = [];
    const gx0 = Math.floor((x0 - REACH_M) / RESOURCE_CELL_M), gx1 = Math.floor((x1 + REACH_M) / RESOURCE_CELL_M);
    const gz0 = Math.floor((z0 - REACH_M) / RESOURCE_CELL_M), gz1 = Math.floor((z1 + REACH_M) / RESOURCE_CELL_M);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const circle = this.cell(gx, gz);
        if (circle !== null) out.push(circle);
      }
    }
    return out;
  }

  private cell(gx: number, gz: number): Circle | null {
    const key = `${gx}:${gz}`;
    const known = this.cells.get(key);
    if (known !== undefined) return known;
    const resource = resourcesInCells(this.seed, gx, gz, gx + 1, gz + 1)[0];
    const circle = (resource === undefined ? undefined : colliderOf(resource)) ?? null;
    if (this.cells.size >= this.maxCachedCells) this.cells.clear();
    this.cells.set(key, circle);
    return circle;
  }
}
