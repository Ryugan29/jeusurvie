import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AUTUMN_RED, DRY_GOLD, foliageProfileFor, SHADE_FOOT, SHADE_TIP, WIND_SPEED_MS, type FoliageProfile } from '../render-data/foliage';
import { FoliagePlugin, type WindState } from './foliage-plugin';

/** Faux tampon d'uniformes : retient les dernières valeurs envoyées. */
function fakeUbo(): { ubo: UniformBuffer; values: Map<string, number[]> } {
  const values = new Map<string, number[]>();
  const ubo = { updateFloat4: (name: string, ...v: number[]) => values.set(name, v) } as unknown as UniformBuffer;
  return { ubo, values };
}

describe('FoliagePlugin (vent, dégradé et teinte par instance, sur la carte graphique)', () => {
  let engine: NullEngine, scene: Scene;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  const grass = foliageProfileFor('Grass')!;
  const make = (profile: FoliageProfile, wind: WindState): FoliagePlugin => new FoliagePlugin(new StandardMaterial('m', scene), profile, wind);

  it('s’accroche au matériau et active son code (define FOLIAGE)', () => {
    const material = new StandardMaterial('herbe', scene);
    const plugin = new FoliagePlugin(material, grass, { timeS: 0, strength: 1 });
    expect(material.pluginManager?.getPlugin('Foliage')).toBe(plugin);
    const defines: Record<string, unknown> = {};
    plugin.prepareDefines(defines);
    expect(defines['FOLIAGE']).toBe(true);
  });

  it('envoie le profil (hauteur de pointe, débattement × force du vent, dégradé, mode) et l’heure du vent, lue à chaque image', () => {
    const wind: WindState = { timeS: 3, strength: 0.5 };
    const plugin = make(grass, wind);
    const { ubo, values } = fakeUbo();
    plugin.bindForSubMesh(ubo);
    expect(values.get('foliageParams')).toEqual([grass.heightRefM, grass.windM * 0.5, grass.gradient, 1]);
    expect(values.get('foliageWind')![0]).toBe(3);
    wind.timeS = 4.5;
    plugin.bindForSubMesh(ubo);
    expect(values.get('foliageWind')![0]).toBe(4.5);
  });

  it('contre-jour : direction et couleur de l’astre, force × translucidité du type (l’herbe plus que les aiguilles) ; sans astre, rien', () => {
    const sun = { toSun: [0.6, 0.8, 0] as [number, number, number], color: [1, 0.7, 0.4] as [number, number, number], strength: 1 };
    const sent = (name: string, wind: WindState): number[] => {
      const { ubo, values } = fakeUbo();
      make(foliageProfileFor(name)!, wind).bindForSubMesh(ubo);
      expect(values.get('foliageSunColor')!.slice(0, 3)).toEqual(wind.sun ? sun.color : [0, 0, 0]);
      return values.get('foliageSun')!;
    };
    const grassSun = sent('Grass', { timeS: 0, strength: 1, sun });
    expect(grassSun.slice(0, 3)).toEqual(sun.toSun);
    expect(grassSun[3]).toBeGreaterThan(sent('Leaves_Pine', { timeS: 0, strength: 1, sun })[3]!);
    expect(sent('Grass', { timeS: 0, strength: 1 })[3]).toBe(0);
    sun.strength = 0; // nuit sans astre : plus de lumière à traverser
    expect(sent('Grass', { timeS: 0, strength: 1, sun })[3]).toBe(0);
  });

  it('vent coupé (force 0) : aucun débattement', () => {
    const { ubo, values } = fakeUbo();
    make(grass, { timeS: 10, strength: 0 }).bindForSubMesh(ubo);
    expect(values.get('foliageParams')![1]).toBe(0);
  });

  it('un mode par famille : fleurs (vent seul), herbe (touffes sèches), feuillus (automne), petites plantes et persistants (luminosité)', () => {
    const mode = (name: string): number => {
      const { ubo, values } = fakeUbo();
      make(foliageProfileFor(name)!, { timeS: 0, strength: 1 }).bindForSubMesh(ubo);
      return values.get('foliageParams')![3]!;
    };
    expect(mode('Flowers')).toBe(0);
    expect(mode('Grass')).toBe(1);
    expect(mode('Leaves')).toBe(3); // trèfles et fougères dorés passaient pour des fleurs : luminosité seule
    expect(mode('Leaves_NormalTree')).toBe(2);
    expect(mode('Leaves_Pine')).toBe(3);
    expect(mode('Leaves_TwistedTree')).toBe(3);
  });

  it('code injecté : position monde (vent) dans le sommet, couleur de base dans le pixel ; mêmes constantes que render-data/foliage', () => {
    const plugin = make(grass, { timeS: 0, strength: 1 });
    const vertex = plugin.getCustomCode('vertex')!;
    const fragment = plugin.getCustomCode('fragment')!;
    expect(vertex['CUSTOM_VERTEX_UPDATE_WORLDPOS']).toContain('worldPos.xz');
    expect(vertex['CUSTOM_VERTEX_DEFINITIONS']).toContain('varying');
    expect(fragment['CUSTOM_FRAGMENT_UPDATE_DIFFUSE']).toContain('baseColor.rgb');
    expect(fragment['CUSTOM_FRAGMENT_DEFINITIONS']).toContain('varying');
    const all = Object.values(vertex).join('\n') + Object.values(fragment).join('\n');
    const glsl = (c: readonly number[]): string => `vec3(${c.map((v) => v.toFixed(4)).join(', ')})`;
    for (const c of [DRY_GOLD, AUTUMN_RED, SHADE_FOOT, SHADE_TIP]) expect(all).toContain(glsl(c));
    expect(all).toContain(WIND_SPEED_MS.toFixed(4));
  });
});
