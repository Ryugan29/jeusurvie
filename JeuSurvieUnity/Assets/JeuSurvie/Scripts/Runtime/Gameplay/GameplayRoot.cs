// Composition of the harvest in the running game (sub-root of GameBootstrap): it keeps the gameplay state, feeds it the
// player's intentions each frame, applies the inventory window's commands, makes things grow back, saves, and turns what
// happened into pictures, sounds and messages. No game rule here: the rules are Core/Gameplay.
using System;
using System.Collections.Generic;
using JeuSurvie.Characters;
using JeuSurvie.Core.App;
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Gameplay;
using JeuSurvie.Core.Physics;
using JeuSurvie.Core.RenderData;
using JeuSurvie.Core.Shared;
using JeuSurvie.Core.Storage;
using JeuSurvie.Core.World;
using JeuSurvie.InputDevices;
using JeuSurvie.UI;
using JeuSurvie.Vegetation;
using UnityEngine;

namespace JeuSurvie.Gameplay
{
    /// <summary>What the gameplay needs from the scene (set once the models and the interface exist).</summary>
    public sealed class GameplayScene
    {
        public GameHud Hud;
        public VegetationRenderer Vegetation;
        public ModelLibrary Nature, Objects;
        public AnimatedModel Heroine;
        /// <summary>The heroine's own clips (ClipLibrary): the gestures are played on her.</summary>
        public IReadOnlyDictionary<string, ClipInfo> Clips;
        public Shader ParticleShader;
    }

    public readonly struct FrameInfo
    {
        public readonly double DtS;
        public readonly long PlayTicks;
        public readonly Vec3 Player;
        public readonly double CameraYaw, Heading;
        public readonly RawInputFrame Raw;
        public readonly InputMode Mode;
        public readonly bool Moving;
        public readonly ViewCull? View;

        public FrameInfo(double dtS, long playTicks, Vec3 player, double cameraYaw, double heading, RawInputFrame raw, InputMode mode, bool moving, ViewCull? view)
        {
            DtS = dtS; PlayTicks = playTicks; Player = player; CameraYaw = cameraYaw; Heading = heading; Raw = raw; Mode = mode; Moving = moving; View = view;
        }
    }

    public sealed class GameplayRoot
    {
        private const double AutosaveS = 60, RegrowCheckS = 1, WobbleS = 0.35;

        public readonly CampSite Camp;
        public readonly HarvestWorld World;
        public GameplayState State { get; private set; }
        public string SaveNote { get; private set; }

        private readonly uint seed;
        private readonly ISaveStore store;
        private readonly bool saveAllowed;
        private readonly HashSet<string> dirtyChunks = new HashSet<string>();
        private readonly Dictionary<long, (double until, Vector3 from)> wobbles = new Dictionary<long, (double, Vector3)>();
        private readonly List<Circle> creatures;
        private GameplayScene scene;
        private WorldVisuals visuals;
        private GameplayHud ui;
        private HarvestFx fx;
        private GameAudio sound;
        private ToolInHand tool;
        private GestureLayer gestures;
        private double clockS, saveTimerS, regrowTimerS;
        private bool dirty;
        private long lastTicks;
        private Vec3 lastPlayer;
        private double lastHeading, lastWorldTicksForSave;

        private GameplayRoot(uint seed, CampSite camp, ISaveStore store, bool saveAllowed, List<Circle> creatures, Func<double, double, double?> ground)
        {
            this.seed = seed;
            Camp = camp;
            this.store = store;
            this.saveAllowed = saveAllowed;
            this.creatures = creatures;
            World = new HarvestWorld(seed, ground, Others);
        }

