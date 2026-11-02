// COMPOSITION ROOT — port of src/spike/scene-main.ts. Assembles the tested bricks (Core: world, physics, session, camera,
// streaming, render data; Runtime: renderers, input, UI) and runs the frame loop. No game rule lives here.
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using JeuSurvie.Atmosphere;
using JeuSurvie.Characters;
using JeuSurvie.Core.App;
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Physics;
using JeuSurvie.Core.RenderData;
using JeuSurvie.Core.Shared;
using JeuSurvie.Core.Storage;
using JeuSurvie.Core.Survival;
using JeuSurvie.Core.World;
using JeuSurvie.InputDevices;
using JeuSurvie.Rendering;
using JeuSurvie.Storage;
using JeuSurvie.UI;
using JeuSurvie.Vegetation;
using JeuSurvie.World;
using UnityEngine;
using UnityEngine.UIElements;
using QualitySettings = JeuSurvie.Core.RenderData.QualitySettings;
using AtmosphereData = JeuSurvie.Core.RenderData.Atmosphere;
using QualityLevel = JeuSurvie.Core.RenderData.QualityLevel;

namespace JeuSurvie.Bootstrap
{
    public sealed class GameBootstrap : MonoBehaviour
    {
        [Tooltip("Same switches as the original page address, e.g. « -seed 12345 -heure nuit -qualite ultra -meteo orage ». Command-line arguments of a build are added to these.")]
        public string launchArguments = "";

        [Tooltip("Folder of the original Babylon assets (assets/models). Empty: StreamingAssets/assets/models, then ../assets/models next to the Unity project.")]
        public string modelsFolder = "";

        // --- Demo settings (scene-main constants)
        private const double UnloadMarginM = Chunk.Size;
        private const int MaxChunks = 520;
        private const int MaxNewChunksPerFrame = 4;
        private static readonly Dictionary<string, double> Moments = new Dictionary<string, double> { { "matin", 0.06 }, { "midi", 0.3 }, { "crepuscule", 0.64 }, { "nuit", 0.85 } };
        private const double WindLoopS = 3600, WindCalm = 0.4, WindGusts = 1.2;
        private const double ShadowMarginM = 40;
        private const double MouseSensitivity = 0.0025, EyeHeight = 1.5;
        private const double HeroineHeightM = 1.7, DemonHeightM = 2.6, DemonDistanceM = 6, DemonRadiusM = 0.9, SlowWalkFactor = 0.3;
        private static readonly Dictionary<string, Color> HeroineTints = new Dictionary<string, Color> { { "MI_Hair_2", new Color(0.42f, 0.24f, 0.13f) } };

        private LaunchOptions options;
        private uint seed;
        private RenderSetup setup;
        private GraphicsPreferencesStore graphicsStore;
        private GraphicsPreferences graphicsPrefs;
        private QualityLevel? urlLevel;
        private Dictionary<QualityOverrideKey, bool> urlOverrides;
        private QualitySettings quality;
        private int? viewOverrideM;
        private int? coverRadiusOverride;
        private bool coverEnabled, farEnabled, iblEnabled, cullEnabled, flatClouds, translucent;
        private double windBase;
        private WeatherKind? weatherOverride;

        private Camera cam;
        private SceneLighting lighting;
        private SkyEnvironment skyEnvironment;
        private RenderPipelineController pipeline;
        private TerrainRenderer terrain;
        private FarTerrainRenderer far;
        private RainRenderer rain;
        private NightMagicRenderer nightMagic;
        private ModelLibrary library;
        private VegetationRenderer vegetation;
        private GroundCoverRenderer cover;
        private bool vegetationLoaded;
        private GameObject capsule;
        private AnimatedModel heroine;
        private RetargetedLocomotion heroineAnimator;
        private AnimatedModel demon;
        private bool demonPlaced = true;
        private readonly List<Circle> creatureColliders = new List<Circle>();

        private ChunkWorkerSource source;
        private ChunkLoading<ChunkPayload> loading;
        private GameSession session;
        private ObstacleIndex obstacles;
        private ReplanGate replan;
        private StreamParams stream;
        private double viewRadiusM, fogDistanceM;
        private (double half, double step)? farGrid;
        private bool forceReplan;
        private Vec2XZ spawn;

