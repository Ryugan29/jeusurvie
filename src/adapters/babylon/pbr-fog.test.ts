import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { fogFragment } from '@babylonjs/core/Shaders/ShadersInclude/fogFragment';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BABYLON_FOG_FRAGMENT, installPbrFog, PBR_FOG_FRAGMENT } from './pbr-fog';

/**
 * Mini préprocesseur GLSL (#ifdef / #else / #endif) : ce que Babylon garde du texte pour un jeu de « defines » donné.
 * Suffit pour l'include de brume (pas de #if complexe).
 */
function resolve(glsl: string, defined: readonly string[]): string {
  const kept: string[] = [];
  const stack: boolean[] = []; // un niveau par #ifdef ouvert : la branche courante est-elle active ?
  for (const line of glsl.split('\n')) {
    const ifdef = /^#ifdef (\w+)$/.exec(line);
    if (ifdef) stack.push(defined.includes(ifdef[1]!));
    else if (line === '#else') stack.push(!stack.pop()!);
    else if (line === '#endif') stack.pop();
    else if (stack.every(Boolean)) kept.push(line);
  }
  return kept.join('\n');
}

describe('brume des matériaux PBR : texte du shader', () => {
  it('BABYLON_FOG_FRAGMENT est exactement l’include livré avec la version de Babylon installée (sinon : à remettre à jour)', () => {
    expect(BABYLON_FOG_FRAGMENT).toBe(fogFragment.shader);
  });

  it('PBR : mélange en gamma comme le matériau standard, avec la visibilité NON convertie, puis retour en linéaire', () => {
    const pbr = resolve(PBR_FOG_FRAGMENT, ['FOG', 'PBR']);
    expect(pbr).toContain('color.rgb=toLinearSpace(mix(vFogColor,toGammaSpace(color.rgb),fog));');
    expect(pbr).not.toContain('toLinearSpace(fog)');
    expect(pbr).not.toContain('color.rgb=mix(vFogColor,color.rgb,fog);');
  });

  it('standard : la branche reste identique, caractère pour caractère, à celle de Babylon', () => {
    expect(resolve(PBR_FOG_FRAGMENT, ['FOG'])).toBe(resolve(BABYLON_FOG_FRAGMENT, ['FOG']));
    expect(resolve(PBR_FOG_FRAGMENT, ['FOG'])).toBe('float fog=CalcFogFactor();\ncolor.rgb=mix(vFogColor,color.rgb,fog);\n');
  });

  it('sans brume (pas de define FOG) : rien du tout, comme avant', () => {
    expect(resolve(PBR_FOG_FRAGMENT, [])).toBe(resolve(BABYLON_FOG_FRAGMENT, []));
    expect(resolve(PBR_FOG_FRAGMENT, ['PBR'])).toBe('');
  });

  it('résiste à la substitution de Babylon : #include<fogFragment>(color,finalColor) remplace chaque « color » (pas « vFogColor »)', () => {
    const substituted = PBR_FOG_FRAGMENT.replace(new RegExp('color', 'g'), 'finalColor');
    const pbr = resolve(substituted, ['FOG', 'PBR']);
    expect(pbr).toContain('finalColor.rgb=toLinearSpace(mix(vFogColor,toGammaSpace(finalColor.rgb),fog));');
    // Aucun autre « color » en minuscules que « color.rgb » : sinon la substitution casserait un identifiant (vFogColor est à l'abri : majuscule).
    expect(PBR_FOG_FRAGMENT.replace(/color\.rgb/g, '')).not.toContain('color');
  });
});

describe('installPbrFog (remplace l’include de Babylon, avec garde-fou)', () => {
  let warn: ReturnType<typeof vi.fn<(message: string) => void>>;
  beforeEach(() => {
    warn = vi.fn();
  });

  it('texte d’origine reconnu : l’include est remplacé, sans avertissement', () => {
    const store: Record<string, string> = { fogFragment: BABYLON_FOG_FRAGMENT, autre: 'inchangé' };
    expect(installPbrFog(store, warn)).toBe('patched');
    expect(store['fogFragment']).toBe(PBR_FOG_FRAGMENT);
    expect(store['autre']).toBe('inchangé');
    expect(warn).not.toHaveBeenCalled();
  });

  it('deuxième appel (rechargement à chaud du code) : reconnu comme déjà corrigé, sans avertissement', () => {
    const store: Record<string, string> = { fogFragment: BABYLON_FOG_FRAGMENT };
    installPbrFog(store, warn);
    expect(installPbrFog(store, warn)).toBe('already-patched');
    expect(store['fogFragment']).toBe(PBR_FOG_FRAGMENT);
    expect(warn).not.toHaveBeenCalled();
  });

  it('texte inattendu (Babylon mis à jour) : rien n’est remplacé, avertissement explicite', () => {
    const changed = BABYLON_FOG_FRAGMENT.replace('toLinearSpace(fog)', 'toLinearSpace(fog*1.0)');
    const store: Record<string, string> = { fogFragment: changed };
    expect(installPbrFog(store, warn)).toBe('unexpected-source');
    expect(store['fogFragment']).toBe(changed);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('fogFragment');
    expect(warn.mock.calls[0]![0]).toContain('pbr-fog.ts');
  });

  it('include absent du magasin : rien n’est créé, avertissement explicite', () => {
    const store: Record<string, string> = {};
    expect(installPbrFog(store, warn)).toBe('unexpected-source');
    expect(store).toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('absent');
  });

  describe('sur le vrai magasin de shaders de Babylon', () => {
    const real = ShaderStore.IncludesShadersStore as Record<string, string>;
    let saved: string | undefined;
    beforeEach(() => {
      saved = real['fogFragment'];
    });
    afterEach(() => {
      if (saved === undefined) delete real['fogFragment'];
      else real['fogFragment'] = saved;
    });

    it('le texte livré par Babylon est reconnu : la correction s’installe (sentinelle des mises à jour de Babylon)', () => {
      expect(real['fogFragment']).toBe(BABYLON_FOG_FRAGMENT);
      expect(installPbrFog(undefined, warn)).toBe('patched');
      expect(real['fogFragment']).toBe(PBR_FOG_FRAGMENT);
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
