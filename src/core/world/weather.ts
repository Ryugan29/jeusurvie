// Météo du monde (PURE, déterministe, calcul exact : ADR 0004) : une fonction de la graine et du temps de jeu, comme le
// relief. Aucun état à sauvegarder : recharger une partie, accélérer le temps ou sauter à une heure redonne le même ciel.
// Le temps est découpé en épisodes (WEATHER_SEGMENT_S) ; le type de chaque épisode est tiré au hash de la graine, et la fin
// d'un épisode se fond dans le suivant (WEATHER_TRANSITION_S) : clair → nuages → pluie → orage s'enchaînent sans saut.
// Ici et pas dans le rendu : être trempé ou abrité deviendra une règle de survie (chaleur). Les éclairs, purement visuels,
// sont dans adapters/render-data/atmosphere.
import { hash2 } from '../shared/hash';
import { smoothstep } from '../shared/math';

export const WEATHER_KINDS = ['clair', 'nuageux', 'bruine', 'pluie', 'orage', 'brouillard'] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

/** Grandeurs de la météo, toutes dans [0, 1]. */
export interface Weather {
  /** Part du ciel couverte de nuages. */
  readonly cloudCover: number;
  /** Force de la pluie qui tombe. */
  readonly rain: number;
  /** Orage : force des éclairs. */
  readonly storm: number;
  /** Brouillard (s'ajoute à la brume de l'heure). */
  readonly fog: number;
  /** Force du vent. */
  readonly wind: number;
  /** Sol mouillé : suit la pluie, puis sèche lentement (WEATHER_DRYING_S). */
  readonly wetness: number;
}

export type WeatherPreset = Omit<Weather, 'wetness'>;

export const WEATHER_PRESETS: Readonly<Record<WeatherKind, WeatherPreset>> = {
  clair: { cloudCover: 0.15, rain: 0, storm: 0, fog: 0, wind: 0.3 },
  nuageux: { cloudCover: 0.65, rain: 0, storm: 0, fog: 0, wind: 0.5 },
  bruine: { cloudCover: 0.8, rain: 0.3, storm: 0, fog: 0.25, wind: 0.45 },
  pluie: { cloudCover: 0.92, rain: 0.75, storm: 0, fog: 0.15, wind: 0.7 },
  orage: { cloudCover: 1, rain: 1, storm: 1, fog: 0.1, wind: 1 },
  brouillard: { cloudCover: 0.5, rain: 0, storm: 0, fog: 1, wind: 0.1 },
};

/** Fréquence relative de chaque type d'épisode (le premier épisode d'une partie est toujours clair). */
const WEATHER_WEIGHTS: Readonly<Record<WeatherKind, number>> = { clair: 30, nuageux: 25, bruine: 12, pluie: 14, orage: 7, brouillard: 12 };
const WEIGHT_TOTAL = WEATHER_KINDS.reduce((sum, k) => sum + WEATHER_WEIGHTS[k], 0);
/** Un orage n'éclate que si l'épisode d'avant est déjà chargé ; sinon il reste une pluie. */
const STORM_AFTER: ReadonlySet<WeatherKind> = new Set(['nuageux', 'bruine', 'pluie', 'orage']);

/** Durée (s de jeu) d'un épisode : un quart de cycle jour + nuit. */
export const WEATHER_SEGMENT_S = 300;
/** Durée (s de jeu) du fondu vers l'épisode suivant, à la fin de chaque épisode. */
export const WEATHER_TRANSITION_S = 90;
/** Le sol mouillé sèche en DRYING_STEPS × DRYING_STEP_S secondes de jeu après la fin de la pluie. */
const DRYING_STEP_S = 30;
const DRYING_STEPS = 8;
export const WEATHER_DRYING_S = DRYING_STEP_S * DRYING_STEPS;

const WEATHER_SALT = 0x77e4;

/** Type tiré pour un épisode, avant la règle de l'orage. */
function drawnKind(seed: number, index: number): WeatherKind {
  if (index <= 0) return 'clair';
  let pick = (hash2(seed, index, 0, WEATHER_SALT) / 0x100000000) * WEIGHT_TOTAL;
  for (const k of WEATHER_KINDS) {
    pick -= WEATHER_WEIGHTS[k];
    if (pick < 0) return k;
  }
  return 'clair';
}

function kindOfSegment(seed: number, index: number): WeatherKind {
  const kind = drawnKind(seed, index);
  return kind === 'orage' && !STORM_AFTER.has(drawnKind(seed, index - 1)) ? 'pluie' : kind;
}

/** Temps de jeu utilisable : un temps absurde (NaN, négatif, infini) vaut le début de partie. */
const validTime = (timeS: number): number => (Number.isFinite(timeS) && timeS > 0 ? timeS : 0);
const segmentOf = (timeS: number): number => Math.floor(validTime(timeS) / WEATHER_SEGMENT_S);

/** Type de l'épisode en cours au temps de jeu `timeS` (s). */
export function weatherKindAt(seed: number, timeS: number): WeatherKind {
  return kindOfSegment(seed, segmentOf(timeS));
}

function presetAt(seed: number, timeS: number): WeatherPreset {
  const t = validTime(timeS);
  const index = segmentOf(t);
  const a = WEATHER_PRESETS[kindOfSegment(seed, index)];
  const blend = smoothstep(WEATHER_SEGMENT_S - WEATHER_TRANSITION_S, WEATHER_SEGMENT_S, t - index * WEATHER_SEGMENT_S);
  if (blend === 0) return a;
  const b = WEATHER_PRESETS[kindOfSegment(seed, index + 1)];
  const mix = (x: number, y: number): number => x + (y - x) * blend;
  return {
    cloudCover: mix(a.cloudCover, b.cloudCover),
    rain: mix(a.rain, b.rain),
    storm: mix(a.storm, b.storm),
    fog: mix(a.fog, b.fog),
    wind: mix(a.wind, b.wind),
  };
}

/** Météo au temps de jeu `timeS` (s écoulées depuis le début de la partie). */
export function weatherAt(seed: number, timeS: number): Weather {
  const now = presetAt(seed, timeS);
  // Sol mouillé : la plus forte pluie récente, atténuée selon son ancienneté (continu, donc sans saut).
  let wetness = now.rain;
  for (let k = 1; k < DRYING_STEPS; k++) {
    wetness = Math.max(wetness, presetAt(seed, timeS - k * DRYING_STEP_S).rain * (1 - k / DRYING_STEPS));
  }
  return { ...now, wetness };
}
