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
import { createAmbientOcclusion } from '../adapters/babylon/ambient-occlusion';
import { applyGrade, createPostProcessing, enableMsaa, parseToneMapping } from '../adapters/babylon/post-processing';
import { LensDrops } from '../adapters/babylon/lens-drops';
import { WetSurfaces } from '../adapters/babylon/wet-surfaces';
import { RainRenderer } from '../adapters/babylon/rain-renderer';
import { SunRays } from '../adapters/babylon/sun-rays';
import { LocomotionAnimator } from '../adapters/babylon/locomotion-animator';
import { ShadowProxies } from '../adapters/babylon/shadow-proxies';
import { SunShadows } from '../adapters/babylon/sun-shadows';
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
import { describeQuality, parseQuality } from '../adapters/render-data/quality';
import { COVER_RADIUS_M } from '../adapters/render-data/ground-cover-instances';
import { SHADOW_CASTER_MODELS } from '../adapters/render-data/shadow-casters';
import { VEGETATION_MODELS } from '../adapters/render-data/vegetation-instances';
import { createChunkWorker } from '../adapters/worker/create-chunk-workers';
import { WorkerChunkSource } from '../adapters/worker/worker-chunk-source';
import { setTextIfChanged } from '../ui/dom/set-if-changed';

// --- Réglages de la démo (lus dans l'adresse : ?seed=123&view=512&heure=nuit&x=-3500&z=-2000) ----------------
const params = new URLSearchParams(location.search);
const SEED = parseSeed(params.get('seed'));
const STREAM = { viewRadiusM: clampInt(params.get('view'), 192, 1024, 512), unloadMarginM: CHUNK_SIZE, maxChunks: 400 };
const VIEW_RADIUS_M = effectiveViewRadius(STREAM.viewRadiusM, STREAM.maxChunks);
/** Moments de la journée (fraction du cycle) : touches 1 à 4, ou ?heure=matin|midi|crepuscule|nuit. */
const MOMENTS: Readonly<Record<string, number>> = { matin: 0.06, midi: 0.3, crepuscule: 0.64, nuit: 0.85 };
const MOMENT_KEYS: Readonly<Record<string, string>> = { Digit1: 'matin', Digit2: 'midi', Digit3: 'crepuscule', Digit4: 'nuit' };
/** ?couvert=0 : sans couvre-sol (herbe, fleurs, cailloux…) ; ?couvert=<m> : rayon de rendu en mètres (défaut COVER_RADIUS_M). */
const COVER_PARAM = params.get('couvert');
const COVER_ENABLED = COVER_PARAM !== '0';
const COVER_RADIUS = clampInt(COVER_PARAM, 20, 120, COVER_RADIUS_M);
/** ?qualite=basse|moyenne|haute (défaut haute) et interrupteurs ?ombres=0 ?ao=0 ?rayons=0 ?nuages=0 : voir render-data/quality. */
const QUALITY = parseQuality((name) => params.get(name));
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
setTextIfChanged(byId('seed'), `Graine : ${SEED} · distance de vue : ${Math.round(VIEW_RADIUS_M)} m · ${describeQuality(QUALITY)}`);

