import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { ProceduralTexture } from '@babylonjs/core/Materials/Textures/Procedurals/proceduralTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Scene } from '@babylonjs/core/scene';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SURFACE_LAYERS } from '../render-data/ground-materials';
import { createGroundTextures, disposeGroundTextures, groundShaderName, groundShaderSource } from './ground-textures';

const balanced = (source: string): boolean => {
  let depth = 0;
  for (const ch of source.replace(/\/\/[^\n]*/g, '')) {
    if (ch === '{' || ch === '(') depth++;
    if (ch === '}' || ch === ')') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
};

describe('shaders des matières du sol', () => {
  it('une passe couleur et une passe matière par couche, aux noms distincts', () => {
    const names = SURFACE_LAYERS.flatMap((l) => [groundShaderName(l, 'color'), groundShaderName(l, 'matter')]);
    expect(new Set(names).size).toBe(SURFACE_LAYERS.length * 2);
  });

  it('sources complètes : bruit périodique, matière de la couche, sortie ; accolades et parenthèses équilibrées', () => {
    for (const layer of SURFACE_LAYERS) {
      for (const kind of ['color', 'matter'] as const) {
        const src = groundShaderSource(layer, kind);
        expect(balanced(src)).toBe(true);
        expect(src).toContain('Matter layer(vec2 uv)');
        expect(src).toContain('mod(i, P)'); // bruit périodique : la texture se répète sans couture
        expect(src).toContain('gl_FragColor');
        expect(src).not.toMatch(/fract\(sin\(/); // pas de hachage au sinus (instable d'une carte à l'autre)
      }
      expect(groundShaderSource(layer, 'matter')).toContain('uniform float slopeScale');
    }
  });

  it('matières distinctes : brins d’herbe, cailloux et fissures, fractures et lichens, rides de neige', () => {
    expect(groundShaderSource('grass', 'color')).toContain('blade');
    expect(groundShaderSource('soil', 'color')).toContain('pebbles(');
    expect(groundShaderSource('rock', 'color')).toContain('lichen');
    expect(groundShaderSource('snow', 'color')).toContain('ripple');
  });
});

describe('createGroundTextures (vrai moteur sans carte graphique)', () => {
  let engine: NullEngine, scene: Scene;
  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });
  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('huit textures calculées une seule fois, répétées, filtrées, à la taille demandée', () => {
    const set = createGroundTextures(scene, 256, 8);
    for (const layer of SURFACE_LAYERS) {
      for (const t of [set[layer].color, set[layer].matter]) {
        expect(t).toBeInstanceOf(ProceduralTexture);
        expect((t as ProceduralTexture).refreshRate).toBe(0);
        expect(t.getSize()).toEqual({ width: 256, height: 256 });
        expect(t.wrapU).toBe(Texture.WRAP_ADDRESSMODE);
        expect(t.anisotropicFilteringLevel).toBe(8);
      }
    }
    disposeGroundTextures(set);
    for (const layer of SURFACE_LAYERS) expect(set[layer].color.getInternalTexture()).toBeNull();
  });
});
