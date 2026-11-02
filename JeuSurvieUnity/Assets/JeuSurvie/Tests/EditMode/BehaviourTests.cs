// Behavioural tests ported from the original Vitest suites (app/loop, app/modes, app/chunks, app/camera, core/physics,
// core/world/weather, adapters/storage, ui/settings neighbour keys).
using System;
using System.Collections.Generic;
using System.Linq;
using JeuSurvie.Core.App;
using JeuSurvie.Core.Physics;
using JeuSurvie.Core.RenderData;
using JeuSurvie.Core.Shared;
using JeuSurvie.Core.Storage;
using JeuSurvie.Core.World;
using NUnit.Framework;

namespace JeuSurvie.Tests
{
    public class BehaviourTests
    {
        [Test]
        public void FixedStepAccumulatesClampsAndDropsBacklog()
        {
            AdvanceResult a = FixedStep.Advance(0, 50, 1000.0 / 30);
            Assert.AreEqual(1, a.Steps);
            Assert.AreEqual(50 - 1000.0 / 30, a.AccMs, 1e-9);
            Assert.AreEqual(5, FixedStep.Advance(0, 10000, 1000.0 / 30).Steps, "a long frame counts for 250 ms at most, 5 ticks max");
            Assert.AreEqual(0, FixedStep.Advance(0, double.NaN, 33).Steps);
            Assert.That(FixedStep.Advance(0, 249, 33).Alpha, Is.InRange(0, 1));
        }

        [Test]
        public void InputModeMachine()
        {
            Assert.AreEqual(InputMode.ResumePrompt, InputModes.Initial);
            Assert.AreEqual(InputMode.Playing, InputModes.Next(InputMode.ResumePrompt, ModeEvent.CaptureGained));
            Assert.AreEqual(InputMode.Paused, InputModes.Next(InputMode.Playing, ModeEvent.CaptureLost));
            Assert.AreEqual(InputMode.ResumePrompt, InputModes.Next(InputMode.Paused, ModeEvent.CaptureRefused));
            Assert.AreEqual(InputMode.ResumePrompt, InputModes.Next(InputMode.ResumePrompt, ModeEvent.CaptureLost));
            Assert.IsTrue(InputModes.SimulationRuns(InputMode.Playing));
            Assert.IsFalse(InputModes.SimulationRuns(InputMode.Paused));
        }

        [Test]
        public void RawInputNormalisation()
        {
            Assert.AreEqual(48, RawInputRules.NormalizeWheel(3, 1));
            Assert.AreEqual(1000, RawInputRules.NormalizeWheel(5, 2), "clamped");
            Assert.AreEqual(0, RawInputRules.NormalizeWheel(double.PositiveInfinity, 0));
            Assert.AreEqual(200, RawInputRules.ClampLookDelta(900));
        }

        private sealed class FakeSource : IChunkSource<int>
        {
            public readonly Dictionary<string, double> Requested = new Dictionary<string, double>();
            public readonly List<string> Cancelled = new List<string>();
            public readonly List<ReadyChunk<int>> Ready = new List<ReadyChunk<int>>();
            public void Request(int cx, int cz, double priority) => Requested[Chunk.Key(cx, cz)] = priority;
            public void Cancel(int cx, int cz) { Cancelled.Add(Chunk.Key(cx, cz)); Requested.Remove(Chunk.Key(cx, cz)); }
            public IReadOnlyList<ReadyChunk<int>> DrainReady(int max)
            {
                var r = Ready.Take(max).ToList();
                Ready.RemoveRange(0, r.Count);
                return r;
            }
        }

