import '@babylonjs/core/Meshes/thinInstanceMesh';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHUNK_SIZE } from '../../core/world/chunk';
import { coverScaleAt } from '../render-data/ground-cover-instances';
import { GroundCoverRenderer } from './ground-cover-renderer';

/** Lot de n instances alignées sur X : la i-ème est en (x0 + i, 0), à l'échelle 1. */
function batch(n: number, x0 = 0, z = 0): Float32Array {
  const m = new Float32Array(n * 16);
  for (let i = 0; i < n; i++) m.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x0 + i, 0, z, 1], i * 16);
  return m;
}

describe('GroundCoverRenderer (vrai moteur Babylon sans carte graphique)', () => {
  let engine: NullEngine, scene: Scene;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  const OPTIONS = { radiusM: 70, fadeM: 25, stepM: 2.5 };
  function setup() {
    const grass = CreateBox('herbe', { size: 1 }, scene); // 12 triangles
    const flowerLeaves = CreateBox('feuilles', { size: 1 }, scene);
    const flowerPetals = CreateBox('petales', { size: 1 }, scene);
    const renderer = new GroundCoverRenderer(
      { partsOf: (key) => (key === 'Grass_Common_Short' ? [grass] : key === 'Flower_3_Single' ? [flowerLeaves, flowerPetals] : []) },
      OPTIONS,
    );
    return { grass, flowerLeaves, flowerPetals, renderer };
  }
  const xs = (m: { thinInstanceGetWorldMatrices(): { m: ArrayLike<number> }[] }): number[] => m.thinInstanceGetWorldMatrices().map((w) => w.m[12]!);

  it('dessine les instances à portée du joueur, dans leur ordre, et rien d’autre', () => {
    const { grass, renderer } = setup();
    renderer.add('0,0', 0, 0, { Grass_Common_Short: batch(3, 10) }); // x = 10, 11, 12
    renderer.add('9,0', 9, 0, { Grass_Common_Short: batch(2, 9 * CHUNK_SIZE) }); // à 570 m : hors rayon
    renderer.update(0, 0);
    expect(grass.thinInstanceCount).toBe(3);
    expect(grass.isEnabled()).toBe(true);
    expect(xs(grass)).toEqual([10, 11, 12]);
  });

  it('plusieurs chunks s’additionnent dans le même tampon', () => {
    const { grass, renderer } = setup();
    renderer.add('0,0', 0, 0, { Grass_Common_Short: batch(3, 10) });
    renderer.add('1,0', 1, 0, { Grass_Common_Short: batch(2, CHUNK_SIZE + 5) });
    renderer.update(CHUNK_SIZE, 10);
    expect(grass.thinInstanceCount).toBe(5);
    expect(xs(grass)).toEqual([10, 11, 12, CHUNK_SIZE + 5, CHUNK_SIZE + 6]);
  });

  it('rétrécit vers le bord du rayon : pleine taille près du joueur, plus petit dans la bande, absent au bord', () => {
    const { grass, renderer } = setup();
    const m = new Float32Array([...batch(1, 0), ...batch(1, 55), ...batch(1, 67), ...batch(1, 71)]);
    renderer.add('0,0', 0, 0, { Grass_Common_Short: m });
    renderer.update(0, 0);
    expect(grass.thinInstanceCount).toBe(3); // (71, 0) est hors rayon
    const scales = grass.thinInstanceGetWorldMatrices().map((w) => w.m[0]!);
    expect(scales[0]).toBe(1);
    expect(scales[1]).toBeCloseTo(coverScaleAt(55, 70, 25), 5);
    expect(scales[1]!).toBeLessThan(1);
    expect(scales[2]!).toBeLessThan(scales[1]!);
    expect(scales[2]!).toBeGreaterThan(0);
  });

  it('mise à jour par pas, pas par image : rien n’est refait tant que le joueur ne s’est pas déplacé du pas', () => {
    const { renderer } = setup();
    renderer.add('0,0', 0, 0, { Grass_Common_Short: batch(3, 10) });
    renderer.update(0, 0);
    const rebuilds = renderer.stats().rebuilds;
    renderer.update(0, 0);
    renderer.update(1, 1); // 1,4 m < 2,5 m
    renderer.update(-1.5, 1.5); // 2,1 m < 2,5 m
    expect(renderer.stats().rebuilds).toBe(rebuilds);
    renderer.update(3, 0); // 3 m : refait
    expect(renderer.stats().rebuilds).toBe(rebuilds + 1);
    renderer.update(3.5, 0); // 0,5 m depuis le dernier : rien
    expect(renderer.stats().rebuilds).toBe(rebuilds + 1);
  });

  it('un chunk ajouté ou retiré est pris en compte à l’image suivante, même sans déplacement', () => {
    const { grass, renderer } = setup();
    renderer.add('0,0', 0, 0, { Grass_Common_Short: batch(3, 10) });
    renderer.update(0, 0);
    renderer.add('1,0', 1, 0, { Grass_Common_Short: batch(2, 70) });
    renderer.update(0, 0);
    expect(grass.thinInstanceCount).toBe(3); // 70 m : au bord du rayon, taille nulle
    renderer.add('0,1', 0, 1, { Grass_Common_Short: batch(4, 20, 5) });
    renderer.update(0, 0);
    expect(grass.thinInstanceCount).toBe(7);
    renderer.remove('0,0');
    renderer.update(0, 0);
    expect(grass.thinInstanceCount).toBe(4);
    expect(renderer.size).toBe(2);
  });

  it('un lot plus gros que le tampon actuel est bien affiché en entier (le tampon grandit)', () => {
    const { grass, renderer } = setup();
    renderer.add('0,0', 0, 0, { Grass_Common_Short: batch(2, 10) });
    renderer.update(0, 0);
    const dense = new Float32Array(500 * 16); // 500 brins serrés, tous à portée
    for (let i = 0; i < 500; i++) dense.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, i * 0.1, 0, 5, 1], i * 16);
    renderer.add('0,1', 0, 1, { Grass_Common_Short: dense });
    renderer.update(0, 0);
    expect(grass.thinInstanceCount).toBe(502);
    expect(xs(grass).slice(0, 2)).toEqual([10, 11]);
  });

  it('plus aucune instance à portée : le modèle n’est plus dessiné (pas un exemplaire seul à l’origine)', () => {
    const { grass, renderer } = setup();
    renderer.add('0,0', 0, 0, { Grass_Common_Short: batch(3, 10) });
    renderer.update(0, 0);
    renderer.update(500, 500);
    expect(grass.isEnabled()).toBe(false);
    renderer.remove('0,0');
    renderer.update(0, 0);
    expect(grass.isEnabled()).toBe(false);
  });

  it('un modèle à plusieurs morceaux les remplit tous ; un modèle absent de la bibliothèque est ignoré sans erreur', () => {
    const { flowerLeaves, flowerPetals, renderer } = setup();
    expect(() => {
      renderer.add('0,0', 0, 0, { Flower_3_Single: batch(2, 5), Mushroom_Common: batch(2) });
      renderer.update(0, 0);
    }).not.toThrow();
    expect(flowerLeaves.thinInstanceCount).toBe(2);
    expect(flowerPetals.thinInstanceCount).toBe(2);
  });

  it('mesures : instances, triangles et appels de dessin du couvre-sol à portée', () => {
    const { renderer } = setup();
    expect(renderer.stats()).toMatchObject({ instances: 0, triangles: 0, drawCalls: 0 });
    renderer.add('0,0', 0, 0, { Grass_Common_Short: batch(10, 5), Flower_3_Single: batch(4, 8) });
    renderer.update(0, 0);
    const s = renderer.stats();
    expect(s.instances).toBe(14);
    // herbe : 10 × 12 triangles ; fleur : 2 morceaux × 4 instances × 12 triangles
    expect(s.triangles).toBe(10 * 12 + 2 * 4 * 12);
    expect(s.drawCalls).toBe(3); // un par morceau de modèle affiché
    expect(s.chunks).toBe(1);
  });
});
