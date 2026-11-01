// SPIKE « beau et fluide » — CODE JETABLE (exception écrite au TDD, CLAUDE.md) : ASSEMBLE seulement les briques
// testées (cœur, app, adapters, ui) pour voir et mesurer. Aucune logique ici. Jamais importé par src/ ; supprimé
// avant S1.
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import '@babylonjs/core/Engines/AbstractEngine/abstractEngine.timeQuery';
import '@babylonjs/core/Engines/Extensions/engine.query';
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Scene } from '@babylonjs/core/scene';
import { applyLook, applyZoom, cameraPose, type CameraRig } from '../app/camera/camera-rig';
import { forwardOf } from '../app/camera/camera-rig';
import { ChunkLoading } from '../app/chunks/chunk-loading';
import { ReplanGate } from '../app/chunks/replan-gate';
import { effectiveViewRadius, planStreaming } from '../app/chunks/streamer';
import { wishDirection } from '../app/input/intent';
import { blocksBrowserDefault } from '../app/input/raw-input';
import { GameSession } from '../app/loop/game-session';
import { INITIAL_MODE, nextMode, simulationRuns, type InputMode } from '../app/modes/input-mode';
import { ObstacleIndex } from '../app/world/obstacle-index';
import { SIM_HZ } from '../core/config/balance';
import { overlaps, type Circle } from '../core/physics/colliders';
import { groundHeightIn } from '../core/physics/ground';
import { timeOfDay } from '../core/survival/time-of-day';
import { CHUNK_SIZE } from '../core/world/chunk';
import { GROUND_COVER_MODELS } from '../core/world/ground-cover';
import { findSummit } from '../core/world/summit';
import { WEATHER_KINDS, WEATHER_PRESETS, weatherAt, weatherKindAt, type Weather, type WeatherKind } from '../core/world/weather';
import { CAPSULE_OPTIONS, capsuleMinY } from '../adapters/babylon/capsule';
import { loadAnimatedModel, loadAnimationSource, retargetAnimations, type AnimatedModel } from '../adapters/babylon/animated-model';
import { AssetLibrary } from '../adapters/babylon/asset-library';
import { createEngine } from '../adapters/babylon/engine';
import { FpsMeter } from '../adapters/babylon/fps-meter';
import { installPbrFog } from '../adapters/babylon/pbr-fog';
import type { WindState } from '../adapters/babylon/foliage-plugin';
import { SceneLighting } from '../adapters/babylon/lighting';
import { SkyEnvironment } from '../adapters/babylon/sky-environment';
import { glowingMaterials, NightMagicRenderer } from '../adapters/babylon/night-magic-renderer';
import { parseToneMapping } from '../adapters/babylon/post-processing';
import { RenderPipeline } from '../adapters/babylon/render-pipeline';
import { WetSurfaces } from '../adapters/babylon/wet-surfaces';
import { RainRenderer } from '../adapters/babylon/rain-renderer';
import { LocomotionAnimator } from '../adapters/babylon/locomotion-animator';
import { ShadowProxies } from '../adapters/babylon/shadow-proxies';
import { browserStorage, GraphicsPreferencesStore } from '../adapters/storage/graphics-preferences';
import { TerrainRenderer } from '../adapters/babylon/terrain-renderer';
import { createFarTerrainWorker, FarTerrainRenderer } from '../adapters/babylon/far-terrain-renderer';
import { GroundCoverRenderer } from '../adapters/babylon/ground-cover-renderer';
import { VegetationRenderer } from '../adapters/babylon/vegetation-renderer';
import { DomInputDevice } from '../adapters/input/dom-input-device';
import { headingOf, horizontalSpeed, turnToward, TURN_RATE_RAD_PER_S } from '../adapters/render-data/character-motion';
import { meshPositionForFeet } from '../adapters/render-data/character-pose';
import { atmosphereFor, lightningFlash, sceneBrightness, weatherGrade } from '../adapters/render-data/atmosphere';
import { iblIntensityFor } from '../adapters/render-data/environment-light';
import { hazeColor } from '../adapters/render-data/fog';
import { gradeFor } from '../adapters/render-data/grade';
import { lensRainTarget, stepLensWetness } from '../adapters/render-data/lens-drops';
import { lightingFor } from '../adapters/render-data/lighting';
import {
  QUALITY_DESCRIPTIONS,
  QUALITY_LEVELS,
  describeQuality,
  isQualityLevel,
  levelFromUrl,
  overridesFromUrl,
  resolveQuality,
  type QualityLevel,
  type QualitySettings,
} from '../adapters/render-data/quality';
import { COVER_RADIUS_M } from '../adapters/render-data/ground-cover-instances';
import { SHADOW_CASTER_MODELS } from '../adapters/render-data/shadow-casters';
import { VEGETATION_MODELS } from '../adapters/render-data/vegetation-instances';
import { viewSectorFor } from '../adapters/render-data/view-sector';
import { createChunkWorker } from '../adapters/worker/create-chunk-workers';
import { WorkerChunkSource } from '../adapters/worker/worker-chunk-source';
import { setTextIfChanged } from '../ui/dom/set-if-changed';
import { GraphicsSettingsPanel } from '../ui/settings/graphics-settings-panel';

