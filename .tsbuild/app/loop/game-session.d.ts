import { type Circle } from '../../core/physics/colliders';
import type { Vec3 } from '../../core/shared/vec';
export interface SessionOptions {
    readonly spawn: {
        readonly x: number;
        readonly z: number;
    };
    /** Hauteur du sol chargé en (x, z), ou undefined si le chunk n'est pas là. */
    readonly ground: (x: number, z: number) => number | undefined;
    /** Obstacles (troncs, rochers) susceptibles de toucher un joueur en (x, z) ; absent = rien ne bloque. */
    readonly obstacles?: (x: number, z: number) => readonly Circle[];
}
export declare class GameSession {
    private readonly options;
    /** Temps du monde, en ticks entiers (temps = ticks / SIM_HZ). */
    worldTicks: number;
    /** Ticks de temps du monde par tick de simulation (1 = normal, 60 = cycle accéléré de la démo). Entier. */
    timeScale: number;
    previous: Vec3;
    current: Vec3;
    private accMs;
    /** Le joueur a-t-il déjà été posé sur un sol chargé ? */
    private grounded;
    constructor(options: SessionOptions);
    get elapsedWorldSeconds(): number;
    /** Place l'heure à `fraction` du cycle en cours (0 = lever du jour). */
    setTimeOfDay(fraction: number): void;
    /**
     * Une image : joue les ticks dus (si la simulation tourne) avec la direction voulue (longueur 0 ou 1).
     * Rend alpha, l'avancement vers le prochain tick, pour interpoler le rendu.
     */
    frame(frameMs: number, running: boolean, direction: {
        readonly dx: number;
        readonly dz: number;
    }): number;
    /** Position affichée entre l'état précédent et l'état courant. */
    interpolated(alpha: number): Vec3;
    /**
     * Recalage initial : dès que le sol sous le joueur est chargé, il y est posé ET l'état précédent aussi,
     * sinon l'interpolation le montrerait remontant depuis y = 0.
     */
    private settleOnGround;
    private tick;
    /**
     * Repousse le joueur (arrivé en `moved`) hors des obstacles. Il reste en `from` si la poussée l'enverrait sur un sol pas
     * encore chargé, sur une pente trop raide, ou dans un autre obstacle (passage plus étroit que lui) — sauf s'il était déjà
     * dans un obstacle au départ : il doit pouvoir en sortir.
     */
    private avoidObstacles;
}
