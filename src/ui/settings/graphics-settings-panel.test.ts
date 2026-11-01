import { describe, expect, it } from 'vitest';
import { neighbourPreset } from './graphics-settings-panel';

const IDS = ['low', 'medium', 'high', 'ultra'];

describe('neighbourPreset (navigation au clavier dans le groupe de profils)', () => {
  it('flèches : profil suivant ou précédent, sans boucler aux bords', () => {
    expect(neighbourPreset(IDS, 'medium', 'ArrowRight')).toBe('high');
    expect(neighbourPreset(IDS, 'medium', 'ArrowDown')).toBe('high');
    expect(neighbourPreset(IDS, 'medium', 'ArrowLeft')).toBe('low');
    expect(neighbourPreset(IDS, 'medium', 'ArrowUp')).toBe('low');
    expect(neighbourPreset(IDS, 'ultra', 'ArrowRight')).toBe('ultra');
    expect(neighbourPreset(IDS, 'low', 'ArrowLeft')).toBe('low');
  });

  it('Début et Fin : premier et dernier profil', () => {
    expect(neighbourPreset(IDS, 'high', 'Home')).toBe('low');
    expect(neighbourPreset(IDS, 'low', 'End')).toBe('ultra');
  });

  it('une autre touche, ou un profil inconnu : aucun déplacement', () => {
    expect(neighbourPreset(IDS, 'high', 'Enter')).toBeUndefined();
    expect(neighbourPreset(IDS, 'high', 'a')).toBeUndefined();
    expect(neighbourPreset(IDS, 'epic', 'ArrowRight')).toBeUndefined();
    expect(neighbourPreset([], 'high', 'ArrowRight')).toBeUndefined();
  });
});