// --- Réglages de la démo (lus dans l'adresse : ?seed=123&view=512&heure=nuit&x=-3500&z=-2000) ----------------
const params = new URLSearchParams(location.search);
const SEED = parseSeed(params.get('seed'));
/** ?view=<m> : rayon des chunks détaillés imposé (sinon celui du profil graphique). */
const VIEW_OVERRIDE_M = params.get('view') === null ? undefined : clampInt(params.get('view'), 192, 1024, 512);
const STREAM = { viewRadiusM: 512, unloadMarginM: CHUNK_SIZE, maxChunks: 520 };
/** Moments de la journée (fraction du cycle) : touches 1 à 4, ou ?heure=matin|midi|crepuscule|nuit. */
const MOMENTS: Readonly<Record<string, number>> = { matin: 0.06, midi: 0.3, crepuscule: 0.64, nuit: 0.85 };
const MOMENT_KEYS: Readonly<Record<string, string>> = { Digit1: 'matin', Digit2: 'midi', Digit3: 'crepuscule', Digit4: 'nuit' };
/** ?couvert=0 : sans couvre-sol (herbe, fleurs, cailloux…) ; ?couvert=<m> : rayon de rendu en mètres (défaut COVER_RADIUS_M). */
const COVER_PARAM = params.get('couvert');
const COVER_ENABLED = COVER_PARAM !== '0';
const COVER_RADIUS_OVERRIDE = COVER_PARAM === null || COVER_PARAM === '0' ? undefined : clampInt(COVER_PARAM, 20, 120, COVER_RADIUS_M);
// Profil graphique : celui enregistré par le joueur (Réglages → Graphismes), sinon HIGH. ?qualite=low|medium|high|ultra (ou les anciens
// basse|moyenne|haute) l'impose pour cette visite sans l'enregistrer ; les interrupteurs ?ombres=0 ?ao=0 ?ssr=0 ?rayons=0 ?brume=0
// ?dof=0 ?flou=0 ?aa=0 ?pluie=0 coupent un effet (render-data/quality) ; ?nuages=0 : nuages plats.
const graphicsStore = new GraphicsPreferencesStore(browserStorage());
let graphicsPrefs = graphicsStore.load();
const URL_LEVEL = levelFromUrl((name) => params.get(name));
const URL_OVERRIDES = overridesFromUrl((name) => params.get(name));
const FLAT_CLOUDS = params.get('nuages') === '0';
function resolveGraphics(level: QualityLevel): QualitySettings {
  const q = resolveQuality(level, { ...graphicsPrefs.overrides, ...URL_OVERRIDES });
  return FLAT_CLOUDS ? { ...q, sky: { ...q.sky, clouds: 'flat' } } : q;
}
let QUALITY = resolveGraphics(URL_LEVEL ?? graphicsPrefs.level);
/** ?vent=0 : herbe, fleurs et feuillages immobiles (pour comparer et mesurer le coût du vent). */
const WIND: WindState = {
  timeS: 0,
  strength: params.get('vent') === '0' ? 0 : 1,
  // Contre-jour dans la végétation (?translucide=0 : sans) : suit l'astre à chaque image.
  ...(params.get('translucide') === '0' ? {} : { sun: { toSun: [0, 1, 0], color: [1, 1, 1], strength: 0 } }),
};
/** ?vent=0 : force de base du vent (la météo la module ensuite). */
const WIND_BASE = WIND.strength;
/** Vent selon la météo : brise légère par beau temps, bourrasques sous l'orage. */
const WIND_CALM = 0.4, WIND_GUSTS = 1.2;
/** ?meteo=clair|nuageux|bruine|pluie|orage|brouillard : temps imposé (touche 6 : fait défiler, puis revient à la météo du monde). */
let weatherOverride: WeatherKind | undefined = (WEATHER_KINDS as readonly string[]).includes(params.get('meteo') ?? '')
  ? (params.get('meteo') as WeatherKind)
  : undefined;
/** Horloge réelle (s) : les éclairs durent toujours le même temps, cycle accéléré ou non. */
let realClockS = 0;
/** L'horloge du vent reboucle (s) : les sinus du shader gardent leur précision (un léger raccord par heure de jeu). */
const WIND_LOOP_S = 3600;
const MAX_NEW_CHUNKS_PER_FRAME = 4;
/** ?elagage=0 : végétation et couvre-sol dessinés tout autour, même hors du champ (pour mesurer le gain de l'élagage). */
const CULL_ENABLED = params.get('elagage') !== '0';
/** Marge (m) au-delà de la distance d'ombre : un arbre juste hors portée peut encore jeter son ombre jusque dans la portée. */
const SHADOW_MARGIN_M = 40;
/** Rayon (m) du décor qui cache le soleil pour les rayons, quand il n'y a pas d'ombres pour en fixer un. */
const RAYS_OCCLUDER_RADIUS_M = 120;
const MOUSE_SENSITIVITY = 0.0025;
const EYE_HEIGHT = 1.5;
const MODELS_URL = '/assets/models/';
const HEROINE_HEIGHT_M = 1.7;
/** La texture de cheveux du pack est grise, faite pour être teintée : châtain foncé (cheveux et sourcils partagent le matériau). */
const HEROINE_TINTS = { MI_Hair_2: new Color3(0.42, 0.24, 0.13) };
const DEMON_HEIGHT_M = 2.6;
const DEMON_DISTANCE_M = 6;
/** Rayon (m) de la zone solide du démon, vue du dessus : son corps, pas le bout des ailes. */
const DEMON_RADIUS_M = 0.9;
/** Maj enfoncée : marche lente (fraction de la vitesse normale) pour voir l'animation Walk. */
const SLOW_WALK_FACTOR = 0.3;

