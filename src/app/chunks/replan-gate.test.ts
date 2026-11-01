import { describe, expect, it } from 'vitest';
import { ReplanGate } from './replan-gate';

describe('ReplanGate (recalculer le plan seulement quand c’est utile)', () => {
  it('la première fois : oui', () => {
    expect(new ReplanGate().shouldReplan(10, 10, 'Playing')).toBe(true);
  });

  it('même chunk, même mode : non, même si le joueur bouge dans le chunk', () => {
    const gate = new ReplanGate();
    gate.shouldReplan(10, 10, 'Playing');
    expect(gate.shouldReplan(40, 63, 'Playing')).toBe(false);
  });

  it('changement de chunk : oui (une seule fois)', () => {
    const gate = new ReplanGate();
    gate.shouldReplan(10, 10, 'Playing');
    expect(gate.shouldReplan(64.5, 10, 'Playing')).toBe(true);
    expect(gate.shouldReplan(65, 11, 'Playing')).toBe(false);
  });

  it('changement de mode : oui', () => {
    const gate = new ReplanGate();
    gate.shouldReplan(10, 10, 'ResumePrompt');
    expect(gate.shouldReplan(10, 10, 'Playing')).toBe(true);
  });
});
