// Port InputDevice pour le navigateur : touches par position physique (KeyboardEvent.code : ZQSD en AZERTY =
// WASD en QWERTY), souris capturée, molette, événements de capture. Aucune règle ici : on collecte, l'app décide
// (y compris quelles touches bloquer, selon son mode).
import { clampLookDelta, normalizeWheel } from '../../app/input/raw-input';
import type { ModeEvent } from '../../app/modes/input-mode';
import type { InputDevice, RawInput } from '../../app/ports';

/** API du navigateur encore expérimentale (Chrome/Edge) : disposition réelle du clavier. */
interface KeyboardLayoutApi {
  getLayoutMap(): Promise<{ get(code: string): string | undefined }>;
}

export class DomInputDevice implements InputDevice {
  private readonly down = new Set<string>();
  private pressed: string[] = [];
  private modeEvents: ModeEvent[] = [];
  private lookX = 0;
  private lookY = 0;
  private wheel = 0;
  /** Le premier mouvement après la capture contient souvent un saut parasite : on l'ignore. */
  private skipNextMove = false;
  private readonly disposers: (() => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    /** Décision de l'app : faut-il bloquer le comportement du navigateur pour cette touche (selon le mode) ? */
    private readonly blocksDefault: (code: string) => boolean,
  ) {}

  attach(): void {
    this.listen(window, 'keydown', (e: KeyboardEvent) => {
      if (this.blocksDefault(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.push(e.code);
      this.down.add(e.code);
    });
    this.listen(window, 'keyup', (e: KeyboardEvent) => this.down.delete(e.code));
    // Fenêtre quittée : on relâche tout (sinon le personnage continuerait d'avancer).
    this.listen(window, 'blur', () => this.down.clear());
    this.listen(document, 'mousemove', (e: MouseEvent) => {
      if (!this.captured) return;
      if (this.skipNextMove) {
        this.skipNextMove = false;
        return;
      }
      this.lookX += clampLookDelta(e.movementX);
      this.lookY += clampLookDelta(e.movementY);
    });
    this.listen(
      this.canvas,
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault(); // ni défilement de la page, ni zoom du navigateur (Ctrl + molette) sur la scène
        this.wheel += normalizeWheel(e.deltaY, e.deltaMode);
      },
      { passive: false },
    );
    this.listen(this.canvas, 'contextmenu', (e: Event) => e.preventDefault());
    this.listen(document, 'pointerlockchange', () => {
      if (this.captured) {
        this.skipNextMove = true;
        this.modeEvents.push('captureGained');
      } else {
        this.down.clear();
        this.modeEvents.push('captureLost');
      }
    });
    this.listen(document, 'pointerlockerror', () => this.modeEvents.push('captureRefused'));
  }

  detach(): void {
    for (const dispose of this.disposers.splice(0)) dispose();
  }

  sample(): RawInput {
    const raw: RawInput = {
      keysDown: new Set(this.down),
      pressed: this.pressed,
      look: { dx: this.lookX, dy: this.lookY },
      wheel: this.wheel,
      modeEvents: this.modeEvents,
    };
    this.pressed = [];
    this.modeEvents = [];
    this.lookX = 0;
    this.lookY = 0;
    this.wheel = 0;
    return raw;
  }

  /** Demande la capture de la souris (à appeler pendant un clic de l'utilisateur). */
  requestPointerLock(): void {
    try {
      const result = this.canvas.requestPointerLock() as unknown;
      if (result instanceof Promise) result.catch(() => this.modeEvents.push('captureRefused'));
    } catch {
      this.modeEvents.push('captureRefused');
    }
  }

  releasePointerLock(): void {
    if (this.captured) document.exitPointerLock();
  }

  async labelFor(code: string): Promise<string> {
    const keyboard = (navigator as Navigator & { keyboard?: KeyboardLayoutApi }).keyboard;
    if (keyboard !== undefined) {
      try {
        const label = (await keyboard.getLayoutMap()).get(code);
        if (label !== undefined && label !== '') return label.toUpperCase();
      } catch {
        // API refusée (ex. dans une iframe) : libellé de repli ci-dessous.
      }
    }
    return code.replace(/^Key/, '').replace(/^Digit/, '');
  }

  get captured(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  private listen<E extends Event>(
    target: EventTarget,
    type: string,
    handler: (e: E) => void,
    options?: AddEventListenerOptions,
  ): void {
    const listener = handler as EventListener;
    target.addEventListener(type, listener, options);
    this.disposers.push(() => target.removeEventListener(type, listener, options));
  }
}