function parseSeed(text: string | null): number {
  return text !== null && /^\d{1,10}$/.test(text) && Number(text) <= 0xffffffff ? Number(text) : 12345;
}
function parseCoord(text: string | null): number {
  const n = text !== null && /^-?\d{1,4}$/.test(text) ? Number(text) : 0;
  return Math.min(7000, Math.max(-7000, n));
}
function clampInt(text: string | null, min: number, max: number, fallback: number): number {
  const n = text !== null && /^\d{1,5}$/.test(text) ? Number(text) : fallback;
  return Math.min(max, Math.max(min, n));
}
/** Météo du moment : celle du monde, ou le temps imposé (?meteo=, touche 6), sol mouillé autant qu'il pleut. */
function currentWeather(worldSeconds: number): Weather {
  if (weatherOverride === undefined) return weatherAt(SEED, worldSeconds);
  const preset = WEATHER_PRESETS[weatherOverride];
  return { ...preset, wetness: preset.rain };
}
/** Touche 6 : temps imposé suivant ; après le dernier, retour à la météo du monde. */
function nextWeatherOverride(current: WeatherKind | undefined): WeatherKind | undefined {
  if (current === undefined) return WEATHER_KINDS[0];
  return WEATHER_KINDS[WEATHER_KINDS.indexOf(current) + 1];
}
function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

// --- Page ----------------------------------------------------------------------------------------------------
const canvas = byId<HTMLCanvasElement>('scene');
const overlay = byId<HTMLDivElement>('overlay');
const overlayText = byId<HTMLParagraphElement>('overlay-text');
const panel = byId<HTMLDivElement>('panel');
const fpsLine = byId<HTMLParagraphElement>('fps');
const infoLine = byId<HTMLParagraphElement>('info');
const coverLine = byId<HTMLParagraphElement>('cover');
const seedLine = byId<HTMLParagraphElement>('seed');

// --- Scène ---------------------------------------------------------------------------------------------------
// Brume des matériaux PBR (personnages, roches) identique à celle du sol : AVANT le premier matériau compilé.
installPbrFog();
const engine = createEngine(canvas, QUALITY.image.maxPixelRatio);
const scene = new Scene(engine);
scene.skipPointerMovePicking = true;
const camera = new FreeCamera('camera', new Vector3(0, 30, -10), scene);
camera.minZ = 0.1;
camera.fov = 1.0;
// Relief lointain (?lointain=0 : sans) : le vrai terrain, grossier, sur plusieurs kilomètres autour du joueur, au-delà des chunks ;
// son étendue et son pas viennent du profil graphique.
const FAR_ENABLED = params.get('lointain') !== '0';
/** Distances du profil : rayon des chunks, relief lointain (null : sans), distance de brume, rayon du ciel, plan lointain. */
function distancesOf(q: QualitySettings) {
  const viewRadiusM = effectiveViewRadius(VIEW_OVERRIDE_M ?? q.distances.viewRadiusM, STREAM.maxChunks);
  const far = FAR_ENABLED ? q.distances.farTerrain : null;
  const reach = far ? far.halfSizeM : viewRadiusM;
  return { viewRadiusM, far, fogDistanceM: reach, skyRadiusM: far ? reach * 1.45 : reach * 1.2, maxZ: far ? reach * 1.6 : reach * 3 };
}
let distances = distancesOf(QUALITY);
STREAM.viewRadiusM = distances.viewRadiusM;
camera.maxZ = distances.maxZ;
const lighting = new SceneLighting(scene, {
  viewRadiusM: distances.viewRadiusM,
  fogDistanceFraction: 1,
  heightFogBaseY: -6,
  domeSegments: 32,
  // Avec le relief lointain, la brume se règle sur les kilomètres visibles : le proche reste net, les chaînes pâlissent au loin.
  fogDistanceM: distances.fogDistanceM,
  skyRadiusM: distances.skyRadiusM,
  clouds: QUALITY.sky.clouds,
});
// Éclairage d'environnement (IBL) des matériaux PBR, tiré du ciel de l'heure (?ibl=0 : sans) ; taille et fréquence : profil graphique.
const IBL_ENABLED = params.get('ibl') !== '0';
let skyEnvironment = IBL_ENABLED ? new SkyEnvironment(scene, lighting.sky.mesh, { size: QUALITY.sky.envProbeSize, refreshS: QUALITY.sky.envProbeRefreshS }) : undefined;
// Rayons de soleil : ils ne tiennent compte que du décor PROCHE (les « doubles » de shadow-proxies), du terrain et des personnages :
// ni le ciel, ni l'herbe, ni les arbres lointains (trop chers pour des rais qu'on ne distingue pas). `notOccluders` se remplit au
// chargement des modèles.
const notOccluders = new Set<AbstractMesh>();
// Chaîne de rendu (ombres, occlusion, reflets, atmosphère, rayons, développement, gouttes) : TOUT vient du profil graphique.
// ?post=0 : sans développement (pour comparer) ; ?tonemap=standard|neutre : autre tone mapping ; ?gouttes=0 : sans gouttes.
const pipeline = new RenderPipeline(scene, camera, lighting.sun, {
  toneMapping: parseToneMapping(params.get('tonemap')),
  grading: params.get('post') !== '0',
  lensDrops: params.get('gouttes') !== '0',
  isRayOccluder: (mesh) => mesh !== lighting.sky.mesh && !notOccluders.has(mesh),
  devicePixelRatio: () => window.devicePixelRatio,
  setAerialPerspective: (enabled) => lighting.setAerialPerspective(enabled),
});
let lensWetness = 0;
// Roches, écorces, personnages : plus sombres et luisants sous la pluie.
const wetSurfaces = new WetSurfaces(scene);
const terrain = new TerrainRenderer(scene, QUALITY.terrain);
// Pluie autour de la caméra (nombre de gouttes selon le profil ; ?pluie=0 : aucune).
let rain = new RainRenderer(scene, QUALITY.rainDrops);
lighting.addHeightFog(terrain.material);
function createFar(d: ReturnType<typeof distancesOf>): FarTerrainRenderer | undefined {
  if (!d.far) return undefined;
  const renderer = new FarTerrainRenderer(
    scene,
    SEED,
    { halfSizeM: d.far.halfSizeM, stepM: d.far.stepM, innerRadiusM: d.viewRadiusM - CHUNK_SIZE, recenterM: 500, sinkM: 2 },
    createFarTerrainWorker(),
  );
  lighting.addHeightFog(renderer.material);
  return renderer;
}
let far = createFar(distances);
// Végétation : modèles glTF chargés une fois (?vegetation=0 : sans, pour comparer la fluidité).
const library = new AssetLibrary(scene, '/assets/models/nature/', WIND);
const vegetation = new VegetationRenderer(library);
vegetation.setRangeScale(QUALITY.distances.vegetationRange);
// Couvre-sol : herbe, trèfles, fleurs, fougères, champignons, cailloux autour du joueur (purement visuel, sans collision).
const cover = COVER_ENABLED
  ? new GroundCoverRenderer(library, { radiusM: COVER_RADIUS_OVERRIDE ?? QUALITY.distances.coverRadiusM, density: QUALITY.distances.coverDensity })
  : undefined;
