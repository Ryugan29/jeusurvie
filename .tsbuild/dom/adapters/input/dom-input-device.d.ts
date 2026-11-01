import type { InputDevice, RawInput } from '../../app/ports';
export declare class DomInputDevice implements InputDevice {
    private readonly canvas;
    /** Décision de l'app : faut-il bloquer le comportement du navigateur pour cette touche (selon le mode) ? */
    private readonly blocksDefault;
    private readonly down;
    private pressed;
    private modeEvents;
    private lookX;
    private lookY;
    private wheel;
    /** Le premier mouvement après la capture contient souvent un saut parasite : on l'ignore. */
    private skipNextMove;
    private readonly disposers;
    constructor(canvas: HTMLCanvasElement, 
    /** Décision de l'app : faut-il bloquer le comportement du navigateur pour cette touche (selon le mode) ? */
    blocksDefault: (code: string) => boolean);
    attach(): void;
    detach(): void;
    sample(): RawInput;
    /** Demande la capture de la souris (à appeler pendant un clic de l'utilisateur). */
    requestPointerLock(): void;
    releasePointerLock(): void;
    labelFor(code: string): Promise<string>;
    get captured(): boolean;
    private listen;
}
