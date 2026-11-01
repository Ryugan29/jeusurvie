import { describe, expect, it } from 'vitest';
import { GROUND_COVER_MODELS } from '../../core/world/ground-cover';
import { SHADOW_CASTER_MODELS, castsShadow } from './shadow-casters';
import { VEGETATION_MODELS } from './vegetation-instances';

describe('castsShadow (quels modèles projettent une ombre : le décor, pas le couvre-sol)', () => {
  it('arbres, pins, buissons et rochers projettent', () => {
    for (const kind of ['tree', 'pine', 'bush', 'rock'] as const) {
      for (const model of VEGETATION_MODELS[kind]) expect(castsShadow(model), model).toBe(true);
    }
  });

  it('herbe et fleurs de la végétation ne projettent pas (trop de brins pour ce que ça apporte)', () => {
    for (const kind of ['grass', 'flowers'] as const) {
      for (const model of VEGETATION_MODELS[kind]) expect(castsShadow(model), model).toBe(false);
    }
  });

  it('aucun modèle du couvre-sol ne projette : herbe, trèfles, fleurs, fougères, champignons, cailloux', () => {
    for (const models of Object.values(GROUND_COVER_MODELS)) {
      for (const model of models) expect(castsShadow(model), model).toBe(false);
    }
  });

  it('SHADOW_CASTER_MODELS : exactement les modèles qui projettent, sans doublon', () => {
    expect(SHADOW_CASTER_MODELS.length).toBe(new Set(SHADOW_CASTER_MODELS).size);
    expect(SHADOW_CASTER_MODELS.every(castsShadow)).toBe(true);
    for (const model of Object.values(VEGETATION_MODELS).flat()) expect(SHADOW_CASTER_MODELS.includes(model)).toBe(castsShadow(model));
  });

  it('un modèle inconnu ne projette pas', () => {
    expect(castsShadow('Inconnu')).toBe(false);
  });
});