// --- Scène ---------------------------------------------------------------------------------------------------
// Brume des matériaux PBR (personnages, roches) identique à celle du sol : AVANT le premier matériau compilé.
installPbrFog();
const engine = createEngine(canvas, QUALITY.image.maxPixelRatio);
const scene = new Scene(engine);
scene.skipPointerMovePicking = true;
const camera = new FreeCamera('camera', new Vector3(0, 30, -10), scene);
camera.minZ = 0.1;
// Relief lointain (?lointain=0 : sans) : le vrai terrain, grossier, jusqu'à FAR_HALF_SIZE_M autour du joueur, au-delà des chunks.
const FAR_ENABLED = params.get('lointain') !== '0';
const FAR_HALF_SIZE_M = 4000;
const FAR_STEP_M = 40;
camera.maxZ = FAR_ENABLED ? FAR_HALF_SIZE_M * 1.6 : VIEW_RADIUS_M * 3;
camera.fov = 1.0;
const lighting = new SceneLighting(scene, {
  viewRadiusM: VIEW_RADIUS_M,
  fogDistanceFraction: 1,
  heightFogBaseY: -6,
  domeSegments: 32,
  // Avec le relief lointain, la brume se règle sur les kilomètres visibles : le proche reste net, les chaînes pâlissent au loin.
  ...(FAR_ENABLED ? { fogDistanceM: FAR_HALF_SIZE_M, skyRadiusM: FAR_HALF_SIZE_M * 1.45 } : {}),
  clouds: QUALITY.clouds,
});
// Éclairage d'environnement (IBL) des matériaux PBR, tiré du ciel de l'heure (?ibl=0 : sans).
const skyEnvironment = params.get('ibl') !== '0' ? new SkyEnvironment(scene, lighting.sky.mesh, { size: 128, refreshS: 0.5 }) : undefined;
// Occlusion ambiante (?ao=0 : sans) AVANT l'étalonnage : elle s'applique à l'image brute. ?post=0 : sans étalonnage (pour comparer
// l'aspect et mesurer son coût).
if (QUALITY.ao) createAmbientOcclusion(scene, camera, QUALITY.ao);
// Rayons de soleil (?rayons=0 : sans), aussi avant l'étalonnage. Ils ne tiennent compte que du décor PROCHE (les « doubles » de
// shadow-proxies), du terrain et des personnages : ni le ciel, ni l'herbe, ni les arbres lointains (trop chers pour des rais
// qu'on ne distingue pas). `notOccluders` se remplit au chargement des modèles.
const notOccluders = new Set<AbstractMesh>();
const rays = QUALITY.rays ? new SunRays(scene, camera, QUALITY.rays, (mesh) => mesh !== lighting.sky.mesh && !notOccluders.has(mesh)) : undefined;
// ?tonemap=standard|neutre : autre « développement » de l'image, pour comparer à ACES (défaut).
const grading = params.get('post') !== '0' ? createPostProcessing(scene, camera, { toneMapping: parseToneMapping(params.get('tonemap')) }) : undefined;
// Gouttes sur l'objectif quand il pleut (?gouttes=0 : sans) : dernière passe de l'image, accrochée seulement s'il y a des gouttes.
const lensDrops = params.get('gouttes') !== '0' ? new LensDrops(scene, camera, grading) : undefined;
let lensWetness = 0;
// Roches, écorces, personnages : plus sombres et luisants sous la pluie.
const wetSurfaces = new WetSurfaces(scene);
// MSAA de l'image de la scène (?aa=0 : sans) : bords des objets, des brins et des feuilles lissés.
enableMsaa({ prePassRenderer: scene.prePassRenderer, pipeline: grading }, QUALITY.image.msaa);
const terrain = new TerrainRenderer(scene);
// Pluie autour de la caméra (nombre de gouttes selon la qualité ; ?pluie=0 : aucune).
const rain = new RainRenderer(scene, QUALITY.rainDrops);
lighting.addHeightFog(terrain.material);
const far = FAR_ENABLED
  ? new FarTerrainRenderer(
      scene,
      SEED,
      { halfSizeM: FAR_HALF_SIZE_M, stepM: FAR_STEP_M, innerRadiusM: VIEW_RADIUS_M - CHUNK_SIZE, recenterM: 500, sinkM: 2 },
      createFarTerrainWorker(),
    )
  : undefined;
