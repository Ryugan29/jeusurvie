import { describe, expect, it } from 'vitest';
import { setTextIfChanged } from './set-if-changed';

/** Élément factice qui compte les écritures de textContent. */
function fakeElement(initial: string) {
  let text: string | null = initial;
  let writes = 0;
  return {
    get textContent(): string | null {
      return text;
    },
    set textContent(v: string | null) {
      writes++;
      text = v;
    },
    get writes(): number {
      return writes;
    },
  };
}

describe('setTextIfChanged', () => {
  it('écrit quand le texte change, et dit qu’il a écrit', () => {
    const el = fakeElement('a');
    expect(setTextIfChanged(el, 'b')).toBe(true);
    expect(el.textContent).toBe('b');
    expect(el.writes).toBe(1);
  });

  it('une seconde mise à jour identique n’écrit rien', () => {
    const el = fakeElement('a');
    setTextIfChanged(el, 'b');
    expect(setTextIfChanged(el, 'b')).toBe(false);
    expect(el.writes).toBe(1);
  });
});
