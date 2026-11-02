// Parity of the render data (light, atmosphere, fog, grade…) and of the app logic (session, camera, streaming) with the TS.
using System;
using System.Collections.Generic;
using System.Linq;
using JeuSurvie.Core.App;
using JeuSurvie.Core.Physics;
using JeuSurvie.Core.RenderData;
using JeuSurvie.Core.Shared;
using JeuSurvie.Core.Storage;
using JeuSurvie.Core.Survival;
using JeuSurvie.Core.World;
using NUnit.Framework;
using static JeuSurvie.Tests.Fixture;

namespace JeuSurvie.Tests
{
    public class RenderAndAppParityTests
    {
        private const double Tol = 1e-9;

        private static void Near(object expected, double actual, string what = null) =>
            Assert.AreEqual(D(expected), actual, Math.Abs(D(expected)) * Tol + Tol, what);

        private static void Rgb(object expected, Rgb actual, string what = null)
        {
            var e = L(expected);
            Near(e[0], actual.R, what); Near(e[1], actual.G, what); Near(e[2], actual.B, what);
        }

        private static void AssertLighting(Dictionary<string, object> e, Lighting l)
        {
            Rgb(e["skyZenith"], l.SkyZenith, "zenith");
            Rgb(e["skyHorizon"], l.SkyHorizon, "horizon");
            Rgb(e["fogColor"], l.FogColor, "fog");
            Rgb(e["sunColor"], l.SunColor, "sun");
            Near(e["sunIntensity"], l.SunIntensity, "sunI");
            Near(e["shadowIntensity"], l.ShadowIntensity);
            var d = O(e["sunDirection"]);
            Near(d["x"], l.SunDirection.X); Near(d["y"], l.SunDirection.Y); Near(d["z"], l.SunDirection.Z);
            Rgb(e["ambientColor"], l.AmbientColor);
            Rgb(e["ambientGroundColor"], l.AmbientGroundColor);
            Near(e["ambientIntensity"], l.AmbientIntensity);
            Rgb(e["cloudLight"], l.CloudLight);
            Rgb(e["cloudShade"], l.CloudShade);
            Near(e["starVisibility"], l.StarVisibility);
            Near(e["sunGlow"], l.SunGlow);
            Near(e["rayStrength"], l.RayStrength);
        }

        private static void AssertGrade(Dictionary<string, object> e, Grade g)
        {
            Near(e["exposure"], g.Exposure); Near(e["saturation"], g.Saturation); Near(e["tint"], g.Tint); Near(e["hue"], g.Hue);
        }

        [Test]
        public void DayCycleLightingFogGradeMatch()
        {
            foreach (object o in List("lighting"))
            {
                var e = O(o);
                TimeOfDay t = TimeOfDay.From(D(e["f"]) * 1200 + 1200 * 3);
                Assert.AreEqual((int)D(e["day"]), t.Day);
                Assert.AreEqual((string)e["phase"], TimeOfDay.PhaseLabel(t.Phase));
                Near(e["dayFraction"], t.DayFraction);
                Lighting l = Lights.For(t);
                AssertLighting(O(e["l"]), l);
                Near(e["shadow"], Lights.ShadowStrength(l));
                Rgb(e["haze"], Fog.HazeColor(l));
                HeightFog hf = Fog.HeightFogFor(t);
                Near(O(e["heightFog"])["density"], hf.Density);
                Near(O(e["heightFog"])["thickness"], hf.Thickness);
                Near(e["vis"], Fog.DistanceFogVisibilityFor(t));
                Near(e["ibl"], Surfaces.IblIntensityFor(l));
                AssertGrade(O(e["grade"]), Atmospheres.GradeFor(l));
                Cosmos c = Cosmos.For(t);
                Near(O(e["cosmos"])["rotation"], c.Rotation);
                Near(O(e["cosmos"])["aurora"], c.Aurora);
                Assert.AreEqual((int)D(e["fireflies"]), NightMagic.FireflyCount(l));
                Rgb(e["glow"], NightMagic.MushroomGlow(l));
            }
        }

