import { describe, expect, it } from 'vitest';
import { NORMAL_MAPS, normalMapFor } from './normal-maps';

describe('normalMapFor (cartes de relief des matériaux : écorces et roches, jamais le feuillage)', () => {
  it('écorces des arbres vifs et morts, roches : une carte de relief PNG chacune', () => {
    for (const name of ['Bark_NormalTree', 'Bark_DeadTree', 'Rocks']) {
      const map = normalMapFor(name);
      expect(map, name).toBeDefined();
      expect(map!.file, name).toMatch(/^[A-Za-z_]+_Normal\.png$/);
      expect(map!.level, name).toBeGreaterThan(0);
      expect(map!.level, name).toBeLessThanOrEqual(1.5);
    }
  });

  it('pas de relief sur le feuillage, l’herbe, les fleurs, les petites plantes ni les champignons', () => {
    for (const name of ['Leaves_NormalTree', 'Leaves_TwistedTree', 'Leaf_Pine', 'Grass', 'Flowers', 'Leaves', 'Mushrooms', 'Bush_Leaves']) {
      expect(normalMapFor(name), name).toBeUndefined();
    }
  });

  it('un matériau inconnu n’a pas de carte', () => {
    expect(normalMapFor('Inconnu')).toBeUndefined();
    expect(normalMapFor('')).toBeUndefined();
  });

  it('chaque fichier désigné est un nom simple (pas de chemin) : il sort du dossier des modèles', () => {
    for (const { file } of Object.values(NORMAL_MAPS)) expect(file).not.toMatch(/[/\:]/);
  });
});