        /// <summary>
        /// Before the session exists: finds the camp and loads the save (its position and clocks are returned so the session
        /// starts where the player left). `store` null: a new game that is never saved.
        /// </summary>
        public static GameplayRoot Begin(uint seed, double spawnX, double spawnZ, double yaw, ISaveStore store, List<Circle> creatures,
            Func<double, double, double?> ground, out SaveData loaded)
        {
            LoadResult r = store == null ? new LoadResult(null, null, Array.Empty<string>()) : SaveService.Load(store, seed);
            // The camp of a saved game stays where it was, whatever the start options of this run.
            CampSite camp = r.Data?.Camp ?? CampSite.Find(seed, spawnX, spawnZ, yaw);
            // A save of another world or of a newer game is never written over: this run is then not saved.
            var root = new GameplayRoot(seed, camp, store ?? new MemorySaveStore(), store != null && r.MaySaveOver, creatures, ground);
            loaded = r.Data;
            root.State = r.Data != null ? r.Data.State : GameplayState.Initial(camp, (x, z) => Terrain.HeightAt(seed, x, z));
            root.lastPlayer = r.Data != null ? new Vec3(r.Data.X, r.Data.Y, r.Data.Z) : new Vec3(spawnX, Terrain.HeightAt(seed, spawnX, spawnZ), spawnZ);
            root.lastHeading = r.Data?.Heading ?? yaw;
            root.lastTicks = r.Data?.PlayTicks ?? 0;
            root.lastWorldTicksForSave = r.Data?.WorldTicks ?? 0;
            if (!root.saveAllowed && store != null) r = new LoadResult(r.Data, (r.Refusal ?? "") + " — cette partie ne sera pas enregistrée", r.Repairs, r.Kind);
            var notes = new List<string>(r.Repairs);
            if (r.Refusal != null) notes.Add(r.Refusal);
            root.SaveNote = notes.Count > 0 ? string.Join(" · ", notes) : null;
            if (r.Refusal != null) Debug.LogWarning("[JeuSurvie] Sauvegarde : " + r.Refusal);
            foreach (string note in r.Repairs) Debug.LogWarning("[JeuSurvie] Sauvegarde réparée : " + note);
            return root;
        }

        public void AttachScene(GameplayScene s)
        {
            scene = s;
            visuals = new WorldVisuals(s.Nature, s.Objects, World.GroundAt);
            ui = new GameplayHud(s.Hud.Root);
            ui.CommandIssued += c => Apply(c);
            fx = new HarvestFx(s.ParticleShader);
            sound = new GameAudio();
            if (s.Heroine != null) tool = new ToolInHand(s.Heroine, s.Objects);
            if (s.Heroine != null && s.Clips != null)
            {
                gestures = new GestureLayer(s.Heroine, s.Clips);
                if (tool != null) HandIk.Attach(s.Heroine, tool, gestures);
            }
            if (SaveNote != null) ui.Toast(SaveNote, ToastKind.Warning);
        }

        public bool InventoryOpen => ui != null && ui.InventoryOpen;

        public void SetBrightness(double b) => fx?.SetBrightness(b);

        public void OpenInventory() => ui?.OpenInventory();
        public void CloseInventory() => ui?.CloseInventory();

        // --- chunks --------------------------------------------------------------------------------------------------------

        /// <summary>A chunk arrives: remembered, and returned as the overlay shows it (what was cut is not drawn).</summary>
        public Dictionary<string, float[]> Track(string key, int cx, int cz, Dictionary<string, float[]> vegetation, List<Harvestable> nodes)
        {
            World.Track(key, cx, cz, vegetation, nodes);
            return World.Effective(key, State.World, lastTicks, Hidden());
        }

        public void Untrack(string key) => World.Untrack(key);

        private HashSet<long> Hidden()
        {
            var hidden = new HashSet<long>(wobbles.Keys);
            foreach (var kv in State.World.Entries) if (kv.Value.Phase == NodePhase.Regrowing) hidden.Add(kv.Key.Pack());
            return hidden;
        }

        private void MarkChunkOf(NodeId id)
        {
            if (World.ChunkOf(id, out string key, out _, out _)) dirtyChunks.Add(key);
        }

        private void RefreshChunks()
        {
            if (dirtyChunks.Count == 0 || scene?.Vegetation == null) return;
            HashSet<long> hidden = Hidden();
            foreach (string key in dirtyChunks)
            {
                if (!World.Tracked(key)) continue;
                var (cx, cz) = World.CoordsOf(key);
                scene.Vegetation.Add(key, cx, cz, World.Effective(key, State.World, lastTicks, hidden));
            }
            dirtyChunks.Clear();
        }

        // --- obstacles -----------------------------------------------------------------------------------------------------

        public void AdjustObstacles(List<Circle> circles, double x0, double z0, double x1, double z1)
        {
            World.AdjustObstacles(circles, x0, z0, x1, z1, State.World, lastTicks);
            if (Camp.Bench.Collider != null) circles.Add(Camp.Bench.Collider.Value);
        }

