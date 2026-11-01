import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Circle } from '../../core/physics/colliders';
import {
  applyLook,
  applyZoom,
  CAMERA_GROUND_CLEARANCE,
  CAMERA_OBSTACLE_MARGIN,
  cameraPose,
  forwardOf,
  MAX_DISTANCE,
  MAX_PITCH,
  MIN_CAMERA_BOOM,
  MIN_DISTANCE,
  MIN_PITCH,
  type CameraRig,
} from './camera-rig';

const rig = fc.record({
  yaw: fc.double({ min: -50, max: 50, noNaN: true }),
  pitch: fc.double({ min: MIN_PITCH, max: MAX_PITCH, noNaN: true }),
  distance: fc.double({ min: MIN_DISTANCE, max: MAX_DISTANCE, noNaN: true }),
});
const target = { x: 10, y: 5, z: -3 };

describe('camera-rig (orbite 3e personne)', () => {
  it('la caméra est à `distance` de la cible, et la regarde', () => {
    fc.assert(
      fc.property(rig, (r) => {
        const pose = cameraPose(r, target);
        const d = Math.hypot(pose.position.x - target.x, pose.position.y - target.y, pose.position.z - target.z);
        expect(d).toBeCloseTo(r.distance, 9);
        expect(pose.target).toEqual(target);
      }),
    );
  });

  it('lacet 0 et tangage positif : derrière la cible (côté −Z) et au-dessus', () => {
    const pose = cameraPose({ yaw: 0, pitch: 0.4, distance: 6 }, target);
    expect(pose.position.z).toBeLessThan(target.z);
    expect(pose.position.y).toBeGreaterThan(target.y);
    expect(pose.position.x).toBeCloseTo(target.x, 9);
  });

  it('forwardOf : direction horizontale du regard (lacet 0 → +Z, lacet π/2 → +X)', () => {
    expect(forwardOf(0).x).toBeCloseTo(0, 12);
    expect(forwardOf(0).z).toBeCloseTo(1, 12);
    expect(forwardOf(Math.PI / 2).x).toBeCloseTo(1, 12);
  });

  it('souris : droite → lacet augmente ; le tangage reste borné', () => {
    const r: CameraRig = { yaw: 0, pitch: 0, distance: 6 };
    expect(applyLook(r, 100, 0, 0.003).yaw).toBeCloseTo(0.3, 12);
    fc.assert(
      fc.property(rig, fc.double({ min: -1e5, max: 1e5, noNaN: true }), fc.double({ min: -1e5, max: 1e5, noNaN: true }), (r0, dx, dy) => {
        const p = applyLook(r0, dx, dy, 0.003).pitch;
        expect(p).toBeGreaterThanOrEqual(MIN_PITCH);
        expect(p).toBeLessThanOrEqual(MAX_PITCH);
      }),
    );
  });

  it('molette : la distance reste bornée', () => {
    expect(applyZoom({ yaw: 0, pitch: 0, distance: 6 }, -1e6).distance).toBe(MIN_DISTANCE);
    expect(applyZoom({ yaw: 0, pitch: 0, distance: 6 }, 1e6).distance).toBe(MAX_DISTANCE);
  });

  describe('perche raccourcie par les obstacles (tronc, rocher entre la cible et la caméra)', () => {
    const eye = { x: 0, y: 1.5, z: 0 };
    const flat: CameraRig = { yaw: 0, pitch: 0, distance: 6 }; // caméra 6 m derrière (−Z), à hauteur des yeux
    const ground = (): number => 0;
    const along = (...circles: Circle[]) => () => circles;

    it('un tronc derrière la cible : la caméra s’arrête devant lui (rayon + marge)', () => {
      const pose = cameraPose(flat, eye, ground, along({ x: 0, z: -3, r: 0.6, height: 8 }));
      expect(pose.position.z).toBeCloseTo(-(3 - 0.6 - CAMERA_OBSTACLE_MARGIN), 9);
      expect(pose.position.x).toBeCloseTo(0, 9);
      expect(pose.position.y).toBeCloseTo(1.5, 9);
      expect(pose.target).toEqual(eye);
    });

    it('un obstacle hors de la ligne de la caméra ne la gêne pas', () => {
      const free = cameraPose(flat, eye, ground);
      expect(cameraPose(flat, eye, ground, along({ x: 3, z: -3, r: 0.6, height: 8 })).position).toEqual(free.position);
    });

    it('un rocher bas : la caméra le survole quand elle est haute, s’arrête devant quand elle est à hauteur des yeux', () => {
      const rock: Circle = { x: 0, z: -3, r: 1.4, height: 2 };
      const high: CameraRig = { yaw: 0, pitch: 1, distance: 10 };
      expect(cameraPose(high, eye, ground, along(rock)).position).toEqual(cameraPose(high, eye, ground).position);
      expect(cameraPose(flat, eye, ground, along(rock)).position.z).toBeCloseTo(-(3 - 1.4 - CAMERA_OBSTACLE_MARGIN), 9);
    });

    it('un obstacle collé à la cible : la perche ne descend pas sous le minimum (pas de caméra dans la tête du perso)', () => {
      const pose = cameraPose(flat, eye, ground, along({ x: 0, z: -1, r: 0.6, height: 8 }));
      expect(pose.position.z).toBeCloseTo(-MIN_CAMERA_BOOM, 9);
    });

    it('cible déjà dans la marge d’un obstacle : on l’ignore (pas de caméra écrasée sur place)', () => {
      const free = cameraPose(flat, eye, ground);
      expect(cameraPose(flat, eye, ground, along({ x: 0, z: -0.5, r: 0.6, height: 8 })).position).toEqual(free.position);
    });

    it('sol d’un rocher pas chargé : on le traite comme infiniment haut (il bloque)', () => {
      const pose = cameraPose({ yaw: 0, pitch: 1, distance: 10 }, eye, () => undefined, along({ x: 0, z: -3, r: 1.4, height: 2 }));
      expect(pose.position.z).toBeGreaterThan(-10 * Math.cos(1)); // plus près que la caméra libre
    });

    it('propriété : la caméra n’est jamais plus loin que libre, et soit hors de la marge de l’obstacle, soit à la perche minimale', () => {
      const unit = fc.double({ min: 0, max: 1, noNaN: true });
      fc.assert(
        fc.property(rig, fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), unit, unit, (r, angle, near, size) => {
          const radius = 0.3 + 1.3 * size, reach = radius + CAMERA_OBSTACLE_MARGIN;
          const d = reach + 0.05 + near * 12; // cible hors de la marge
          const c: Circle = { x: eye.x + d * Math.cos(angle), z: eye.z + d * Math.sin(angle), r: radius, height: 50 };
          const pose = cameraPose(r, eye, undefined, along(c));
          const toTarget = Math.hypot(pose.position.x - eye.x, pose.position.y - eye.y, pose.position.z - eye.z);
          expect(toTarget).toBeLessThanOrEqual(r.distance + 1e-9);
          const outside = Math.hypot(pose.position.x - c.x, pose.position.z - c.z) >= reach - 1e-6;
          expect(outside || toTarget <= MIN_CAMERA_BOOM + 1e-6).toBe(true);
        }),
      );
    });
  });

  it('plancher : la caméra reste au-dessus du sol sous elle (sinon on verrait sous le terrain)', () => {
    const rig: CameraRig = { yaw: 0, pitch: -0.3, distance: 8 };
    const free = cameraPose(rig, target);
    const high = cameraPose(rig, target, () => 20);
    expect(high.position.y).toBe(20 + CAMERA_GROUND_CLEARANCE);
    expect(high.position.x).toBe(free.position.x);
    expect(high.position.z).toBe(free.position.z);
    expect(cameraPose(rig, target, () => -100).position).toEqual(free.position);
    expect(cameraPose(rig, target, () => undefined).position).toEqual(free.position);
  });
});
