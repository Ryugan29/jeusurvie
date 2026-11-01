// Session de jeu minimale du spike (pure) : pas fixe, temps en ticks entiers, déplacement du joueur sur le sol,
// interpolation du rendu. Le spike ne fait plus qu'assembler cette session avec le rendu et les entrées.
import { DAY_LENGTH_S, NIGHT_LENGTH_S, PLAYER_MAX_SLOPE, PLAYER_RADIUS_M, PLAYER_WALK_SPEED_MPS, SIM_HZ } from '../../core/config/balance';
import { overlaps, pushOut, type Circle } from '../../core/physics/colliders';
import { moveOnGround } from '../../core/physics/ground';
import type { Vec3 } from '../../core/shared/vec';
import { advance } from './fixed-step';

const STEP_MS = 1000 / SIM_HZ;
const MAX_STEPS_PER_FRAME = 5;
const CYCLE_TICKS = (DAY_LENGTH_S + NIGHT_LENGTH_S) * SIM_HZ;

export interface SessionOptions {
  readonly spawn: { readonly x: number; readonly z: number };
  /** Hauteur du sol chargé en (x, z), ou undefined si le chunk n'est pas là. */
  readonly ground: (x: number, z: number) => number | undefined;
  /** Obstacles (troncs, rochers) susceptibles de toucher un joueur en (x, z) ; absent = rien ne bloque. */
  readonly obstacles?: (x: number, z: number) => readonly Circle[];
}

export class GameSession {
  /** Temps du monde, en ticks entiers (temps = ticks / SIM_HZ). */
  worldTicks = 0;
  /** Ticks de temps du monde par tick de simulation (1 = normal, 60 = cycle accéléré de la démo). Entier. */
  timeScale = 1;
  previous: Vec3;
  current: Vec3;
  private accMs = 0;
  /** Le joueur a-t-il déjà été posé sur un sol chargé ? */
  private grounded = false;

  constructor(private readonly options: SessionOptions) {
    this.current = { x: options.spawn.x, y: 0, z: options.spawn.z };
    this.previous = this.current;
  }

  get elapsedWorldSeconds(): number {
    return this.worldTicks / SIM_HZ;
  }

  /** Place l'heure à `fraction` du cycle en cours (0 = lever du jour). */
  setTimeOfDay(fraction: number): void {
    this.worldTicks = Math.floor(this.worldTicks / CYCLE_TICKS) * CYCLE_TICKS + Math.round(fraction * CYCLE_TICKS);
  }

  /**
   * Une image : joue les ticks dus (si la simulation tourne) avec la direction voulue (longueur 0 ou 1).
   * Rend alpha, l'avancement vers le prochain tick, pour interpoler le rendu.
   */
  frame(frameMs: number, running: boolean, direction: { readonly dx: number; readonly dz: number }): number {
    this.settleOnGround();
    const step = advance(this.accMs, running ? frameMs : 0, STEP_MS, MAX_STEPS_PER_FRAME);
    this.accMs = step.accMs;
    for (let i = 0; i < step.steps; i++) this.tick(direction);
    return step.alpha;
  }

  /** Position affichée entre l'état précédent et l'état courant. */
  interpolated(alpha: number): Vec3 {
    const p = this.previous, c = this.current;
    return { x: p.x + (c.x - p.x) * alpha, y: p.y + (c.y - p.y) * alpha, z: p.z + (c.z - p.z) * alpha };
  }

  /**
   * Recalage initial : dès que le sol sous le joueur est chargé, il y est posé ET l'état précédent aussi,
   * sinon l'interpolation le montrerait remontant depuis y = 0.
   */
  private settleOnGround(): void {
    if (this.grounded) return;
    const y = this.options.ground(this.current.x, this.current.z);
    if (y === undefined) return;
    this.current = { x: this.current.x, y, z: this.current.z };
    this.previous = this.current;
    this.grounded = true;
  }

  private tick(direction: { readonly dx: number; readonly dz: number }): void {
    const distance = PLAYER_WALK_SPEED_MPS / SIM_HZ;
    const from = this.current;
    this.previous = from;
    this.current = this.avoidObstacles(
      from,
      moveOnGround(from, { dx: direction.dx * distance, dz: direction.dz * distance }, this.options.ground, PLAYER_MAX_SLOPE),
    );
    this.worldTicks += this.timeScale;
  }

  /**
   * Repousse le joueur (arrivé en `moved`) hors des obstacles. Il reste en `from` si la poussée l'enverrait sur un sol pas
   * encore chargé, sur une pente trop raide, ou dans un autre obstacle (passage plus étroit que lui) — sauf s'il était déjà
   * dans un obstacle au départ : il doit pouvoir en sortir.
   */
  private avoidObstacles(from: Vec3, moved: Vec3): Vec3 {
    const { obstacles, ground } = this.options;
    if (obstacles === undefined) return moved;
    const circles = obstacles(moved.x, moved.z);
    const pushed = pushOut(moved, PLAYER_RADIUS_M, circles);
    if (pushed.x === moved.x && pushed.z === moved.z) return moved;
    const y = ground(pushed.x, pushed.z);
    if (y === undefined) return from;
    if (y - from.y > PLAYER_MAX_SLOPE * Math.hypot(pushed.x - from.x, pushed.z - from.z)) return from;
    if (overlaps(pushed, PLAYER_RADIUS_M, circles) && !overlaps(from, PLAYER_RADIUS_M, circles)) return from;
    return { x: pushed.x, y, z: pushed.z };
  }
}
