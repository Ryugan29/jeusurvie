import { describe, expect, it } from 'vitest';
import { INITIAL_MODE, nextMode, simulationRuns, type InputMode, type ModeEvent } from './input-mode';

describe('machine des modes (Playing / Paused / ResumePrompt)', () => {
  it('démarre en attente d’un clic (le navigateur exige un geste pour capturer la souris)', () => {
    expect(INITIAL_MODE).toBe('ResumePrompt');
  });

  it.each<[InputMode, ModeEvent, InputMode]>([
    ['Playing', 'captureLost', 'Paused'],
    ['Paused', 'captureGained', 'Playing'],
    ['Paused', 'captureRefused', 'ResumePrompt'],
    ['ResumePrompt', 'captureGained', 'Playing'],
    ['ResumePrompt', 'captureRefused', 'ResumePrompt'],
    ['Playing', 'captureGained', 'Playing'],
    ['Paused', 'captureLost', 'Paused'],
    ['ResumePrompt', 'captureLost', 'ResumePrompt'],
    ['Playing', 'captureRefused', 'Playing'],
  ])('%s + %s → %s', (from, event, to) => {
    expect(nextMode(from, event)).toBe(to);
  });

  it('la simulation ne tourne qu’en Playing', () => {
    expect(simulationRuns('Playing')).toBe(true);
    expect(simulationRuns('Paused')).toBe(false);
    expect(simulationRuns('ResumePrompt')).toBe(false);
  });
});