let vegetationLoaded = false;
if (params.get('vegetation') !== '0') {
  setTextIfChanged(overlayText, 'Chargement des arbres, des rochers et de l’herbe…');
  try {
    await library.load([...new Set([...Object.values(VEGETATION_MODELS).flat(), ...(cover ? Object.values(GROUND_COVER_MODELS).flat() : [])])]);
    vegetationLoaded = true;
  } catch (error) {
    console.error('Modèles de végétation illisibles : le jeu continue sans.', error);
  }
}
// Nuit fantasy (?magie=0 : sans) : lucioles autour du joueur, champignons qui luisent.
const nightMagic = params.get('magie') !== '0' ? new NightMagicRenderer(scene, glowingMaterials(scene.materials)) : undefined;
// Ombres en cascade du soleil : le décor PROCHE et les personnages projettent ; le sol, le couvre-sol, le décor et les personnages
// reçoivent. L'herbe ne projette pas (render-data/shadow-casters). Le décor proche projette par des « doubles » qui ne portent que les
// instances à portée d'ombre (adapters/babylon/shadow-proxies) ; leur rayon suit la portée des ombres du profil.
/** Rayon (m) des doubles : portée des ombres + marge, ou, sans ombres, le décor qui cache le soleil pour les rayons. */
const proxyRadiusOf = (q: QualitySettings): number => (q.shadows ? q.shadows.rangeM + SHADOW_MARGIN_M : RAYS_OCCLUDER_RADIUS_M);
let shadowProxies: ShadowProxies | undefined;
if (vegetationLoaded) {
  for (const key of new Set([...Object.values(VEGETATION_MODELS).flat(), ...(cover ? Object.values(GROUND_COVER_MODELS).flat() : [])])) {
    for (const part of library.partsOf(key)) {
      part.receiveShadows = true;
      notOccluders.add(part); // les gros blocs (jusqu'à 600 m) ne cachent rien : seuls les doubles proches comptent
    }
  }
  shadowProxies = new ShadowProxies(library, vegetation, SHADOW_CASTER_MODELS, { radiusM: proxyRadiusOf(QUALITY), stepM: 8 }, (proxy) =>
    pipeline.addShadowCaster(proxy),
  );
}
pipeline.apply(QUALITY);
let forceReplan = false;

/**
 * Applique un profil graphique à chaud (réglages, ou capture automatisée) : chaîne de rendu, distances, ciel, sol, végétation, pluie.
 * Ce qui coûte (textures du sol refaites, shaders recompilés) n'est refait que si ça change.
 */