        [Test]
        public void AtmosphereByWeatherMatches()
        {
            foreach (object o in List("atmosphere"))
            {
                var e = O(o);
                Lighting l = Lights.For(TimeOfDay.From(D(e["f"]) * 1200));
                Assert.IsTrue(Weather.TryParse((string)e["kind"], out WeatherKind kind));
                Atmosphere a = Atmospheres.For(l, Weather.Forced(kind), D(e["flash"]));
                var ea = O(e["a"]);
                AssertLighting(O(ea["light"]), a.Light);
                Near(ea["fogDensityFactor"], a.FogDensityFactor);
                Near(ea["fogBankDensity"], a.FogBankDensity);
                Near(e["brightness"], Atmospheres.SceneBrightness(a.Light));
                AssertGrade(O(e["grade"]), Atmospheres.WeatherGrade(Atmospheres.GradeFor(a.Light), a));
                Near(e["density"], Atmospheres.DistanceFogDensity(a, Fog.DensityFor(512, 0.3)));
                Near(e["ibl"], Surfaces.IblIntensityFor(a.Light));
            }
        }

        [Test]
        public void LightningLensFoliageSectorCoverMatch()
        {
            foreach (object o in List("lightning"))
            {
                var r = L(o);
                uint seed = D(r[1]) == 1 ? 12345u : 99u;
                Near(r[2], Atmospheres.LightningFlash(seed, D(r[0]), D(r[1])));
            }
            foreach (object o in List("lens"))
            {
                var r = L(o);
                double target = LensDrops.RainTarget(D(r[0]), D(r[1]));
                Near(r[2], target);
                Near(r[3], LensDrops.Step(0.2, target, 0.016));
            }
            foreach (object o in List("foliage"))
            {
                var r = L(o);
                double x = D(r[0]), z = D(r[1]);
                Near(r[2], Foliage.Hash01(x, z));
                Near(r[3], Foliage.ValueNoise(x / 9, z / 9));
                InstanceTint a = Foliage.TuftTint(x, z), b = Foliage.TreeTint(x, z);
                Rgb(r[4], a.Target); Near(r[5], a.Amount); Near(r[6], a.Brightness);
                Rgb(r[7], b.Target); Near(r[8], b.Amount); Near(r[9], b.Brightness);
                Vec2XZ w = Foliage.WindOffset(x, z, 0.7, 12.5, 0.28, 1.3);
                Near(r[10], w.X); Near(r[11], w.Z);
            }
            var sec = O(Data["sector"]);
            ViewSector s = ViewSectors.For(0.6, 1.0, 16.0 / 9);
            Near(O(sec["s"])["dirX"], s.DirX); Near(O(sec["s"])["dirZ"], s.DirZ); Near(O(sec["s"])["cosHalf"], s.CosHalf);
            foreach (object o in L(sec["tests"]))
            {
                var r = L(o);
                Assert.AreEqual((bool)r[2], ViewSectors.InSector(s, 1, 2, D(r[0]), D(r[1]), 0));
                Assert.AreEqual((bool)r[3], ViewSectors.InSector(s, 1, 2, D(r[0]), D(r[1]), 3));
            }
            foreach (object o in List("coverKept"))
            {
                var r = L(o);
                Assert.AreEqual((bool)r[2], GroundCoverInstances.CoverKept(D(r[0]), D(r[1]), 0.5));
                Assert.AreEqual((bool)r[3], GroundCoverInstances.CoverKept(D(r[0]) + 0.3, D(r[1]) - 0.7, 0.75));
            }
            var shrink = List("shrink");
            ChunkData chunk = Chunk.Generate(12345, 0, 0);
            float[] flat = VegetationInstances.Build(Placement.InChunk(12345, 0, 0), chunk).Values.First();
            var dst = new float[flat.Length];
            int n = GroundCoverInstances.Shrink(flat, 20, 20, 0, 40, 25, dst, 0.7, new ViewCull(s, 15, 10));
            Assert.AreEqual((int)D(shrink[0]), n);
            Near(shrink[1], Digest(dst));
        }

