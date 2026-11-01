import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Resource, ResourceKind } from '../world/placement';
import { VEGETATION_MODELS, VEGETATION_VARIANTS } from '../world/resource-models';
import { colliderOf, FOOTPRINT_BY_MODEL, MAX_COLLIDER_EXTENT_M, overlaps, pushOut, type Circle } from './colliders';

const resource = (kind: ResourceKind, over: Partial<Resource> = {}): Resource => ({ id: 'r:0:0', kind, variant: 0, x: 10, z: -4, rotation: 0, scale: 1, ...over });
/** Ressource dont le modèle est `model` (on cherche la variante qui le désigne). */
const ofModel = (kind: ResourceKind, model: string, over: Partial<Resource> = {}): Resource => {
  const variant = VEGETATION_VARIANTS[kind].indexOf(model);
  expect(variant, `${model} est une variante de ${kind}`).toBeGreaterThanOrEqual(0);
  return resource(kind, { variant, ...over });
};
const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);
const SOLID_KINDS = ['tree', 'pine', 'rock'] as const;

describe('colliderOf (ce qui arrête le joueur)', () => {
  it('arbres et pins : cercle sur le pied du tronc, rayon × échelle', () => {
    const radii: [ResourceKind, string, number][] = [
      ['tree', 'CommonTree_2', 0.6], ['tree', 'CommonTree_3', 0.6], ['tree', 'CommonTree_4', 0.6], ['tree', 'CommonTree_5', 0.6],
      ['tree', 'DeadTree_3', 0.7], ['tree', 'DeadTree_5', 0.8],
      ['pine', 'Pine_1', 0.6], ['pine', 'Pine_2', 0.6], ['pine', 'Pine_3', 0.6], ['pine', 'Pine_4', 0.6], ['pine', 'Pine_5', 0.5],
      ['pine', 'DeadTree_4', 0.8],
    ];
    for (const [kind, model, radius] of radii) {
      const c = colliderOf(ofModel(kind, model, { scale: 1.2 }))!;
      expect(c.x, model).toBeCloseTo(10, 12);
      expect(c.z, model).toBeCloseTo(-4, 12);
      expect(c.r, model).toBeCloseTo(radius * 1.2, 12);
    }
  });

  it('chaque rocher a sa zone : centre décalé et rayon mesurés sur son modèle (échelle 1, sans rotation)', () => {
    const expected = [
      { model: 'Rock_Medium_1', x: 10.11, z: -3.65, r: 1.45 },
      { model: 'Rock_Medium_2', x: 10.18, z: -3.92, r: 1.35 },
      { model: 'Rock_Medium_3', x: 10.11, z: -3.15, r: 1.5 },
    ];
    for (const e of expected) {
      const c = colliderOf(ofModel('rock', e.model))!;
      expect(c.x, e.model).toBeCloseTo(e.x, 9);
      expect(c.z, e.model).toBeCloseTo(e.z, 9);
      expect(c.r, e.model).toBeCloseTo(e.r, 9);
    }
  });

  it('le décalage tourne avec le rocher et grandit avec son échelle', () => {
    // Quart de tour (rotation 0,25) et échelle 1,2 : le décalage (0,11 ; 0,85) du rocher n° 3 devient (0,85 ; −0,11) × 1,2.
    const c = colliderOf(ofModel('rock', 'Rock_Medium_3', { rotation: 0.25, scale: 1.2 }))!;
    expect(c.x).toBeCloseTo(10 + 1.2 * 0.85, 9);
    expect(c.z).toBeCloseTo(-4 - 1.2 * 0.11, 9);
    expect(c.r).toBeCloseTo(1.5 * 1.2, 9);
  });

  it('hauteur de l’obstacle (m, échelle 1) : mesurée sur le modèle (tronc ou rocher), × échelle', () => {
    const heights: [ResourceKind, string, number][] = [
      ['tree', 'CommonTree_3', 8], ['tree', 'CommonTree_5', 5.4], ['pine', 'Pine_5', 8.3],
      ['tree', 'CommonTree_2', 6.7], ['tree', 'CommonTree_4', 7.9],
      ['pine', 'Pine_1', 6.8], ['pine', 'Pine_3', 7], ['pine', 'Pine_4', 9.7],
      ['tree', 'DeadTree_3', 12.9], ['pine', 'DeadTree_4', 12.4], ['tree', 'DeadTree_5', 16.1],
      ['rock', 'Rock_Medium_2', 1.85],
    ];
    for (const [kind, model, h] of heights) expect(colliderOf(ofModel(kind, model))!.height, model).toBeCloseTo(h, 9);
    expect(colliderOf(ofModel('tree', 'CommonTree_3', { scale: 1.5 }))!.height).toBeCloseTo(8 * 1.5, 9);
    expect(colliderOf(ofModel('rock', 'Rock_Medium_1', { scale: 1.2 }))!.height).toBeCloseTo(2 * 1.2, 9);
  });

  it('tous les arbres, pins et rochers de VEGETATION_MODELS ont une empreinte ; buissons, herbe et fleurs se traversent', () => {
    for (const kind of SOLID_KINDS) for (const model of VEGETATION_MODELS[kind]) expect(FOOTPRINT_BY_MODEL[model], model).toBeDefined();
    for (const kind of ['bush', 'grass', 'flowers'] as const) {
      for (const model of VEGETATION_MODELS[kind]) {
        expect(FOOTPRINT_BY_MODEL[model], model).toBeUndefined();
        expect(colliderOf(ofModel(kind, model))).toBeUndefined();
      }
    }
  });

  it('MAX_COLLIDER_EXTENT_M : aucun obstacle ne s’étend plus loin que cela de sa ressource (échelle 1)', () => {
    for (const kind of SOLID_KINDS) {
      for (const model of VEGETATION_MODELS[kind]) {
        const c = colliderOf(ofModel(kind, model))!;
        expect(dist(c, { x: 10, z: -4 }) + c.r, model).toBeLessThanOrEqual(MAX_COLLIDER_EXTENT_M + 1e-9);
      }
    }
    expect(MAX_COLLIDER_EXTENT_M).toBeCloseTo(Math.hypot(0.11, 0.85) + 1.5, 9); // le rocher n° 3 : centre à ~0,86 m + rayon 1,5 m
  });
});