function applyGraphics(q: QualitySettings): void {
  const before = QUALITY;
  QUALITY = q;
  const d = distancesOf(q);
  if (d.viewRadiusM !== distances.viewRadiusM || JSON.stringify(d.far) !== JSON.stringify(distances.far)) {
    if (far) {
      lighting.removeHeightFog(far.material);
      far.dispose();
    }
    far = createFar(d);
  }
  distances = d;
  STREAM.viewRadiusM = d.viewRadiusM;
  forceReplan = true;
  camera.maxZ = d.maxZ;
  lighting.setDistances(d.fogDistanceM, d.skyRadiusM);
  lighting.setCloudQuality(q.sky.clouds);
  if (IBL_ENABLED && (q.sky.envProbeSize !== before.sky.envProbeSize || q.sky.envProbeRefreshS !== before.sky.envProbeRefreshS)) {
    skyEnvironment?.dispose();
    skyEnvironment = new SkyEnvironment(scene, lighting.sky.mesh, { size: q.sky.envProbeSize, refreshS: q.sky.envProbeRefreshS });
  }
  terrain.setQuality(q.terrain);
  vegetation.setRangeScale(q.distances.vegetationRange);
  cover?.setReach(COVER_RADIUS_OVERRIDE ?? q.distances.coverRadiusM, q.distances.coverDensity);
  if (q.rainDrops !== before.rainDrops) {
    rain.dispose();
    rain = new RainRenderer(scene, q.rainDrops);
  }
  pipeline.apply(q);
  shadowProxies?.setRadius(proxyRadiusOf(q));
  showQualityLine();
}
function showQualityLine(): void {
  setTextIfChanged(
    seedLine,
    `Graine : ${SEED} · distance de vue : ${Math.round(distances.viewRadiusM)} m · ${describeQuality(QUALITY)}` +
      (pipeline.msaaSamples !== QUALITY.image.msaa && QUALITY.image.msaa > 1 ? ` (MSAA ${pipeline.msaaSamples}× sur cette carte)` : ''),
  );
}
showQualityLine();
const capsule = CreateCapsule('perso', { ...CAPSULE_OPTIONS }, scene);
const CAPSULE_MIN_Y = capsuleMinY(CAPSULE_OPTIONS);
const capsuleMaterial = new StandardMaterial('perso', scene);
capsuleMaterial.diffuseColor = new Color3(0.95, 0.45, 0.25);
capsuleMaterial.specularColor = new Color3(0.15, 0.15, 0.15);
capsule.material = capsuleMaterial;
capsule.isPickable = false;
const cameraTarget = new Vector3();

// --- Personnages : l'héroïne (animations du héros reciblées sur son squelette) et un démon -----------------------
// ?personnages=0 : sans, la capsule orange reste. Si un modèle est illisible, la scène continue sans lui.
async function loadHeroine(): Promise<{ model: AnimatedModel; animator: LocomotionAnimator }> {
  const source = await loadAnimationSource(scene, `${MODELS_URL}characters/hero.gltf`);
  try {
    const model = await loadAnimatedModel(scene, `${MODELS_URL}characters/heroine/heroine.gltf`, { heightM: HEROINE_HEIGHT_M, tints: HEROINE_TINTS });
    try {
      const { groups, missingBones } = retargetAnimations(source, model, ['Idle', 'Walk', 'Run'], { moveBones: ['pelvis'] });
      if (missingBones.length > 0) console.warn('Os du héros absents de l’héroïne :', missingBones.join(', '));
      return { model, animator: new LocomotionAnimator({ Idle: groups.get('Idle')!, Walk: groups.get('Walk')!, Run: groups.get('Run')! }) };
    } catch (error) {
      model.pivot.dispose(); // pas d'héroïne figée en T : la capsule reste
      throw error;
    }
  } finally {
    source.dispose();
  }
}
async function loadDemon(): Promise<AnimatedModel> {
  const model = await loadAnimatedModel(scene, `${MODELS_URL}creatures/Demon.gltf`, { heightM: DEMON_HEIGHT_M });
  const idle = model.animations.get('Idle');
  if (idle === undefined) throw new Error('Le démon n’a pas d’animation Idle.');
  idle.start(true);
  model.pivot.setEnabled(false); // caché jusqu'à ce que le sol soit chargé sous lui
  return model;
}
let heroine: { model: AnimatedModel; animator: LocomotionAnimator } | undefined;
let demon: AnimatedModel | undefined;
if (params.get('personnages') !== '0') {
  setTextIfChanged(overlayText, 'Chargement de l’héroïne et du démon…');
  const [heroineResult, demonResult] = await Promise.allSettled([loadHeroine(), loadDemon()]);
  if (heroineResult.status === 'fulfilled') heroine = heroineResult.value;
  else console.error('Héroïne illisible : la capsule reste.', heroineResult.reason);
  if (demonResult.status === 'fulfilled') demon = demonResult.value;
  else console.error('Démon illisible : la scène continue sans lui.', demonResult.reason);
}
if (heroine) capsule.setEnabled(false);
else pipeline.addShadowCaster(capsule);
for (const model of [heroine?.model, demon]) {
  for (const mesh of model?.meshes ?? []) {
    pipeline.addShadowCaster(mesh);
    mesh.receiveShadows = true;
  }
}

// --- Monde et session ----------------------------------------------------------------------------------------
const workerCount = Math.min(3, Math.max(1, (navigator.hardwareConcurrency || 2) - 1));
const source = new WorkerChunkSource(SEED, createChunkWorker, workerCount, {
  onChunkFailed: (cx, cz) => console.error(`Chunk ${cx},${cz} abandonné après plusieurs échecs du worker.`),
  groundCover: COVER_ENABLED && params.get('vegetation') !== '0',
});
const loading = new ChunkLoading(source, MAX_NEW_CHUNKS_PER_FRAME);
const ground = (x: number, z: number): number | undefined => groundHeightIn(loading.chunks, x, z);
// ?lieu=montagne : sur le plus haut sommet à moins de 6 km (déterministe pour la graine), vue sur les chaînes.
const summit = params.get('lieu') === 'montagne' ? findSummit(SEED, { radiusM: 6000, gridStepM: 250 }) : undefined;
const spawn = summit ? { x: summit.x, z: summit.z } : { x: parseCoord(params.get('x')), z: parseCoord(params.get('z')) };
// Troncs et rochers arrêtent le joueur — seulement s'ils sont dessinés (?vegetation=0 : on traverse le vide).
const obstacles = new ObstacleIndex(SEED);
// Créatures solides (le démon, une fois posé) : s'ajoutent aux troncs et rochers.
const creatureColliders: Circle[] = [];
const session = new GameSession({
  spawn,
  ground,
  obstacles: (x: number, z: number) => (vegetationLoaded ? [...obstacles.near(x, z), ...creatureColliders] : creatureColliders),
});
session.setTimeOfDay(MOMENTS[params.get('heure') ?? ''] ?? MOMENTS['matin']!);
const replan = new ReplanGate();

