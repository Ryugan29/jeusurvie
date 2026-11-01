// Préférences graphiques enregistrées chez le joueur (stockage du navigateur ; dans le .exe, le même stockage de la fenêtre) :
// le profil choisi et ses dérogations (render-data/quality). Données NON FIABLES (stockage modifiable, partagé sur itch.io,
// version précédente du jeu) : tout est relu et validé ; une valeur douteuse est ignorée, jamais propagée, et la lecture ne
// lève jamais d'exception (navigation privée, stockage bloqué : on retombe sur les réglages par défaut, et l'écriture échoue
// en silence — le jeu continue).
import {
  DEFAULT_QUALITY_LEVEL,
  QUALITY_OVERRIDE_KEYS,
  isQualityLevel,
  type QualityLevel,
  type QualityOverrideKey,
  type QualityOverrides,
} from '../render-data/quality';

/** Clé du stockage ; le numéro change si le format change (l'ancien est alors ignoré). */
export const GRAPHICS_PREFERENCES_KEY = 'jeusurvie.graphismes.v1';
/** Au-delà, ce n'est pas une préférence écrite par le jeu : ignorée sans être lue. */
const MAX_LENGTH = 2048;

export interface GraphicsPreferences {
  readonly level: QualityLevel;
  readonly overrides: QualityOverrides;
}

export const DEFAULT_GRAPHICS_PREFERENCES: GraphicsPreferences = { level: DEFAULT_QUALITY_LEVEL, overrides: {} };

/** Ce que l'adaptateur demande au stockage (window.localStorage, ou un faux dans les tests). */
export interface TextStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Préférences lues dans un texte JSON ; tout ce qui n'est pas reconnu est remplacé par la valeur par défaut. */
export function parseGraphicsPreferences(text: string | null): GraphicsPreferences {
  if (text === null || text.length > MAX_LENGTH) return DEFAULT_GRAPHICS_PREFERENCES;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return DEFAULT_GRAPHICS_PREFERENCES;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return DEFAULT_GRAPHICS_PREFERENCES;
  const record = data as Record<string, unknown>;
  const level = Object.hasOwn(record, 'level') && isQualityLevel(record['level']) ? record['level'] : DEFAULT_QUALITY_LEVEL;
  const overrides: Partial<Record<QualityOverrideKey, boolean>> = {};
  const raw = Object.hasOwn(record, 'overrides') ? record['overrides'] : undefined;
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const key of QUALITY_OVERRIDE_KEYS) if (Object.hasOwn(o, key) && o[key] === false) overrides[key] = false;
  }
  return { level, overrides };
}

export function serializeGraphicsPreferences(p: GraphicsPreferences): string {
  const overrides: Record<string, boolean> = {};
  for (const key of QUALITY_OVERRIDE_KEYS) if (p.overrides[key] === false) overrides[key] = false;
  return JSON.stringify({ level: p.level, overrides });
}

export class GraphicsPreferencesStore {
  constructor(private readonly storage: TextStorage | undefined) {}

  load(): GraphicsPreferences {
    try {
      return parseGraphicsPreferences(this.storage?.getItem(GRAPHICS_PREFERENCES_KEY) ?? null);
    } catch {
      return DEFAULT_GRAPHICS_PREFERENCES;
    }
  }

  /** Vrai si enregistré (faux : stockage indisponible ou plein ; la préférence vaut alors pour cette session seulement). */
  save(p: GraphicsPreferences): boolean {
    try {
      this.storage?.setItem(GRAPHICS_PREFERENCES_KEY, serializeGraphicsPreferences(p));
      return this.storage !== undefined;
    } catch {
      return false;
    }
  }

  /** Oublie les préférences : les réglages par défaut reviennent. */
  reset(): GraphicsPreferences {
    try {
      this.storage?.removeItem(GRAPHICS_PREFERENCES_KEY);
    } catch {
      // stockage bloqué : rien à effacer
    }
    return DEFAULT_GRAPHICS_PREFERENCES;
  }
}

/** Le stockage de la page s'il est accessible (il peut lever une exception rien qu'à la lecture de `localStorage`). */
export function browserStorage(): TextStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