if (far) lighting.addHeightFog(far.material);
// Végétation : modèles glTF chargés une fois (?vegetation=0 : sans, pour comparer la fluidité).
const library = new AssetLibrary(scene, '/assets/models/nature/', WIND);
const vegetation = new VegetationRenderer(library);
// Couvre-sol : herbe, trèfles, fleurs, fougères, champignons, cailloux autour du joueur (purement visuel, sans collision).
const cover = COVER_ENABLED ? new GroundCoverRenderer(library, { radiusM: COVER_RADIUS }) : undefined;
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
// Ombres en cascade du soleil (?ombres=0 : sans, pour mesurer leur coût) : le décor PROCHE et les personnages projettent ; le sol,
// le couvre-sol, le décor et les personnages reçoivent. L'herbe ne projette pas (render-data/shadow-casters). Le décor proche
// projette par des « doubles » qui ne portent que les instances à portée d'ombre (adapters/babylon/shadow-proxies).
// Nuit fantasy (?magie=0 : sans) : lucioles autour du joueur, champignons qui luisent.
const nightMagic = params.get('magie') !== '0' ? new NightMagicRenderer(scene, glowingMaterials(scene.materials)) : undefined;
const shadows = QUALITY.shadows ? new SunShadows(lighting.sun, camera, QUALITY.shadows) : undefined;
let shadowProxies: ShadowProxies | undefined;
if (vegetationLoaded) {
  for (const key of new Set([...Object.values(VEGETATION_MODELS).flat(), ...(cover ? Object.values(GROUND_COVER_MODELS).flat() : [])])) {
    for (const part of library.partsOf(key)) {
      shadows?.addReceiver(part);
      notOccluders.add(part); // les gros blocs (jusqu'à 600 m) ne cachent rien : seuls les doubles proches comptent
    }
  }
  if (shadows || rays) {
    const radiusM = (QUALITY.shadows?.rangeM ?? 0) + SHADOW_MARGIN_M + (QUALITY.shadows ? 0 : RAYS_OCCLUDER_RADIUS_M);
    shadowProxies = new ShadowProxies(library, vegetation, SHADOW_CASTER_MODELS, { radiusM, stepM: 8 }, (proxy) => shadows?.addCaster(proxy));
  }
}
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
else shadows?.addCaster(capsule);
for (const model of [heroine?.model, demon]) {
  for (const mesh of model?.meshes ?? []) {
    shadows?.addCaster(mesh);
    shadows?.addReceiver(mesh);
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

overlay.addEventListener('click', () => input.requestPointerLock());
canvas.addEventListener('click', () => {
  if (mode !== 'Playing') input.requestPointerLock();
});

function showMode(): void {
  overlay.hidden = mode === 'Playing';
  setTextIfChanged(
    overlayText,
    mode === 'Paused' ? 'Pause — cliquer pour reprendre' : 'Cliquer pour jouer (ZQSD pour marcher, souris pour regarder)',
  );
}
showMode();

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
  if (replan.shouldReplan(here.x, here.z, mode)) {
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
  vegetation.update(here.x, here.z);
  far?.update(here.x, here.z);
  shadowProxies?.update(here.x, here.z);
  cover?.update(here.x, here.z);

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
  terrain.setSkyReflection(hazeColor(light), light.skyZenith, atmosphere.rain, realClockS);
  wetSurfaces.apply(atmosphere.wetness);
  far?.setWetness(atmosphere.wetness);
  rain.update({ rain: atmosphere.rain, wind: atmosphere.wind, brightness: sceneBrightness(light) }, camera.position.x, camera.position.y, camera.position.z);
  lensWetness = stepLensWetness(lensWetness, lensRainTarget(atmosphere.rain, rig.pitch), frameMs / 1000);
  lensDrops?.update(lensWetness, realClockS);
  skyEnvironment?.update(frameMs / 1000, camera.position.x, camera.position.y, camera.position.z);
  skyEnvironment?.setIntensity(iblIntensityFor(light)); // le reflet du ciel baisse avec le soleil (?ibl=0 : pas de sonde, rien à régler)
  shadows?.update(light);
  rays?.update(light);
  if (grading) applyGrade(grading, weatherGrade(gradeFor(light), atmosphere));
  const callsBefore = engine._drawCalls.current;
  scene.render();
  frameDrawCalls = engine._drawCalls.current - callsBefore; // le compteur de Babylon cumule : on mesure l'image

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
        : `Couvre-sol ${COVER_RADIUS} m : ${c.instances} instances · ${(c.triangles / 1e6).toFixed(2)} M triangles · ${c.drawCalls} appels · ` +
            `${frameDrawCalls} appels au total`,
    );
  }
});

window.addEventListener('resize', () => engine.resize());