        private List<Circle> Others(double x, double z, double radius)
        {
            var list = new List<Circle>(creatures);
            if (Camp.Bench.Collider != null) list.Add(Camp.Bench.Collider.Value);
            return list;
        }

        // --- frame ---------------------------------------------------------------------------------------------------------

        /// <summary>Heading the heroine must face (toward what she works), or null to keep walking freely.</summary>
        public double? FaceHeading { get; private set; }

        /// <summary>A tool is in her hand (her walk and run then carry it).</summary>
        public bool HoldingTool => State?.Items.EquippedStack != null;

        public void Frame(FrameInfo f)
        {
            clockS += f.DtS;
            lastTicks = f.PlayTicks;
            lastPlayer = f.Player;
            lastHeading = f.Heading;
            bool running = InputModes.SimulationRuns(f.Mode);
            var events = new List<GameplayEvent>();
            if (running)
            {
                bool allowed = InputModes.WorldActionsAllowed(f.Mode) && !InventoryOpen; // two guards: the mode and the open bag
                var input = new GameplayInput(f.Player, f.CameraYaw, allowed && f.Raw.UseHeld,
                    allowed && f.Raw.Pressed.Contains(GameKey.Gather), f.Moving, f.Raw.HotbarPressed(), allowed);
                Commit(GameplaySimulation.Step(State, input, World, f.PlayTicks, f.DtS), events);
                regrowTimerS += f.DtS;
                if (regrowTimerS >= RegrowCheckS)
                {
                    regrowTimerS = 0;
                    Commit(GameplaySimulation.Regrow(State, World, f.PlayTicks, f.Player.X, f.Player.Z, f.View), events);
                }
            }
            React(events);
            ExpireWobbles();
            RefreshChunks();
            ActionState a = State.Action;
            FaceHeading = a.Phase == ActionPhase.Idle ? (double?)null : Math.Atan2(a.Swing.Target.X - f.Player.X, a.Swing.Target.Z - f.Player.Z);
            gestures?.Show(a.Phase == ActionPhase.Idle ? (Gesture?)null : a.Swing.Target.Gesture, a.Normalized, State.Items.EquippedStack != null, f.DtS);
            tool?.Show(State.Items.EquippedStack?.ItemId);
            visuals?.Draw(State, World, f.PlayTicks, wobbles, clockS, f.DtS, f.Player);
            ui?.Render(State, running && InputModes.WorldActionsAllowed(f.Mode));
            if (dirty)
            {
                saveTimerS += f.DtS;
                if (saveTimerS >= AutosaveS) SaveNow("automatique");
            }
        }

        private void Commit(StepResult r, List<GameplayEvent> events)
        {
            if (r.Next.Items != State.Items || r.Next.World != State.World || r.Next.Loot != State.Loot) dirty = true;
            State = r.Next;
            events.AddRange(r.Events);
        }

        private void Apply(InventoryCommand c)
        {
            var events = new List<GameplayEvent>();
            Commit(GameplaySimulation.Apply(State, c, World, lastPlayer, lastHeading), events);
            React(events);
        }