// --- Entrées et modes ----------------------------------------------------------------------------------------
let mode: InputMode = INITIAL_MODE;
const input = new DomInputDevice(canvas, (code) => blocksBrowserDefault(code, mode));
input.attach();
// ?regard=<radians> : direction initiale de la caméra (pour montrer une zone précise).
const LOOK_YAW = Number(params.get('regard') ?? '0.6');
// ?inclinaison=<radians> : hauteur initiale de la caméra (0,35 par défaut ; négatif : plus bas, on voit plus de ciel).
const LOOK_PITCH = Number(params.get('inclinaison') ?? '0.35');
let rig: CameraRig = { yaw: Number.isFinite(LOOK_YAW) ? LOOK_YAW : 0.6, pitch: Number.isFinite(LOOK_PITCH) ? LOOK_PITCH : 0.35, distance: 7 };
let heroineHeading = rig.yaw; // l'héroïne commence dos à la caméra
let demonPlaced = demon === undefined;

/** Pose le démon à ~6 m devant le départ (dans le regard initial), face au joueur, hors troncs et rochers. Faux : sol pas encore chargé. */
function placeDemon(model: AnimatedModel): boolean {
  for (const turn of [0, 0.35, -0.35, 0.7, -0.7]) {
    const ahead = forwardOf(rig.yaw + turn);
    const x = spawn.x + ahead.x * DEMON_DISTANCE_M, z = spawn.z + ahead.z * DEMON_DISTANCE_M;
    const y = ground(x, z);
    if (y === undefined) return false;
    if (vegetationLoaded && overlaps({ x, z }, 1.5, obstacles.near(x, z))) continue;
    model.pivot.position.set(x, y, z);
    model.pivot.rotation.y = headingOf(spawn.x - x, spawn.z - z) ?? 0;
    model.pivot.setEnabled(true);
    creatureColliders.push({ x, z, r: DEMON_RADIUS_M, height: DEMON_HEIGHT_M });
    return true;
  }
  return true; // tout est encombré : il reste caché plutôt que dans un arbre
}
const fps = new FpsMeter(600);
const gpuTimer = new EngineInstrumentation(engine);
gpuTimer.captureGPUFrameTime = true;
let frameDrawCalls = 0;
let panelTimerMs = 0;

// --- Réglages → Graphismes : profil LOW / MEDIUM / HIGH / ULTRA, appliqué à chaud et enregistré ------------------------------
const graphicsPanel = new GraphicsSettingsPanel(document, {
  presets: QUALITY_LEVELS.map((id) => ({ id, ...QUALITY_DESCRIPTIONS[id] })),
  onSelect: (id) => selectPreset(id),
  onReset: () => {
    graphicsPrefs = graphicsStore.reset();
    selectPreset(graphicsPrefs.level, 'réglages par défaut rétablis');
  },
  onClose: () => graphicsPanel.close(),
});
document.body.append(graphicsPanel.element);
graphicsPanel.setActive(QUALITY.level, URL_LEVEL ? 'Profil imposé par l’adresse de la page (non enregistré).' : '');
/** Choix d'un profil : appliqué tout de suite (la ligne d'état s'affiche d'abord : l'application peut prendre un instant), puis enregistré. */
function selectPreset(id: string, note?: string): void {
  if (!isQualityLevel(id)) return;
  const label = QUALITY_DESCRIPTIONS[id].label;
  graphicsPanel.setActive(id, `Application du profil ${label}…`);
  setTimeout(() => {
    graphicsPrefs = { ...graphicsPrefs, level: id };
    const saved = graphicsStore.save(graphicsPrefs);
    applyGraphics(resolveGraphics(id));
    const where = saved ? 'appliqué et enregistré' : 'appliqué (enregistrement impossible : stockage du navigateur indisponible)';
    graphicsPanel.setActive(id, `Profil ${label} ${where}${note ? ` — ${note}` : ''}.`);
  }, 30);
}
byId<HTMLButtonElement>('open-graphics').addEventListener('click', (e) => {
  e.stopPropagation(); // le clic ne doit pas reprendre la partie
  graphicsPanel.open();
});

overlay.addEventListener('click', () => {
  if (!graphicsPanel.isOpen) input.requestPointerLock();
});
canvas.addEventListener('click', () => {
  if (mode !== 'Playing' && !graphicsPanel.isOpen) input.requestPointerLock();
});

function showMode(): void {
  overlay.hidden = mode === 'Playing';
  setTextIfChanged(
    overlayText,
    mode === 'Paused' ? 'Pause — cliquer pour reprendre' : 'Cliquer pour jouer (ZQSD pour marcher, souris pour regarder)',
  );
}
showMode();

