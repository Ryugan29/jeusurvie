import { describe, expect, it } from 'vitest';
import { meshPositionForFeet } from '../render-data/character-pose';
import { CAPSULE_OPTIONS, capsuleMinY } from './capsule';

describe('capsule provisoire du personnage', () => {
  it('le point le plus bas du vrai maillage Babylon est sous son origine, de la moitié de sa hauteur', () => {
    expect(capsuleMinY(CAPSULE_OPTIONS)).toBeCloseTo(-CAPSULE_OPTIONS.height / 2, 9);
  });

  it('posée par meshPositionForFeet, ses pieds sont exactement à la hauteur du sol', () => {
    const ground = 12.25;
    const position = meshPositionForFeet({ x: 3, y: ground, z: -4 }, capsuleMinY(CAPSULE_OPTIONS));
    expect(position.y + capsuleMinY(CAPSULE_OPTIONS)).toBeCloseTo(ground, 9);
  });
});