        private GameInput input;
        private InputMode mode = InputModes.Initial;
        private GameHud hud;
        private CameraRig rig;
        private double heroineHeading;
        private double windTime, realClockS, lensWetness;
        private readonly FpsMeter fps = new FpsMeter(600);
        private double panelTimerMs;
        private bool ready;
        private string captureDir;

        private static string ArgumentsOf(string text) => text ?? "";

        private void Awake()
        {
            var args = new List<string>(ArgumentsOf(launchArguments).Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries));
            if (!Application.isEditor) args.AddRange(Environment.GetCommandLineArgs().Skip(1));
            options = LaunchOptions.Parse(args);
            seed = options.Seed();
            setup = RenderSetup.Load();
            if (setup == null) Debug.LogWarning("[JeuSurvie] Réglages de rendu absents (menu Jeu Survie → Configurer le projet) : chaîne d'effets réduite.");
            Application.targetFrameRate = -1;
        }

        private IEnumerator Start()
        {
            // --- Preferences and graphics profile (saved one, else HIGH; -qualite imposes it for this run without saving)
            graphicsStore = new GraphicsPreferencesStore(new PlayerPrefsStorage());
            graphicsPrefs = graphicsStore.Load();
            urlLevel = Quality.TryParseLevel(options.Get("qualite"), out QualityLevel l) ? l : (QualityLevel?)null;
            urlOverrides = Quality.OverridesFrom(options.Get);
            flatClouds = options.Off("nuages");
            quality = ResolveGraphics(urlLevel ?? graphicsPrefs.Level);
            viewOverrideM = options.Get("view") == null ? (int?)null : options.ClampInt("view", 192, 1024, 512);
            string coverParam = options.Get("couvert");
            coverEnabled = coverParam != "0";
            coverRadiusOverride = coverParam == null || coverParam == "0" ? (int?)null : options.ClampInt("couvert", 20, 120, (int)GroundCoverInstances.CoverRadiusM);
            farEnabled = !options.Off("lointain");
            iblEnabled = !options.Off("ibl");
            cullEnabled = !options.Off("elagage");
            translucent = !options.Off("translucide");
            windBase = options.Off("vent") ? 0 : 1;
            weatherOverride = Weather.TryParse(options.Get("meteo"), out WeatherKind wk) ? wk : (WeatherKind?)null;
            captureDir = options.Get("capture");

            // --- UI
            hud = CreateHud();
            hud.SetLoading("Préparation du monde…");
            input = new GameInput();

            // --- Scene
            var camGo = new GameObject("Caméra");
            cam = camGo.AddComponent<Camera>();
            cam.nearClipPlane = 0.1f;
            cam.fieldOfView = Mathf.Rad2Deg * 1.0f;
            cam.clearFlags = CameraClearFlags.Skybox;
            camGo.tag = "MainCamera";
            ApplyDistances(quality);
            lighting = new SceneLighting(setup != null ? setup.skyShader : Shader.Find("JeuSurvie/Sky"), fogDistanceM, -6, quality.Sky.Clouds);
            if (iblEnabled) skyEnvironment = new SkyEnvironment(quality.Sky.EnvProbeSize, quality.Sky.EnvProbeRefreshS);
            ToneMappingChoice tone = options.Get("tonemap") == "standard" || options.Get("tonemap") == "neutre" ? ToneMappingChoice.Neutral : ToneMappingChoice.Aces;
            pipeline = new RenderPipelineController(cam, lighting.Sun, setup, tone, !options.Off("post"), !options.Off("gouttes"));
            terrain = new TerrainRenderer(ShaderOf(s => s.terrainShader, "JeuSurvie/Terrain"), ShaderOf(s => s.groundMatterShader, "Hidden/JeuSurvie/GroundMatter"), quality.Terrain);
            rain = new RainRenderer(quality.RainDrops, ShaderOf(s => s.particleShader, "JeuSurvie/Particle"));
            far = CreateFar();

            // --- Vegetation models (-vegetation=0: without)
            string modelsDir = ModelsDirectory();
            library = new ModelLibrary(Path.Combine(modelsDir, "nature"), ShaderOf(s => s.foliageShader, "JeuSurvie/Foliage"), ShaderOf(s => s.naturePbrShader, "JeuSurvie/NaturePBR"));
            vegetation = new VegetationRenderer(library, ProxyRadius(quality));
            vegetation.SetRangeScale(quality.Distances.VegetationRange);
            cover = coverEnabled ? new GroundCoverRenderer(library, coverRadiusOverride ?? quality.Distances.CoverRadiusM, quality.Distances.CoverDensity) : null;
            if (!options.Off("vegetation"))
            {
                hud.SetLoading("Chargement des arbres, des rochers et de l’herbe…");
                var keys = new HashSet<string>(ResourceModels.AllVegetationModels());
                if (cover != null) foreach (var kv in GroundCover.Models) foreach (string k in kv.Value) keys.Add(k);
                Task load = library.LoadAsync(keys);
                yield return new WaitUntil(() => load.IsCompleted);
                vegetationLoaded = load.Status == TaskStatus.RanToCompletion;
                if (!vegetationLoaded) Debug.LogError("Modèles de végétation illisibles : le jeu continue sans. " + load.Exception?.GetBaseException().Message);
            }
            if (!options.Off("magie")) nightMagic = new NightMagicRenderer(ShaderOf(s => s.particleShader, "JeuSurvie/Particle"));
            pipeline.Apply(quality);
            lighting.SetAerialPerspective(quality.Post.AerialPerspective && pipeline.HasAtmosphereFeature);

            // --- Characters: the heroine (hero animations retargeted on her skeleton) and a demon (-personnages=0: without)
            Shader pbr = ShaderOf(s => s.naturePbrShader, "JeuSurvie/NaturePBR");
            capsule = PlayerCapsule.Create(pbr);
            if (!options.Off("personnages"))
            {
                hud.SetLoading("Chargement de l’héroïne et du démon…");
                Task<AnimatedModel> heroineTask = LoadHeroine(modelsDir, pbr);
                Task<AnimatedModel> demonTask = CharacterLoader.LoadAsync(Path.Combine(modelsDir, "creatures", "Demon.gltf"), DemonHeightM, pbr);
                yield return new WaitUntil(() => heroineTask.IsCompleted && demonTask.IsCompleted);
                if (heroineTask.Status == TaskStatus.RanToCompletion) heroine = heroineTask.Result;
                else Debug.LogError("Héroïne illisible : la capsule reste. " + heroineTask.Exception?.GetBaseException().Message);
                if (demonTask.Status == TaskStatus.RanToCompletion)
                {
                    demon = demonTask.Result;
                    if (!CharacterLoader.PlayLoop(demon, "Idle")) Debug.LogError("Le démon n’a pas d’animation Idle.");
                    demon.SetVisible(false); // hidden until the ground under it is loaded
                    demonPlaced = false;
                }
                else Debug.LogError("Démon illisible : la scène continue sans lui. " + demonTask.Exception?.GetBaseException().Message);
            }
            if (heroine != null) capsule.SetActive(false);

            // --- World and session
            int workers = Math.Min(3, Math.Max(1, SystemInfo.processorCount - 1));
            source = new ChunkWorkerSource(seed, workers, coverEnabled && !options.Off("vegetation"));
            loading = new ChunkLoading<ChunkPayload>(source, MaxNewChunksPerFrame);
            if (options.Get("lieu") == "montagne")
            {
                Summit summit = SummitSearch.Find(seed, 6000, 250);
                spawn = new Vec2XZ(summit.X, summit.Z);
            }
            else spawn = new Vec2XZ(options.Coord("x"), options.Coord("z"));
            obstacles = new ObstacleIndex(seed);
            session = new GameSession(spawn.X, spawn.Z, Ground, ObstaclesNear);
            double moment = Moments.TryGetValue(options.Get("heure") ?? "", out double m) ? m : Moments["matin"];
            session.SetTimeOfDay(moment);
            replan = new ReplanGate();
            double yaw = options.Number("regard", 0.6), pitch = options.Number("inclinaison", 0.35);
            rig = new CameraRig(yaw, pitch, 7);
            heroineHeading = rig.Yaw;

            hud.OverlayClicked += () => input.RequestCapture();
            hud.PresetSelected += SelectPreset;
            hud.ResetRequested += () =>
            {
                graphicsPrefs = graphicsStore.Reset();
                SelectPreset(graphicsPrefs.Level, "réglages par défaut rétablis");
            };
            hud.SetActive(quality.Level, urlLevel != null ? "Profil imposé par la ligne de commande (non enregistré)." : "");
            ShowQualityLine();
            ready = true;
            ShowMode();
            if (captureDir != null) StartCoroutine(CaptureRoutine(captureDir));
        }

