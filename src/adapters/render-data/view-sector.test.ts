import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SECTOR_NEAR_M, SECTOR_STEP_RAD, inSector, quantizedYaw, sameSector, viewSectorFor } from './view-sector';

const FOV = 1.0, ASPECT = 16 / 9;

describe('viewSectorFor / inSector (élagage de la végétation hors du champ)', () => {
  it('devant la caméra : gardé ; derrière et loin : écarté ; tout près du joueur : toujours gardé', () => {
    const s = viewSectorFor(0, FOV, ASPECT); // regarde vers +z
    expect(inSector(s, 0, 0, 0, 50)).toBe(true);
    expect(inSector(s, 0, 0, 0, -50)).toBe(false);
    expect(inSector(s, 0, 0, 0, -SECTOR_NEAR_M + 1)).toBe(true);
    expect(inSector(s, 0, 0, 60, 0)).toBe(false); // de côté, à 90°
  });

  it('jamais un objet visible écarté : tout point dans le champ horizontal réel (avant arrondi du cap) est gardé', () => {
    const halfH = Math.atan(Math.tan(FOV / 2) * ASPECT);
    fc.assert(
      fc.property(fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: 15, max: 800, noNaN: true }), (yaw, f, d) => {
        const s = viewSectorFor(yaw, FOV, ASPECT);
        const a = yaw + f * halfH; // dans le champ
        expect(inSector(s, 0, 0, Math.sin(a) * d, Math.cos(a) * d)).toBe(true);
      }),
    );
  });

  it('un gros objet à cheval sur le bord du secteur est gardé (son rayon élargit le secteur)', () => {
    const s = viewSectorFor(0, FOV, ASPECT);
    const half = Math.acos(s.cosHalf);
    const a = half + 0.05; // juste hors du secteur…
    const x = Math.sin(a) * 100, z = Math.cos(a) * 100;
    expect(inSector(s, 0, 0, x, z)).toBe(false);
    expect(inSector(s, 0, 0, x, z, 45)).toBe(true); // … mais un chunk de 45 m de demi-diagonale y déborde
  });

  it('le cap est arrondi par pas de 15° : tourner un peu ne change pas l’élagage (tampons non refaits)', () => {
    expect(quantizedYaw(0.05)).toBe(0);
    expect(quantizedYaw(SECTOR_STEP_RAD * 0.6)).toBeCloseTo(SECTOR_STEP_RAD, 12);
    expect(sameSector(viewSectorFor(0.02, FOV, ASPECT), viewSectorFor(-0.03, FOV, ASPECT))).toBe(true);
    expect(sameSector(viewSectorFor(0, FOV, ASPECT), viewSectorFor(0.4, FOV, ASPECT))).toBe(false);
    expect(sameSector(undefined, undefined)).toBe(true);
  });

  it('écran très large : les côtés restent gardés (le secteur suit le champ horizontal réel)', () => {
    const s = viewSectorFor(0, 2.8, 8);
    expect(inSector(s, 0, 0, 500, 0)).toBe(true); // à 90°
    expect(Math.acos(s.cosHalf)).toBeGreaterThan(Math.PI / 2);
  });
});