        [Test]
        public void QualityDescriptionsAndPreferencesMatch()
        {
            foreach (object o in List("quality"))
            {
                var r = L(o);
                Assert.IsTrue(Quality.TryParseLevel((string)r[0], out QualityLevel lvl));
                Assert.AreEqual((string)r[1], Quality.DescribeLine(Quality.Resolve(lvl)));
                var off = new Dictionary<QualityOverrideKey, bool> { { QualityOverrideKey.Shadows, false }, { QualityOverrideKey.Ao, false }, { QualityOverrideKey.Msaa, false } };
                Assert.AreEqual((string)r[2], Quality.DescribeLine(Quality.Resolve(lvl, off)));
            }
            foreach (object o in List("prefs"))
            {
                var r = L(o);
                Assert.AreEqual((string)r[1], GraphicsPreferencesCodec.Serialize(GraphicsPreferencesCodec.Parse((string)r[0])), "prefs " + r[0]);
            }
        }

        [Test]
        public void StreamingPlanMatches()
        {
            StreamPlan plan = Streamer.Plan(100, -50, new Dictionary<string, ChunkCoord>(), new StreamParams(512, 64, 520));
            var e = List("streaming");
            for (int i = 0; i < e.Count; i++)
            {
                var c = L(e[i]);
                Assert.AreEqual((int)D(c[0]), plan.Wanted[i].Cx, $"wanted[{i}]");
                Assert.AreEqual((int)D(c[1]), plan.Wanted[i].Cz, $"wanted[{i}]");
            }
        }

        [Test]
        public void SessionWalkThroughForestMatchesTypeScript()
        {
            const uint seed = 12345;
            var chunks = new Dictionary<string, ChunkData>();
            for (int cx = -3; cx <= 3; cx++)
                for (int cz = -3; cz <= 3; cz++) chunks[Chunk.Key(cx, cz)] = Chunk.Generate(seed, cx, cz);
            var obstacles = new ObstacleIndex(seed);
            GroundSampler ground = (x, z) => Ground.HeightIn(chunks, x, z);
            var session = new GameSession(0, 0, ground, (x, z) => obstacles.Near(x, z));
            session.SetTimeOfDay(0.06);
            var rig = new CameraRig(0.6, 0.35, 7);
            var trace = List("session");
            int t = 0;
            for (int frame = 0; frame < 1200; frame++)
            {
                rig = CameraRigs.ApplyZoom(CameraRigs.ApplyLook(rig, frame % 50 == 0 ? 37 : 0, frame % 90 == 0 ? -11 : 0, 0.0025), frame % 200 == 0 ? 120 : 0);
                Vec2XZ dir = CameraRigs.WishDirection(frame % 400 < 300, false, frame % 300 > 250, frame % 500 > 450, rig.Yaw);
                double alpha = session.Frame(16.6667, true, dir.X, dir.Z);
                if (frame % 60 != 0) continue;
                var e = L(trace[t++]);
                Vec3 shown = session.Interpolated(alpha);
                CameraPose pose = CameraRigs.Pose(rig, new Vec3(shown.X, shown.Y + 1.5, shown.Z), ground, (ax, az, bx, bz) => obstacles.Along(ax, az, bx, bz));
                // Trigonometry (yaw) can differ by 1 ulp between JS engines and .NET: millimetre tolerance on the whole walk.
                Assert.AreEqual(D(e[1]), session.Current.X, 1e-6, $"frame {frame} x");
                Assert.AreEqual(D(e[2]), session.Current.Y, 1e-6, $"frame {frame} y");
                Assert.AreEqual(D(e[3]), session.Current.Z, 1e-6, $"frame {frame} z");
                Assert.AreEqual((long)D(e[4]), session.WorldTicks);
                Assert.AreEqual(D(e[5]), pose.Position.X, 1e-6);
                Assert.AreEqual(D(e[6]), pose.Position.Y, 1e-6);
                Assert.AreEqual(D(e[7]), pose.Position.Z, 1e-6);
            }
            Assert.AreEqual(trace.Count, t);
        }
    }
}
