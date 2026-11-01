import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sunRayIntensity, sunScreenUv, type CameraBasis } from './sun-rays';

// Caméra à l'origine, regardant +Z, tête vers +Y, droite vers +X (repère de Babylon : main gauche), champ de 1 rad à la verticale, 16/9.
const CAMERA: CameraBasis = { forward: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, tanHalfFovY: Math.tan(0.5), aspect: 16 / 9 };
const unit = (x: number, y: number, z: number) => {
  const n = Math.hypot(x, y, z);
  return { x: x / n, y: y / n, z: z / n };
};

describe('sunScreenUv (où le soleil tombe à l’écran, origine en bas à gauche comme les post-traitements)', () => {
  it('soleil droit devant : au centre', () => {
    const s = sunScreenUv({ x: 0, y: 0, z: 1 }, CAMERA)!;
    expect(s.u).toBeCloseTo(0.5, 9);
    expect(s.v).toBeCloseTo(0.5, 9);
    expect(s.facing).toBeCloseTo(1, 9);
  });

  it('à droite : u > 0,5 ; en haut : v > 0,5 (même hauteur / même côté sinon)', () => {
    const right = sunScreenUv(unit(0.1, 0, 1), CAMERA)!;
    expect(right.u).toBeGreaterThan(0.5);
    expect(right.v).toBeCloseTo(0.5, 9);
    const up = sunScreenUv(unit(0, 0.1, 1), CAMERA)!;
    expect(up.v).toBeGreaterThan(0.5);
    expect(up.u).toBeCloseTo(0.5, 9);
  });

  it('un soleil à la moitié du champ vertical (0,5 rad) en haut tombe au bord haut ; sur le côté, au bord de l’écran large', () => {
    const top = sunScreenUv(unit(0, Math.sin(0.5), Math.cos(0.5)), CAMERA)!;
    expect(top.v).toBeCloseTo(1, 6);
    const halfFovX = Math.atan(CAMERA.tanHalfFovY * CAMERA.aspect);
    const side = sunScreenUv(unit(Math.sin(halfFovX), 0, Math.cos(halfFovX)), CAMERA)!;
    expect(side.u).toBeCloseTo(1, 6);
  });

  it('soleil derrière : rien à projeter (facing ≤ 0)', () => {
    expect(sunScreenUv({ x: 0, y: 0, z: -1 }, CAMERA)).toBeUndefined();
    expect(sunScreenUv({ x: 1, y: 0, z: 0 }, CAMERA)).toBeUndefined(); // exactement de côté : à l'infini
  });
});

describe('sunRayIntensity (les rayons n’existent que face au soleil)', () => {
  it('nuls dos au soleil ou de côté, pleins face à lui', () => {
    expect(sunRayIntensity(0.8, -1)).toBe(0);
    expect(sunRayIntensity(0.8, 0)).toBe(0);
    expect(sunRayIntensity(0.8, 1)).toBeCloseTo(0.8, 9);
  });

  it('proportionnels à la force de l’heure, croissants quand on se tourne vers le soleil, dans [0, force]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        (strength, facing, more) => {
          const a = sunRayIntensity(strength, facing);
          expect(a).toBeGreaterThanOrEqual(0);
          expect(a).toBeLessThanOrEqual(strength + 1e-12);
          expect(sunRayIntensity(strength, Math.min(1, facing + more))).toBeGreaterThanOrEqual(a - 1e-12);
        },
      ),
    );
  });

  it('visibles encore à 60° du soleil (regard de biais), invisibles au-delà de 80°', () => {
    expect(sunRayIntensity(1, Math.cos((60 * Math.PI) / 180))).toBeGreaterThan(0);
    expect(sunRayIntensity(1, Math.cos((80 * Math.PI) / 180))).toBe(0);
  });
});