describe('pushOut (repousse le joueur hors des obstacles)', () => {
  const tree: Circle = { x: 0, z: 0, r: 0.6 };

  it('sans obstacle ou loin des obstacles : ne bouge pas', () => {
    expect(pushOut({ x: 3, z: 4 }, 0.35, [])).toEqual({ x: 3, z: 4 });
    expect(pushOut({ x: 3, z: 4 }, 0.35, [tree])).toEqual({ x: 3, z: 4 });
  });

  it('dans un obstacle : ramené au bord, sur la droite qui le relie au centre', () => {
    const out = pushOut({ x: 0.5, z: 0 }, 0.35, [tree]);
    expect(out.x).toBeCloseTo(0.95, 12);
    expect(out.z).toBeCloseTo(0, 12);
  });

  it('pile au centre : sorti quand même (jamais coincé)', () => {
    const out = pushOut({ x: 0, z: 0 }, 0.35, [tree]);
    expect(dist(out, tree)).toBeGreaterThanOrEqual(0.95 - 1e-9);
  });

  it('deux obstacles qui se touchent : on ressort des deux', () => {
    const circles: Circle[] = [tree, { x: 1.2, z: 0, r: 0.6 }];
    const out = pushOut({ x: 0.6, z: 0.1 }, 0.35, circles);
    for (const c of circles) expect(dist(out, c)).toBeGreaterThanOrEqual(c.r + 0.35 - 1e-6);
  });

  it('jamais dans un obstacle isolé, quelle que soit la position de départ', () => {
    const coord = fc.double({ min: -3, max: 3, noNaN: true });
    fc.assert(
      fc.property(coord, coord, (x, z) => {
        const out = pushOut({ x, z }, 0.35, [tree]);
        expect(dist(out, tree)).toBeGreaterThanOrEqual(0.95 - 1e-9);
      }),
    );
  });

  it('ne déplace que ce qui est dans un obstacle (point libre inchangé, au bit près)', () => {
    const coord = fc.double({ min: -3, max: 3, noNaN: true });
    fc.assert(
      fc.property(coord, coord, (x, z) => {
        fc.pre(dist({ x, z }, tree) >= 0.95);
        expect(pushOut({ x, z }, 0.35, [tree])).toEqual({ x, z });
      }),
    );
  });
});

describe('overlaps (le joueur est-il dans un obstacle ?)', () => {
  const tree: Circle = { x: 0, z: 0, r: 0.6 };

  it('dedans : oui ; au bord ou dehors : non', () => {
    expect(overlaps({ x: 0.9, z: 0 }, 0.35, [tree])).toBe(true);
    expect(overlaps({ x: 0.95, z: 0 }, 0.35, [tree])).toBe(false);
    expect(overlaps({ x: 2, z: 0 }, 0.35, [tree])).toBe(false);
    expect(overlaps({ x: 0, z: 0 }, 0.35, [])).toBe(false);
  });

  it('un point ramené au bord par pushOut n’est pas « dedans » (arrondis tolérés)', () => {
    const coord = fc.double({ min: -3, max: 3, noNaN: true });
    fc.assert(
      fc.property(coord, coord, (x, z) => {
        expect(overlaps(pushOut({ x, z }, 0.35, [tree]), 0.35, [tree])).toBe(false);
      }),
    );
  });
});
