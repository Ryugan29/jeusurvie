// Le plan de streaming ne change que si le joueur change de chunk (ou si le mode change) : inutile de le recalculer,
// ni d'allouer ses listes, à chaque image.
import { chunkCoordOf } from '../../core/world/chunk';
import type { InputMode } from '../modes/input-mode';

export class ReplanGate {
  private cx = Number.NaN;
  private cz = Number.NaN;
  private mode: InputMode | undefined;

  shouldReplan(x: number, z: number, mode: InputMode): boolean {
    const { cx, cz } = chunkCoordOf(x, z);
    if (cx === this.cx && cz === this.cz && mode === this.mode) return false;
    this.cx = cx;
    this.cz = cz;
    this.mode = mode;
    return true;
  }
}
