import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blocksBrowserDefault, clampLookDelta, isInGame, MAX_LOOK_DELTA_PX, normalizeWheel } from './raw-input';

describe('blocage des comportements du navigateur selon le mode', () => {
  it('en jeu seulement (Playing ; plus tard Placing et Overlay)', () => {
    expect(isInGame('Playing')).toBe(true);
    expect(isInGame('Paused')).toBe(false);
    expect(isInGame('ResumePrompt')).toBe(false);
  });

  it.each(['Tab', 'Space', 'F5'])('%s est bloquée en jeu, laissée au navigateur hors jeu', (code) => {
    expect(blocksBrowserDefault(code, 'Playing')).toBe(true);
    expect(blocksBrowserDefault(code, 'Paused')).toBe(false);
    expect(blocksBrowserDefault(code, 'ResumePrompt')).toBe(false);
  });

  it('les touches de jeu ordinaires ne bloquent rien (ex. ZQSD, F12)', () => {
    for (const code of ['KeyW', 'KeyA', 'F12', 'Escape']) expect(blocksBrowserDefault(code, 'Playing')).toBe(false);
  });
});

describe('normalizeWheel (deltaY, deltaMode) → pixels', () => {
  it('pixels tels quels, lignes × 16, pages × 800', () => {
    expect(normalizeWheel(100, 0)).toBe(100);
    expect(normalizeWheel(3, 1)).toBe(48);
    expect(normalizeWheel(-1, 2)).toBe(-800);
  });

  it('valeur non finie ou mode inconnu : 0 ; toujours borné à ±1000', () => {
    expect(normalizeWheel(Number.NaN, 0)).toBe(0);
    expect(normalizeWheel(5, 9)).toBe(0);
    fc.assert(
      fc.property(fc.double({ noNaN: true }), fc.integer({ min: 0, max: 2 }), (d, mode) => {
        expect(Math.abs(normalizeWheel(d, mode))).toBeLessThanOrEqual(1000);
      }),
    );
  });
});

describe('clampLookDelta', () => {
  it('borne un mouvement de souris aberrant (saut au moment de la capture)', () => {
    expect(clampLookDelta(12)).toBe(12);
    expect(clampLookDelta(5000)).toBe(MAX_LOOK_DELTA_PX);
    expect(clampLookDelta(-5000)).toBe(-MAX_LOOK_DELTA_PX);
    expect(clampLookDelta(Number.NaN)).toBe(0);
  });
});
