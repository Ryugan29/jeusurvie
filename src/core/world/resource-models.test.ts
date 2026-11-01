import { describe, expect, it } from 'vitest';
import { VARIANT_COUNT, type Resource, type ResourceKind } from './placement';
import { modelKeyFor, VEGETATION_MODELS, VEGETATION_VARIANTS } from './resource-models';

const KINDS = Object.keys(VEGETATION_MODELS) as ResourceKind[];
const resource = (kind: ResourceKind, variant: number): Resource => ({ id: 'r:0:0', kind, variant, x: 0, z: 0, rotation: 0, scale: 1 });
const share = (kind: ResourceKind, prefix: string): number => VEGETATION_VARIANTS[kind].filter((m) => m.startsWith(prefix)).length / VARIANT_COUNT;

describe('modèles de végétation : une table de variantes par type (le hasard de la case choisit la variante)', () => {
  it('chaque type remplit exactement toutes ses variantes ; la liste des modèles n’a pas de doublon', () => {
    for (const kind of KINDS) {
      expect(VEGETATION_VARIANTS[kind]).toHaveLength(VARIANT_COUNT);
      expect(new Set(VEGETATION_MODELS[kind]).size).toBe(VEGETATION_MODELS[kind].length);
      expect(new Set(VEGETATION_VARIANTS[kind])).toEqual(new Set(VEGETATION_MODELS[kind]));
    }
  });

  it('arbres variés : quatre feuillus, des arbres morts ; pins : les cinq modèles ; deux buissons', () => {
    for (const m of ['CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5']) expect(VEGETATION_MODELS.tree).toContain(m);
    expect(VEGETATION_MODELS.tree.some((m) => m.startsWith('DeadTree_'))).toBe(true);
    for (const m of ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5']) expect(VEGETATION_MODELS.pine).toContain(m);
    expect(VEGETATION_MODELS.bush).toEqual(['Bush_Common', 'Bush_Common_Flowers']);
  });

  it('les arbres morts sont rares (moins de 15 % des arbres), les feuillus dominent', () => {
    expect(share('tree', 'DeadTree_')).toBeGreaterThan(0);
    expect(share('tree', 'DeadTree_')).toBeLessThan(0.15);
    expect(share('tree', 'CommonTree_')).toBeGreaterThan(0.8);
    expect(share('pine', 'DeadTree_')).toBeLessThan(0.15);
  });

  it('modelKeyFor : la variante désigne le modèle ; hors plage, elle reboucle (jamais undefined)', () => {
    for (const kind of KINDS) {
      for (let v = 0; v < VARIANT_COUNT; v++) expect(modelKeyFor(resource(kind, v))).toBe(VEGETATION_VARIANTS[kind][v]);
      expect(modelKeyFor(resource(kind, VARIANT_COUNT + 3))).toBe(VEGETATION_VARIANTS[kind][3]);
    }
  });
});
