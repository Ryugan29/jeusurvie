import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { QUALITY_LEVELS } from '../render-data/quality';
import {
  DEFAULT_GRAPHICS_PREFERENCES,
  GRAPHICS_PREFERENCES_KEY,
  GraphicsPreferencesStore,
  parseGraphicsPreferences,
  serializeGraphicsPreferences,
  type TextStorage,
} from './graphics-preferences';

class MemoryStorage implements TextStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const throwing: TextStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('parseGraphicsPreferences (données non fiables)', () => {
  it('rien d’enregistré : HIGH sans dérogation', () => {
    expect(parseGraphicsPreferences(null)).toEqual(DEFAULT_GRAPHICS_PREFERENCES);
    expect(DEFAULT_GRAPHICS_PREFERENCES).toEqual({ level: 'high', overrides: {} });
  });

  it('aller-retour exact pour chaque profil', () => {
    for (const level of QUALITY_LEVELS) {
      const p = { level, overrides: { ssr: false, dof: false } };
      expect(parseGraphicsPreferences(serializeGraphicsPreferences(p))).toEqual(p);
    }
  });

  it('JSON cassé, mauvais type, profil inconnu : valeurs par défaut', () => {
    for (const bad of ['', '{', '[]', '42', '"ultra"', 'null', '{"level":"epic"}', '{"level":7}', '{"level":"__proto__"}']) {
      expect(parseGraphicsPreferences(bad).level).toBe('high');
    }
  });

  it('seules les dérogations connues, à false, sont gardées (jamais un rallumage)', () => {
    const p = parseGraphicsPreferences('{"level":"ultra","overrides":{"ssr":false,"ao":true,"evil":false,"shadows":"no","__proto__":false}}');
    expect(p).toEqual({ level: 'ultra', overrides: { ssr: false } });
  });

  it('un texte démesuré est ignoré sans être lu', () => {
    expect(parseGraphicsPreferences(`{"level":"low","pad":"${'x'.repeat(5000)}"}`)).toEqual(DEFAULT_GRAPHICS_PREFERENCES);
  });

  it('n’importe quel texte : jamais d’exception, toujours un profil valide', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.json()), (text) => {
        const p = parseGraphicsPreferences(text);
        expect(QUALITY_LEVELS).toContain(p.level);
        for (const v of Object.values(p.overrides)) expect(v).toBe(false);
      }),
    );
  });
});

describe('GraphicsPreferencesStore', () => {
  it('enregistre, relit, puis rétablit les valeurs par défaut', () => {
    const storage = new MemoryStorage();
    const store = new GraphicsPreferencesStore(storage);
    expect(store.load()).toEqual(DEFAULT_GRAPHICS_PREFERENCES);
    expect(store.save({ level: 'ultra', overrides: {} })).toBe(true);
    expect(storage.data.has(GRAPHICS_PREFERENCES_KEY)).toBe(true);
    expect(new GraphicsPreferencesStore(storage).load()).toEqual({ level: 'ultra', overrides: {} });
    expect(store.reset()).toEqual(DEFAULT_GRAPHICS_PREFERENCES);
    expect(store.load()).toEqual(DEFAULT_GRAPHICS_PREFERENCES);
  });

  it('stockage bloqué ou plein : le jeu continue avec les valeurs par défaut', () => {
    const store = new GraphicsPreferencesStore(throwing);
    expect(store.load()).toEqual(DEFAULT_GRAPHICS_PREFERENCES);
    expect(store.save({ level: 'low', overrides: {} })).toBe(false);
    expect(store.reset()).toEqual(DEFAULT_GRAPHICS_PREFERENCES);
  });

  it('sans stockage du tout : rien n’est enregistré, rien ne casse', () => {
    const store = new GraphicsPreferencesStore(undefined);
    expect(store.load()).toEqual(DEFAULT_GRAPHICS_PREFERENCES);
    expect(store.save({ level: 'low', overrides: {} })).toBe(false);
  });
});