        private void React(List<GameplayEvent> events)
        {
            foreach (GameplayEvent e in events)
            {
                var at = new Vector3((float)e.X, (float)e.Y, (float)e.Z);
                switch (e.Type)
                {
                    case GameplayEventType.SwingStarted:
                        sound?.Play(Cue.Whoosh, at);
                        break;
                    case GameplayEventType.Impact:
                        fx?.Impact(e.Kind, at, new Vector3((float)lastPlayer.X, at.y, (float)lastPlayer.Z));
                        sound?.Play(GameAudio.ImpactOf(e.Kind), at);
                        if (e.Kind != HarvestKind.Soil) StartWobble(e.Node);
                        break;
                    case GameplayEventType.Gained:
                    case GameplayEventType.PickedUp:
                        ui?.Toast(PromptText.Gain(e.ItemId, e.Count), ToastKind.Gain, e.ItemId);
                        sound?.Play(Cue.Pickup, at);
                        break;
                    case GameplayEventType.SurplusDropped:
                    case GameplayEventType.Refused:
                        if (!string.IsNullOrEmpty(e.Text)) ui?.Toast(e.Text, ToastKind.Warning);
                        if (e.Type == GameplayEventType.Refused) sound?.Play(Cue.Refused, at);
                        break;
                    case GameplayEventType.ToolBroken:
                        ui?.Toast(e.Text, ToastKind.Warning);
                        sound?.Play(Cue.Broken, at);
                        break;
                    case GameplayEventType.Felled:
                        if (World.TryGet(e.Node, out Harvestable tree)) visuals?.StartFall(tree, e.Heading, () => Landed(tree, e.Heading));
                        sound?.Play(Cue.Creak, new Vector3((float)e.X, (float)lastPlayer.Y + 2, (float)e.Z));
                        MarkChunkOf(e.Node);
                        break;
                    case GameplayEventType.Dropped:
                        sound?.Play(Cue.Drop, at);
                        break;
                    case GameplayEventType.Equipped:
                        sound?.Play(Cue.Equip, new Vector3((float)lastPlayer.X, (float)lastPlayer.Y + 1, (float)lastPlayer.Z));
                        break;
                    case GameplayEventType.StageCompleted:
                    case GameplayEventType.Depleted:
                    case GameplayEventType.Tilled:
                    case GameplayEventType.RegrowStarted:
                    case GameplayEventType.Regrown:
                    case GameplayEventType.WorldChanged:
                        MarkChunkOf(e.Node);
                        if (e.Type == GameplayEventType.Depleted || e.Type == GameplayEventType.Tilled)
                            fx?.Burst(e.Kind, new Vector3((float)e.X, (float)(World.GroundAt(e.X, e.Z) ?? lastPlayer.Y) + 0.3f, (float)e.Z));
                        break;
                }
            }
        }

        private void Landed(Harvestable tree, double heading)
        {
            float length = (float)((tree.Collider?.Height ?? 6) * 0.9);
            var foot = new Vector3((float)tree.X, (float)(World.GroundAt(tree.X, tree.Z) ?? lastPlayer.Y), (float)tree.Z);
            var dir = new Vector3((float)Math.Sin(heading), 0, (float)Math.Cos(heading));
            fx?.Landing(foot, dir, length);
            sound?.Play(Cue.TreeLands, foot + dir * length * 0.6f);
        }

        private void StartWobble(NodeId id)
        {
            wobbles[id.Pack()] = (clockS + WobbleS, new Vector3((float)lastPlayer.X, 0, (float)lastPlayer.Z));
            MarkChunkOf(id);
        }

        private void ExpireWobbles()
        {
            if (wobbles.Count == 0) return;
            var ended = new List<long>();
            foreach (var kv in wobbles) if (kv.Value.until <= clockS) ended.Add(kv.Key);
            foreach (long id in ended)
            {
                wobbles.Remove(id);
                MarkChunkOf(NodeId.Unpack(id));
            }
        }

        // --- save ----------------------------------------------------------------------------------------------------------

        /// <summary>Writes the save now (if this run may save). `worldTicks`: the session's clock, kept for the next start.</summary>
        public void SaveNow(string reason, long? worldTicks = null)
        {
            saveTimerS = 0;
            if (worldTicks != null) lastWorldTicksForSave = worldTicks.Value;
            if (!saveAllowed || !dirty && reason != "sortie") return;
            try
            {
                store.WriteAtomic(GameSave.Write(new SaveData(seed, (long)lastWorldTicksForSave, lastTicks, lastPlayer.X, lastPlayer.Y, lastPlayer.Z, lastHeading, State, Camp)));
                dirty = false;
            }
            catch (Exception e)
            {
                Debug.LogError("[JeuSurvie] Sauvegarde impossible (" + reason + ") : " + e.Message);
                ui?.Toast("Sauvegarde impossible : " + e.Message, ToastKind.Warning);
            }
        }

        public void NoteWorldTicks(long worldTicks) => lastWorldTicksForSave = worldTicks;

        /// <summary>« Nouvelle partie »: the old save is kept aside, the camp is ready again with its tools.</summary>
        public void NewGame()
        {
            if (store is FileSaveStore files) files.SetAside();
            State = GameplayState.Initial(Camp, (x, z) => World.GroundAt(x, z) ?? Terrain.HeightAt(seed, x, z));
            foreach (string key in World.Keys) dirtyChunks.Add(key);
            dirty = true;
            ui?.Toast("Nouvelle partie : les outils t'attendent au camp", ToastKind.Info);
        }

    }
}