        [Test]
        public void ChunkLoadingRequestsCollectsCancelsAndUnloads()
        {
            var source = new FakeSource();
            var loading = new ChunkLoading<int>(source, 2);
            StreamPlan plan = Streamer.Plan(10, 10, loading.Loaded, new StreamParams(130, 64, 30));
            loading.ApplyPlan(plan, 10, 10);
            Assert.AreEqual(plan.ToLoad.Count, source.Requested.Count);
            Assert.AreEqual(0, plan.ToLoad[0].Cx);
            Assert.AreEqual(0, plan.ToLoad[0].Cz);
            source.Ready.Add(new ReadyChunk<int>(new ChunkData(0, 0, new float[Chunk.Verts * Chunk.Verts]), 7));
            source.Ready.Add(new ReadyChunk<int>(new ChunkData(99, 99, new float[Chunk.Verts * Chunk.Verts]), 8)); // never requested
            var loaded = loading.Collect();
            Assert.AreEqual(1, loaded.Count);
            Assert.AreEqual("0,0", loaded[0].Key);
            Assert.IsTrue(loading.Chunks.ContainsKey("0,0"));
            // Far away: the old requests are cancelled and the loaded chunk unloaded.
            StreamPlan farPlan = Streamer.Plan(5000, 5000, loading.Loaded, new StreamParams(130, 64, 30));
            var gone = loading.ApplyPlan(farPlan, 5000, 5000);
            Assert.AreEqual(1, gone.Count);
            Assert.IsNotEmpty(source.Cancelled);
            Assert.IsFalse(loading.Chunks.ContainsKey("0,0"));
        }

        [Test]
        public void StreamingRespectsCapAndPutsHereFirst()
        {
            List<ChunkCoord> around = Streamer.ChunksAround(-1, -1, 512, 40);
            Assert.AreEqual(40, around.Count);
            Assert.AreEqual(new ChunkCoord(-1, -1), around[0]);
            Assert.That(Streamer.EffectiveViewRadius(512, 520), Is.LessThanOrEqualTo(512));
            Assert.That(Streamer.ChunksAround(7990, 0, 512, 520).All(c => Math.Sqrt(Math.Pow((c.Cx + 0.5) * 64, 2) + Math.Pow((c.Cz + 0.5) * 64, 2)) <= 8000 + 512));
        }

        [Test]
        public void SessionStaysOnUnloadedGroundAndIsPushedOutOfObstacles()
        {
            var flat = new Dictionary<string, ChunkData> { { "0,0", new ChunkData(0, 0, new float[Chunk.Verts * Chunk.Verts]) } };
            GroundSampler ground = (x, z) => Ground.HeightIn(flat, x, z);
            var circle = new List<Circle> { new Circle(32, 34, 1) };
            var s = new GameSession(32, 30, ground, (x, z) => circle);
            for (int i = 0; i < 120; i++) s.Frame(1000.0 / 30, true, 0, 1);
            Assert.That(MathUtil.Hypot(s.Current.X - 32, s.Current.Z - 34), Is.GreaterThanOrEqualTo(1 + 0.35 - 1e-6), "never inside the trunk");
            var edge = new GameSession(63, 10, ground);
            for (int i = 0; i < 60; i++) edge.Frame(1000.0 / 30, true, 1, 0);
            Assert.That(edge.Current.X, Is.LessThanOrEqualTo(64), "never walks onto an unloaded chunk");
        }

        [Test]
        public void CameraRigClampsAndShortensItsBoom()
        {
            var rig = CameraRigs.ApplyLook(new CameraRig(0, 0, 7), 0, 10000, 0.0025);
            Assert.AreEqual(CameraRigs.MaxPitch, rig.Pitch);
            Assert.AreEqual(CameraRigs.MaxDistance, CameraRigs.ApplyZoom(rig, 1e6).Distance);
            var target = new Vec3(0, 1.5, 0);
            var free = CameraRigs.Pose(new CameraRig(0, 0, 7), target);
            Assert.AreEqual(-7, free.Position.Z, 1e-9);
            var blocked = CameraRigs.Pose(new CameraRig(0, 0, 7), target, null, (a, b, c, d) => new[] { new Circle(0, -3, 0.5) });
            Assert.That(blocked.Position.Z, Is.GreaterThan(-3), "the camera comes closer instead of crossing the trunk");
            var low = CameraRigs.Pose(new CameraRig(0, -0.35, 7), target, (x, z) => 5);
            Assert.That(low.Position.Y, Is.GreaterThanOrEqualTo(5 + CameraRigs.CameraGroundClearance - 1e-9), "never under the ground");
        }