// --- Captures automatisées (?capture=1 seulement) : comparer des images à caméra et lumière identiques ----------------------
// L'image est lue juste après scene.render(), dans la même tâche : la toile n'a pas besoin de garder son image (pas de
// preserveDrawingBuffer), et une capture d'écran du navigateur ne peut plus tomber sur une image à moitié dessinée.
interface CaptureHook {
  afterRender(): void;
}
let captureHook: CaptureHook | undefined;
if (params.get('capture') === '1') {
  let pending: { framesLeft: number; resolve: (url: string) => void } | undefined;
  let renderedFrames = 0;
  captureHook = {
    afterRender() {
      renderedFrames++;
      if (pending === undefined || --pending.framesLeft > 0) return;
      const { resolve } = pending;
      pending = undefined;
      resolve(canvas.toDataURL('image/png'));
    },
  };
  Object.assign(window, {
    __spike: {
      /** Image après `frames` images rendues (laisse les effets temporels converger). */
      capture: (frames = 1): Promise<string> => new Promise<string>((resolve) => (pending = { framesLeft: Math.max(1, frames), resolve })),
      setMoment: (name: string): void => {
        const at = MOMENTS[name];
        if (at !== undefined) session.setTimeOfDay(at);
      },
      setWeather: (kind: string | null): void => {
        weatherOverride = kind !== null && (WEATHER_KINDS as readonly string[]).includes(kind) ? (kind as WeatherKind) : undefined;
      },
      setLook: (yaw: number, pitch: number, distance?: number): void => {
        rig = { yaw, pitch, distance: distance ?? rig.distance };
      },
      chunks: (): number => terrain.size,
      setPreset: (level: string): void => {
        if (isQualityLevel(level)) {
          applyGraphics(resolveGraphics(level));
          graphicsPanel.setActive(level, '');
        }
      },
      stats: (): string => {
        const f = fps.stats();
        const c = cover?.stats();
        return (
          `${describeQuality(QUALITY)} · ${f.fps > 0 ? (1000 / f.fps).toFixed(0) : '?'} ms/image · ${frameDrawCalls} appels · ` +
          `${scene.getActiveMeshes().length} maillages actifs${c ? ` · couvre-sol ${c.instances} instances` : ''}`
        );
      },
      /** Images rendues depuis le chargement (le logiciel de rendu compile lentement : on attend qu'elles s'enchaînent). */
      frames: (): number => renderedFrames,
    },
  });
}

