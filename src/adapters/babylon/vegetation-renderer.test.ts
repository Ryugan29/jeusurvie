import '@babylonjs/core/Meshes/thinInstanceMesh';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHUNK_SIZE } from '../../core/world/chunk';
import { VegetationRenderer } from './vegetation-renderer';

/** Lot de n instances dont la 1re translation (x) vaut `x0` : de quoi reconnaître l'ordre. */
function batch(n: number, x0 = 0): Float32Array {
  const m = new Float32Array(n * 16);
  for (let i = 0; i < n; i++) m.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x0 + i, 0, 0, 1], i * 16);
  return m;
}

describe('VegetationRenderer (vrai moteur Babylon sans carte graphique)', () => {
  let engine: NullEngine, scene: Scene;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  function setup() {
    const tree = CreateBox('arbre', { size: 1 }, scene);
    const grass = CreateBox('herbe', { size: 1 }, scene);
    const renderer = new VegetationRenderer({ partsOf: (key) => (key === 'CommonTree_3' ? [tree] : key === 'Grass_Common_Tall' ? [grass] : []) });
    return { tree, grass, renderer };
  }

  it('les chunks voisins s’additionnent : un seul tampon par modèle (sinon le dernier chunk chargé efface les autres)', () => {
    const { tree, renderer } = setup();
    renderer.add('0,0', 0, 0, { CommonTree_3: batch(3) });
    renderer.add('1,0', 1, 0, { CommonTree_3: batch(2, 10) });
    renderer.update(CHUNK_SIZE, 10);
    expect(tree.thinInstanceCount).toBe(5);
    expect(tree.isEnabled()).toBe(true);
    expect(Array.from(tree.thinInstanceGetWorldMatrices()).map((m) => m.m[12])).toEqual([0, 1, 2, 10, 11]);
  });

  it('un chunk déchargé disparaît ; plus aucun chunk : le modèle n’est plus dessiné (pas un exemplaire seul à l’origine)', () => {
    const { tree, renderer } = setup();
    renderer.add('0,0', 0, 0, { CommonTree_3: batch(3) });
    renderer.add('1,0', 1, 0, { CommonTree_3: batch(2, 10) });
    renderer.update(CHUNK_SIZE, 10);
    renderer.remove('0,0');
    renderer.update(CHUNK_SIZE, 10);
    expect(tree.thinInstanceCount).toBe(2);
    renderer.remove('1,0');
    renderer.update(CHUNK_SIZE, 10);
    expect(tree.isEnabled()).toBe(false);
    expect(renderer.size).toBe(0);
  });

  it('seuls les chunks à portée sont dessinés : l’herbe lointaine est écartée, l’arbre lointain gardé', () => {
    const { tree, grass, renderer } = setup();
    const far = 5; // 5 chunks = 320 m de l’origine : hors portée de l’herbe (110 m), dans celle des arbres (600 m)
    renderer.add('0,0', 0, 0, { Grass_Common_Tall: batch(4), CommonTree_3: batch(1) });
    renderer.add(`${far},0`, far, 0, { Grass_Common_Tall: batch(6), CommonTree_3: batch(2, 100) });
    renderer.update(10, 10);
    expect(grass.thinInstanceCount).toBe(4);
    expect(tree.thinInstanceCount).toBe(3);
    // Le joueur marche vers le chunk lointain : l’herbe du premier sort de portée, celle du second entre.
    renderer.update(far * CHUNK_SIZE, 10);
    expect(grass.thinInstanceCount).toBe(6);
  });

  it('nearInstances : les instances d’un modèle autour d’un point, tous chunks confondus, qu’elles soient dessinées ou non', () => {
    const { renderer } = setup();
    renderer.add('0,0', 0, 0, { CommonTree_3: batch(3) }); // x = 0, 1, 2
    renderer.add('1,0', 1, 0, { CommonTree_3: batch(2, 100) }); // x = 100, 101
    expect(Array.from(renderer.nearInstances('CommonTree_3', 0, 0, 10)).filter((_, i) => i % 16 === 12)).toEqual([0, 1, 2]);
    expect(Array.from(renderer.nearInstances('CommonTree_3', 100, 0, 10)).filter((_, i) => i % 16 === 12)).toEqual([100, 101]);
    expect(renderer.nearInstances('CommonTree_3', 5000, 0, 10).length).toBe(0);
    expect(renderer.nearInstances('Inconnu', 0, 0, 10).length).toBe(0);
  });

  it('revision : change quand un chunk arrive ou part (de quoi savoir qu’il faut recalculer les ombres)', () => {
    const { renderer } = setup();
    const r0 = renderer.revision;
    renderer.add('0,0', 0, 0, { CommonTree_3: batch(1) });
    const r1 = renderer.revision;
    expect(r1).not.toBe(r0);
    renderer.remove('0,0');
    expect(renderer.revision).not.toBe(r1);
    const r2 = renderer.revision;
    renderer.remove('absent');
    expect(renderer.revision).toBe(r2);
  });

  it('un modèle absent de la bibliothèque est ignoré sans erreur', () => {
    const { renderer } = setup();
    expect(() => {
      renderer.add('0,0', 0, 0, { Pine_2: batch(2) });
      renderer.update(10, 10);
    }).not.toThrow();
  });
});