        [Test]
        public void WeatherStartsClearAndStormsOnlyAfterCloudyEpisodes()
        {
            for (uint seed = 0; seed < 50; seed++)
            {
                Assert.AreEqual(WeatherKind.Clair, Weather.KindAt(seed, 10));
                for (int i = 1; i < 60; i++)
                {
                    if (Weather.KindAt(seed, i * Weather.SegmentS + 1) != WeatherKind.Orage) continue;
                    WeatherKind before = Weather.KindAt(seed, (i - 1) * Weather.SegmentS + 1);
                    Assert.That(before, Is.Not.EqualTo(WeatherKind.Clair).And.Not.EqualTo(WeatherKind.Brouillard));
                }
            }
        }

        private sealed class BrokenStorage : ITextStorage
        {
            public string GetItem(string key) => throw new InvalidOperationException("blocked");
            public void SetItem(string key, string value) => throw new InvalidOperationException("full");
            public void RemoveItem(string key) => throw new InvalidOperationException("blocked");
        }

        private sealed class MemoryStorage : ITextStorage
        {
            public readonly Dictionary<string, string> Items = new Dictionary<string, string>();
            public string GetItem(string key) => Items.TryGetValue(key, out string v) ? v : null;
            public void SetItem(string key, string value) => Items[key] = value;
            public void RemoveItem(string key) => Items.Remove(key);
        }

        [Test]
        public void PreferencesNeverThrowAndRoundTrip()
        {
            var broken = new GraphicsPreferencesStore(new BrokenStorage());
            Assert.AreEqual(QualityLevel.High, broken.Load().Level);
            Assert.IsFalse(broken.Save(GraphicsPreferences.Default));
            Assert.AreEqual(QualityLevel.High, broken.Reset().Level);
            var memory = new MemoryStorage();
            var store = new GraphicsPreferencesStore(memory);
            Assert.IsTrue(store.Save(new GraphicsPreferences(QualityLevel.Ultra, new Dictionary<QualityOverrideKey, bool> { { QualityOverrideKey.Ao, false } })));
            Assert.AreEqual("{\"level\":\"ultra\",\"overrides\":{\"ao\":false}}", memory.Items[GraphicsPreferencesCodec.Key]);
            GraphicsPreferences back = store.Load();
            Assert.AreEqual(QualityLevel.Ultra, back.Level);
            Assert.IsFalse(back.Overrides[QualityOverrideKey.Ao]);
            memory.Items[GraphicsPreferencesCodec.Key] = new string('x', 5000);
            Assert.AreEqual(QualityLevel.High, store.Load().Level, "oversized: ignored");
            Assert.AreEqual(QualityLevel.High, GraphicsPreferencesCodec.Parse("{\"level\":\"medium\"").Level, "truncated JSON: defaults");
        }

        [Test]
        public void ProfilesCanOnlySwitchEffectsOffAndKeysMoveWithoutWrapping()
        {
            QualitySettings q = Quality.Resolve(QualityLevel.Ultra, new Dictionary<QualityOverrideKey, bool> { { QualityOverrideKey.Rain, false }, { QualityOverrideKey.Dof, false } });
            Assert.AreEqual(0, q.RainDrops);
            Assert.IsNull(q.Post.Dof);
            Assert.IsNotNull(q.Shadows);
            Assert.AreEqual(QualityLevel.Ultra, Quality.Neighbour(QualityLevel.Ultra, "ArrowRight"));
            Assert.AreEqual(QualityLevel.Low, Quality.Neighbour(QualityLevel.High, "Home"));
            Assert.IsNull(Quality.Neighbour(QualityLevel.High, "Enter"));
            Assert.IsTrue(Quality.TryParseLevel("moyenne", out QualityLevel legacy));
            Assert.AreEqual(QualityLevel.Medium, legacy);
            Assert.AreEqual(1.5, Quality.PixelRatioFor(2, 1.5));
            Assert.AreEqual(1, Quality.PixelRatioFor(double.NaN, 2));
        }
    }
}