engine.runRenderLoop(() => {
  const frameMs = engine.getDeltaTime();
  WIND.timeS = (WIND.timeS + frameMs / 1000) % WIND_LOOP_S;
  fps.record(frameMs);

  const raw = input.sample();
  for (const event of raw.modeEvents) mode = nextMode(mode, event);
  showMode();
  for (const code of raw.pressed) {
    const moment = MOMENT_KEYS[code];
    if (moment !== undefined) session.setTimeOfDay(MOMENTS[moment]!);
    if (code === 'Digit5') session.timeScale = session.timeScale === 1 ? 60 : 1;
    if (code === 'Digit6') weatherOverride = nextWeatherOverride(weatherOverride);
    if (code === 'KeyF') panel.hidden = !panel.hidden;
    if (code === 'KeyO') {
      input.releasePointerLock(); // la souris revient au joueur pour les réglages
      graphicsPanel.open();
    }
  }
  const running = simulationRuns(mode);
  if (running) rig = applyZoom(applyLook(rig, raw.look.dx, raw.look.dy, MOUSE_SENSITIVITY), raw.wheel);

  const keys = raw.keysDown;
  const direction = wishDirection(
    { forward: keys.has('KeyW'), back: keys.has('KeyS'), left: keys.has('KeyA'), right: keys.has('KeyD') },
    rig.yaw,
  );
  const slow = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const alpha = session.frame(
    frameMs,
    running,
    slow ? { dx: direction.dx * SLOW_WALK_FACTOR, dz: direction.dz * SLOW_WALK_FACTOR } : direction,
  );

  // Streaming : plan recalculé seulement au changement de chunk ou de mode ; intégration ≤ N chunks par image.
  const here = session.current;
  if (replan.shouldReplan(here.x, here.z, mode) || forceReplan) {
    forceReplan = false;
    for (const gone of loading.applyPlan(planStreaming(here.x, here.z, loading.loaded, STREAM), here.x, here.z)) {
      terrain.remove(gone.key);
      vegetation.remove(gone.key);
      cover?.remove(gone.key);
    }
  }
  for (const chunk of loading.collect()) {
    terrain.add(chunk.key, chunk.data.cx, chunk.data.cz, chunk.render.mesh);
    vegetation.add(chunk.key, chunk.data.cx, chunk.data.cz, chunk.render.vegetation);
    cover?.add(chunk.key, chunk.data.cx, chunk.data.cz, chunk.render.groundCover);
  }
  // Élagage par secteur de vue (?elagage=0 : sans, pour mesurer) : la végétation hors du champ de la caméra n'est pas dessinée.
  const view = CULL_ENABLED
    ? { sector: viewSectorFor(rig.yaw, camera.fov, engine.getAspectRatio(camera)), x: camera.position.x, z: camera.position.z }
    : undefined;
  vegetation.update(here.x, here.z, view);
  far?.update(here.x, here.z);
  shadowProxies?.update(here.x, here.z);
  cover?.update(here.x, here.z, view);

  // Rendu interpolé entre les deux derniers ticks.
  const shown = session.interpolated(alpha);
  const body = meshPositionForFeet(shown, CAPSULE_MIN_Y);
  capsule.position.set(body.x, body.y, body.z);
  if (heroine) {
    const wish = headingOf(direction.dx, direction.dz);
    if (running && wish !== undefined) heroineHeading = turnToward(heroineHeading, wish, (TURN_RATE_RAD_PER_S * frameMs) / 1000);
    heroine.model.pivot.position.set(shown.x, shown.y, shown.z);
    heroine.model.pivot.rotation.y = heroineHeading;
    heroine.animator.update(frameMs / 1000, running ? horizontalSpeed(session.previous, session.current, 1 / SIM_HZ) : 0);
  }
  if (demon && !demonPlaced) demonPlaced = placeDemon(demon);
  const pose = cameraPose(
    rig,
    { x: shown.x, y: shown.y + EYE_HEIGHT, z: shown.z },
    ground,
    (ax, az, bx, bz) => (vegetationLoaded ? [...obstacles.along(ax, az, bx, bz), ...creatureColliders] : creatureColliders),
  );
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  cameraTarget.set(pose.target.x, pose.target.y, pose.target.z);
  camera.setTarget(cameraTarget);

  const time = timeOfDay(session.elapsedWorldSeconds);
  realClockS += frameMs / 1000;
  const weather = currentWeather(session.elapsedWorldSeconds);
  const atmosphere = atmosphereFor(lightingFor(time), weather, lightningFlash(SEED, realClockS, weather.storm));
  const light = atmosphere.light;
  WIND.strength = WIND_BASE * (WIND_CALM + WIND_GUSTS * atmosphere.wind);
  nightMagic?.update(light, shown.x, shown.y, shown.z);
  if (WIND.sun) {
    WIND.sun.toSun.splice(0, 3, -light.sunDirection.x, -light.sunDirection.y, -light.sunDirection.z);
    WIND.sun.color.splice(0, 3, ...light.sunColor);
    WIND.sun.strength = light.shadowIntensity;
  }
  lighting.apply(atmosphere, time, frameMs / 1000);
  terrain.setWetness(atmosphere.wetness);
  terrain.setRain(atmosphere.rain, realClockS);
  wetSurfaces.apply(atmosphere.wetness);
  far?.setWetness(atmosphere.wetness);
  far?.setHaze(hazeColor(light));
  rain.update({ rain: atmosphere.rain, wind: atmosphere.wind, brightness: sceneBrightness(light) }, camera.position.x, camera.position.y, camera.position.z);
  lensWetness = stepLensWetness(lensWetness, lensRainTarget(atmosphere.rain, rig.pitch), frameMs / 1000);
  skyEnvironment?.update(frameMs / 1000, camera.position.x, camera.position.y, camera.position.z);
  skyEnvironment?.setIntensity(iblIntensityFor(light)); // le reflet du ciel baisse avec le soleil (?ibl=0 : pas de sonde, rien à régler)
  pipeline.update({
    light,
    grade: weatherGrade(gradeFor(light), atmosphere),
    aerial: lighting.aerialState,
    wetness: atmosphere.wetness,
    lensWetness,
    timeS: realClockS,
  });
  const callsBefore = engine._drawCalls.current;
  scene.render();
  frameDrawCalls = engine._drawCalls.current - callsBefore; // le compteur de Babylon cumule : on mesure l'image
  captureHook?.afterRender();

  panelTimerMs += frameMs;
  if (panelTimerMs > 250 && !panel.hidden) {
    panelTimerMs = 0;
    const s = fps.stats();
    // Temps GPU réel d'une image (moyenne) : indépendant de la synchro écran et d'une fenêtre en arrière-plan, il dit ce que coûte la scène.
    const gpuMs = gpuTimer.gpuFrameTimeCounter.lastSecAverage * 1e-6;
    setTextIfChanged(fpsLine, `${s.fps.toFixed(0)} images/s · 1 % low ${s.low1.toFixed(0)}${gpuMs > 0 ? ` · GPU ${gpuMs.toFixed(1)} ms` : ''}`);
    const clock = Math.floor(6 + time.dayFraction * 24) % 24; // lever du jour = 6 h
    setTextIfChanged(
      infoLine,
      `Jour ${time.day} · ${time.phase} · ~${clock} h${session.timeScale > 1 ? ' · cycle ×60' : ''} · ` +
        `${weatherOverride ?? weatherKindAt(SEED, session.elapsedWorldSeconds)}${weatherOverride ? ' (imposée)' : ''} · ` +
        `${terrain.size} chunks · x ${here.x.toFixed(0)} z ${here.z.toFixed(0)}`,
    );
    const c = cover?.stats();
    setTextIfChanged(
      coverLine,
      c === undefined
        ? 'Couvre-sol : coupé (?couvert=0)'
        : `Couvre-sol ${Math.round(cover?.radius ?? 0)} m : ${c.instances} instances · ${(c.triangles / 1e6).toFixed(2)} M triangles · ${c.drawCalls} appels · ` +
            `${frameDrawCalls} appels au total`,
    );
  }
});

window.addEventListener('resize', () => engine.resize());