        private Shader ShaderOf(Func<RenderSetup, Shader> pick, string name)
        {
            Shader s = setup != null ? pick(setup) : null;
            return s != null ? s : Shader.Find(name);
        }

        private GameHud CreateHud()
        {
            // Inactive while configured: the document attaches to its panel only once its settings are set.
            var go = new GameObject("Interface");
            go.SetActive(false);
            var panelSettings = ScriptableObject.CreateInstance<PanelSettings>();
            panelSettings.themeStyleSheet = Resources.Load<ThemeStyleSheet>("UI/JeuSurvieTheme");
            panelSettings.scaleMode = PanelScaleMode.ConstantPhysicalSize;
            var doc = go.AddComponent<UIDocument>();
            doc.panelSettings = panelSettings;
            go.SetActive(true);
            return new GameHud(doc);
        }

        private string ModelsDirectory()
        {
            var candidates = new List<string>();
            if (!string.IsNullOrEmpty(options.Get("assets"))) candidates.Add(options.Get("assets"));
            if (!string.IsNullOrEmpty(modelsFolder)) candidates.Add(modelsFolder);
            candidates.Add(Path.Combine(Application.streamingAssetsPath, "assets", "models"));
            candidates.Add(Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "assets", "models")));
            foreach (string c in candidates) if (Directory.Exists(c)) return c;
            Debug.LogWarning("[JeuSurvie] Dossier des modèles introuvable (copier assets/ du projet Babylon : menu Jeu Survie → Importer les assets) : " + string.Join(" ; ", candidates));
            return candidates[candidates.Count - 2];
        }

        private async Task<AnimatedModel> LoadHeroine(string modelsDir, Shader pbr)
        {
            AnimatedModel hero = await CharacterLoader.LoadAsync(Path.Combine(modelsDir, "characters", "hero.gltf"), HeroineHeightM, pbr, null, false);
            AnimatedModel model = await CharacterLoader.LoadAsync(Path.Combine(modelsDir, "characters", "heroine", "heroine.gltf"), HeroineHeightM, pbr, HeroineTints);
            try
            {
                heroineAnimator = RetargetedLocomotion.Create(hero, model, new[] { "pelvis" });
                if (heroineAnimator.MissingBones.Count > 0) Debug.LogWarning("Os du héros absents de l’héroïne : " + string.Join(", ", heroineAnimator.MissingBones));
            }
            catch (Exception)
            {
                Destroy(model.Pivot.gameObject); // no heroine frozen in T: the capsule stays
                Destroy(hero.Pivot.gameObject);
                throw;
            }
            return model;
        }

        // --- Graphics profile ---------------------------------------------------------------------------------------------

        private QualitySettings ResolveGraphics(QualityLevel level)
        {
            var merged = new Dictionary<QualityOverrideKey, bool>(graphicsPrefs.Overrides.ToDictionary(k => k.Key, k => k.Value));
            foreach (var kv in urlOverrides) merged[kv.Key] = kv.Value;
            QualitySettings q = Quality.Resolve(level, merged);
            if (flatClouds) q.Sky.Clouds = CloudQuality.Flat;
            return q;
        }

        /// <summary>distancesOf: chunk radius, far relief, fog distance, sky, far plane.</summary>
        private void ApplyDistances(QualitySettings q)
        {
            viewRadiusM = Streamer.EffectiveViewRadius(viewOverrideM ?? q.Distances.ViewRadiusM, MaxChunks);
            farGrid = farEnabled && q.Distances.FarTerrain != null ? (q.Distances.FarTerrain.HalfSizeM, q.Distances.FarTerrain.StepM) : ((double, double)?)null;
            double reach = farGrid?.half ?? viewRadiusM;
            fogDistanceM = reach;
            cam.farClipPlane = (float)(farGrid != null ? reach * 1.6 : reach * 3);
            if (stream == null) stream = new StreamParams(viewRadiusM, UnloadMarginM, MaxChunks);
            else stream.ViewRadiusM = viewRadiusM;
        }

        private FarTerrainRenderer CreateFar()
        {
            if (farGrid == null) return null;
            return new FarTerrainRenderer(ShaderOf(s => s.farTerrainShader, "JeuSurvie/FarTerrain"), seed, farGrid.Value.half, farGrid.Value.step, viewRadiusM - Chunk.Size, 500, 2);
        }

        private static double ProxyRadius(QualitySettings q) => q.Shadows != null ? q.Shadows.RangeM + ShadowMarginM : 0;

        /// <summary>applyGraphics: a profile applied live; what costs (ground textures, far relief) is redone only if it changes.</summary>
        private void ApplyGraphics(QualitySettings q)
        {
            QualitySettings before = quality;
            quality = q;
            double oldView = viewRadiusM;
            var oldFar = farGrid;
            ApplyDistances(q);
            if (viewRadiusM != oldView || !Equals(farGrid, oldFar))
            {
                far?.Dispose();
                far = CreateFar();
            }
            forceReplan = true;
            lighting.SetFogDistance(fogDistanceM);
            lighting.SetCloudQuality(q.Sky.Clouds);
            if (iblEnabled && (q.Sky.EnvProbeSize != before.Sky.EnvProbeSize || q.Sky.EnvProbeRefreshS != before.Sky.EnvProbeRefreshS))
            {
                skyEnvironment?.Dispose();
                skyEnvironment = new SkyEnvironment(q.Sky.EnvProbeSize, q.Sky.EnvProbeRefreshS);
            }
            terrain.SetQuality(q.Terrain);
            vegetation.SetRangeScale(q.Distances.VegetationRange);
            vegetation.SetShadowRadius(ProxyRadius(q));
            cover?.SetReach(coverRadiusOverride ?? q.Distances.CoverRadiusM, q.Distances.CoverDensity);
            if (q.RainDrops != before.RainDrops)
            {
                rain.Dispose();
                rain = new RainRenderer(q.RainDrops, ShaderOf(s => s.particleShader, "JeuSurvie/Particle"));
            }
            pipeline.Apply(q);
            lighting.SetAerialPerspective(q.Post.AerialPerspective && pipeline.HasAtmosphereFeature);
            ShowQualityLine();
        }

        private void ShowQualityLine()
        {
            hud.SetSeedLine($"Graine : {seed} · distance de vue : {Math.Round(viewRadiusM)} m · {Quality.DescribeLine(quality)}" +
                (pipeline.MsaaSamples != quality.Image.Msaa && quality.Image.Msaa > 1 ? $" (MSAA {pipeline.MsaaSamples}× sur cette carte)" : ""));
        }

        /// <summary>A profile choice: applied now (the status line first: applying may take a moment), then saved.</summary>
        private void SelectPreset(QualityLevel id) => SelectPreset(id, null);

        private void SelectPreset(QualityLevel id, string note)
        {
            string label = Quality.Describe(id).Label;
            hud.SetActive(id, $"Application du profil {label}…");
            StartCoroutine(ApplyNextFrame(id, label, note));
        }

        private IEnumerator ApplyNextFrame(QualityLevel id, string label, string note)
        {
            yield return null;
            graphicsPrefs = graphicsPrefs.WithLevel(id);
            bool saved = graphicsStore.Save(graphicsPrefs);
            ApplyGraphics(ResolveGraphics(id));
            string where = saved ? "appliqué et enregistré" : "appliqué (enregistrement impossible : stockage indisponible)";
            hud.SetActive(id, $"Profil {label} {where}{(note != null ? " — " + note : "")}.");
        }

        // --- World access for the session ----------------------------------------------------------------------------------

        private double? Ground(double x, double z) => JeuSurvie.Core.Physics.Ground.HeightIn(loading.Chunks, x, z);

        private IReadOnlyList<Circle> ObstaclesNear(double x, double z)
        {
            if (!vegetationLoaded) return creatureColliders;
            List<Circle> list = obstacles.Near(x, z);
            list.AddRange(creatureColliders);
            return list;
        }

        private IReadOnlyList<Circle> ObstaclesAlong(double ax, double az, double bx, double bz)
        {
            if (!vegetationLoaded) return creatureColliders;
            List<Circle> list = obstacles.Along(ax, az, bx, bz);
            list.AddRange(creatureColliders);
            return list;
        }

        /// <summary>Puts the demon ~6 m ahead of the spawn (initial view), facing the player, out of trunks and rocks. False: ground not loaded yet.</summary>
        private bool PlaceDemon(AnimatedModel model)
        {
            foreach (double turn in new[] { 0, 0.35, -0.35, 0.7, -0.7 })
            {
                Vec2XZ ahead = CameraRigs.ForwardOf(rig.Yaw + turn);
                double x = spawn.X + ahead.X * DemonDistanceM, z = spawn.Z + ahead.Z * DemonDistanceM;
                double? y = Ground(x, z);
                if (y == null) return false;
                if (vegetationLoaded && Colliders.Overlaps(x, z, 1.5, obstacles.Near(x, z))) continue;
                model.Pivot.position = new Vector3((float)x, (float)y.Value, (float)z);
                model.Pivot.rotation = Quaternion.Euler(0, (float)((CharacterMotion.HeadingOf(spawn.X - x, spawn.Z - z) ?? 0) * Mathf.Rad2Deg), 0);
                model.SetVisible(true);
                creatureColliders.Add(new Circle(x, z, DemonRadiusM, DemonHeightM));
                return true;
            }
            return true; // everything is cluttered: it stays hidden rather than inside a tree
        }

        private WeatherState CurrentWeather(double worldSeconds) =>
            weatherOverride == null ? Weather.At(seed, worldSeconds) : Weather.Forced(weatherOverride.Value);

        private static WeatherKind? NextWeatherOverride(WeatherKind? current)
        {
            if (current == null) return Weather.Kinds[0];
            int i = Array.IndexOf(Weather.Kinds, current.Value) + 1;
            return i < Weather.Kinds.Length ? Weather.Kinds[i] : (WeatherKind?)null;
        }

        private void ShowMode() => hud.ShowMode(mode == InputMode.Playing, mode == InputMode.Paused);

        private void OnApplicationFocus(bool hasFocus) => input?.OnFocusChanged(hasFocus);

        // --- Frame loop ----------------------------------------------------------------------------------------------------

        private void Update()
        {
            if (!ready) return;
            double frameMs = Time.unscaledDeltaTime * 1000.0;
            windTime = (windTime + frameMs / 1000) % WindLoopS;
            fps.Record(frameMs);

            RawInputFrame raw = input.Sample(hud.SettingsOpen);
            if (raw.ClickedGame && mode != InputMode.Playing && !hud.SettingsOpen) input.RequestCapture();
            foreach (ModeEvent e in raw.ModeEvents) mode = InputModes.Next(mode, e);
            if (raw.ModeEvents.Count > 0) ShowMode();
            foreach (GameKey key in raw.Pressed)
            {
                switch (key)
                {
                    case GameKey.Moment1: session.SetTimeOfDay(Moments["matin"]); break;
                    case GameKey.Moment2: session.SetTimeOfDay(Moments["midi"]); break;
                    case GameKey.Moment3: session.SetTimeOfDay(Moments["crepuscule"]); break;
                    case GameKey.Moment4: session.SetTimeOfDay(Moments["nuit"]); break;
                    case GameKey.CycleSpeed: session.TimeScale = session.TimeScale == 1 ? 60 : 1; break;
                    case GameKey.Weather: weatherOverride = NextWeatherOverride(weatherOverride); break;
                    case GameKey.TogglePanel: hud.TogglePanel(); break;
                    case GameKey.OpenSettings:
                        input.ReleaseCapture(); // the mouse goes back to the player for the settings
                        hud.OpenSettings();
                        break;
                }
            }
            bool running = InputModes.SimulationRuns(mode);
            if (running) rig = CameraRigs.ApplyZoom(CameraRigs.ApplyLook(rig, raw.LookDx, raw.LookDy, MouseSensitivity), raw.Wheel);

            Vec2XZ direction = CameraRigs.WishDirection(raw.Down.Contains(GameKey.Forward), raw.Down.Contains(GameKey.Back), raw.Down.Contains(GameKey.Left), raw.Down.Contains(GameKey.Right), rig.Yaw);
            bool slow = raw.Down.Contains(GameKey.Slow);
            double alpha = session.Frame(frameMs, running, slow ? direction.X * SlowWalkFactor : direction.X, slow ? direction.Z * SlowWalkFactor : direction.Z);

            // Streaming: plan recomputed only on chunk or mode change; at most N chunks integrated per frame.
            Vec3 here = session.Current;
            if (replan.ShouldReplan(here.X, here.Z, mode) || forceReplan)
            {
                forceReplan = false;
                foreach (UnloadedChunk gone in loading.ApplyPlan(Streamer.Plan(here.X, here.Z, loading.Loaded, stream), here.X, here.Z))
                {
                    terrain.Remove(gone.Key);
                    vegetation.Remove(gone.Key);
                    cover?.Remove(gone.Key);
                }
            }
            foreach (LoadedChunk<ChunkPayload> chunk in loading.Collect())
            {
                terrain.Add(chunk.Key, chunk.Data.Cx, chunk.Data.Cz, chunk.Render.Mesh);
                vegetation.Add(chunk.Key, chunk.Data.Cx, chunk.Data.Cz, chunk.Render.Vegetation);
                cover?.Add(chunk.Key, chunk.Data.Cx, chunk.Data.Cz, chunk.Render.GroundCover);
            }

            // Rendering interpolated between the last two ticks.
            Vec3 shown = session.Interpolated(alpha);
            capsule.transform.position = new Vector3((float)shown.X, (float)(shown.Y - PlayerCapsule.MinY), (float)shown.Z);
            if (heroine != null)
            {
                double? wish = CharacterMotion.HeadingOf(direction.X, direction.Z);
                if (running && wish != null) heroineHeading = CharacterMotion.TurnToward(heroineHeading, wish.Value, CharacterMotion.TurnRateRadPerS * frameMs / 1000);
                heroine.Pivot.position = new Vector3((float)shown.X, (float)shown.Y, (float)shown.Z);
                heroine.Pivot.rotation = Quaternion.Euler(0, (float)(heroineHeading * Mathf.Rad2Deg), 0);
                heroineAnimator?.UpdateLocomotion(frameMs / 1000, running ? CharacterMotion.HorizontalSpeed(session.Previous, session.Current, 1.0 / Balance.SimHz) : 0);
            }
            if (demon != null && !demonPlaced) demonPlaced = PlaceDemon(demon);
            CameraPose pose = CameraRigs.Pose(rig, new Vec3(shown.X, shown.Y + EyeHeight, shown.Z), Ground, ObstaclesAlong);
            cam.transform.position = new Vector3((float)pose.Position.X, (float)pose.Position.Y, (float)pose.Position.Z);
            cam.transform.LookAt(new Vector3((float)pose.Target.X, (float)pose.Target.Y, (float)pose.Target.Z), Vector3.up);

            // View-sector culling (-elagage=0: without): vegetation out of the camera field is not drawn.
            ViewCull? view = cullEnabled ? new ViewCull(ViewSectors.For(rig.Yaw, cam.fieldOfView * Mathf.Deg2Rad, cam.aspect), cam.transform.position.x, cam.transform.position.z) : (ViewCull?)null;
            vegetation.Update(here.X, here.Z, view);
            far?.Update(here.X, here.Z);
            cover?.Update(here.X, here.Z, view);

            // Hour, weather, atmosphere.
            TimeOfDay time = TimeOfDay.From(session.ElapsedWorldSeconds);
            realClockS += frameMs / 1000;
            WeatherState weather = CurrentWeather(session.ElapsedWorldSeconds);
            AtmosphereData atmosphere = Atmospheres.For(Lights.For(time), weather, Atmospheres.LightningFlash(seed, realClockS, weather.Storm));
            Lighting light = atmosphere.Light;
            double windStrength = windBase * (WindCalm + WindGusts * atmosphere.Wind);
            Shader.SetGlobalVector(ShaderGlobals.Wind, new Vector4((float)windTime, (float)windStrength, 0, 0));
            nightMagic?.Update(light, new Vector3((float)shown.X, (float)shown.Y, (float)shown.Z));
            lighting.Apply(atmosphere, time, frameMs / 1000, cam);
            Shader.SetGlobalVector(ShaderGlobals.SunToward, new Vector4((float)-light.SunDirection.X, (float)-light.SunDirection.Y, (float)-light.SunDirection.Z, translucent ? (float)light.ShadowIntensity : 0f));
            Shader.SetGlobalVector(ShaderGlobals.Wet, new Vector4((float)atmosphere.Wetness, (float)atmosphere.Rain, (float)(realClockS % 600.0), 0));
            far?.SetWetness(atmosphere.Wetness);
            rain.Update(atmosphere.Rain, atmosphere.Wind, Atmospheres.SceneBrightness(light), cam.transform.position);
            lensWetness = LensDrops.Step(lensWetness, LensDrops.RainTarget(atmosphere.Rain, rig.Pitch), frameMs / 1000);
            skyEnvironment?.Update(frameMs / 1000, cam.transform.position);
            skyEnvironment?.SetIntensity(Surfaces.IblIntensityFor(light));
            pipeline.UpdateFrame(new RenderFrameState
            {
                Light = light,
                Grade = Atmospheres.WeatherGrade(Atmospheres.GradeFor(light), atmosphere),
                Aerial = lighting.Air,
                Wetness = atmosphere.Wetness,
                LensWetness = lensWetness,
                TimeS = realClockS,
            });

            panelTimerMs += frameMs;
            if (panelTimerMs > 250 && hud.PanelVisible)
            {
                panelTimerMs = 0;
                var s = fps.Stats();
                string gpu = GpuFrameMs(out double gpuMs) ? $" · GPU {gpuMs:0.0} ms" : "";
                int clock = (int)Math.Floor(6 + time.DayFraction * 24) % 24;
                string weatherName = weatherOverride != null ? Weather.IdOf(weatherOverride.Value) + " (imposée)" : Weather.IdOf(Weather.KindAt(seed, session.ElapsedWorldSeconds));
                string coverLine = "Couvre-sol : coupé (-couvert=0)";
                if (cover != null)
                {
                    var c = cover.Stats();
                    coverLine = $"Couvre-sol {Math.Round(cover.Radius)} m : {c.instances} instances · {c.triangles / 1e6:0.00} M triangles · {c.drawCalls} appels{DrawCallsSuffix()}";
                }
                hud.SetPanel($"{s.fps:0} images/s · 1 % low {s.low1:0}{gpu}",
                    $"Jour {time.Day} · {TimeOfDay.PhaseLabel(time.Phase)} · ~{clock} h{(session.TimeScale > 1 ? " · cycle ×60" : "")} · {weatherName} · {terrain.Size} chunks · x {here.X:0} z {here.Z:0}",
                    coverLine);
            }
        }

        private static readonly UnityEngine.FrameTiming[] Timings = new UnityEngine.FrameTiming[1];

        /// <summary>Real GPU time of a frame (FrameTimingManager), independent of vsync: what the scene costs.</summary>
        private static bool GpuFrameMs(out double ms)
        {
            ms = 0;
            FrameTimingManager.CaptureFrameTimings();
            if (FrameTimingManager.GetLatestTimings(1, Timings) < 1) return false;
            ms = Timings[0].gpuFrameTime;
            return ms > 0;
        }

        private static string DrawCallsSuffix()
        {
#if UNITY_EDITOR
            return $" · {UnityEditor.UnityStats.drawCalls} appels au total";
#else
            return "";
#endif
        }

        /// <summary>
        /// Automated captures (-capture &lt;folder&gt;, the ?capture=1 hook of the original): once the world is loaded, one image per
        /// moment of the day, for comparisons with identical camera and light; then the game quits.
        /// </summary>
        private IEnumerator CaptureRoutine(string dir)
        {
            Directory.CreateDirectory(dir);
            input.RequestCapture();
            float started = Time.realtimeSinceStartup;
            yield return new WaitUntil(() => (loading.PendingCount == 0 && terrain.Size > 20) || Time.realtimeSinceStartup - started > 60);
            foreach (string momentName in new[] { "matin", "midi", "crepuscule", "nuit" })
            {
                session.SetTimeOfDay(Moments[momentName]);
                for (int i = 0; i < 30; i++) yield return null;
                yield return new WaitForEndOfFrame();
                ScreenCapture.CaptureScreenshot(Path.Combine(dir, $"{momentName}-{Quality.Id(quality.Level)}.png"));
                yield return null;
            }
            Application.Quit();
        }

        private void OnDestroy()
        {
            source?.Dispose();
            if (input != null && input.Captured) input.ReleaseCapture();
        }

        /// <summary>Pressing Play in any scene starts the game: the bootstrap creates itself if the scene does not hold one.</summary>
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void EnsureBootstrap()
        {
            if (FindFirstObjectByType<GameBootstrap>() != null) return;
            new GameObject("Jeu Survie").AddComponent<GameBootstrap>();
        }
    }
}
