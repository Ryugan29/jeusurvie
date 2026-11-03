// The elf's leaf outfit moves with Unity Cloth (decision-2026-11-02-tenue-souple-et-lianes): the skirt and the shoulder leaves
// are held where they are attached, free at their tips, kept out of her legs and arms, and they go with the wind without the
// simulation running away. A piece that cannot be set up stays simply skinned and says why.
#if UNITY_EDITOR
using System.Collections;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using JeuSurvie.Characters;
using JeuSurvie.Core.RenderData;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace JeuSurvie.Tests
{
    public class LeafOutfitTests
    {
        private static string HeroinePath => Path.Combine(Application.streamingAssetsPath, "assets", "models", "characters", "heroine", "heroine.gltf");

        [UnityTest]
        public IEnumerator LeavesArePinnedFreeAtTheTipsAndGoWithTheWind()
        {
            Assume.That(File.Exists(HeroinePath), "héroïne absente");
            Task<AnimatedModel> task = CharacterLoader.LoadAsync(HeroinePath, 1.7, Shader.Find("JeuSurvie/NaturePBR"));
            yield return new WaitUntil(() => task.IsCompleted);
            Assert.IsTrue(task.Status == TaskStatus.RanToCompletion, task.Exception?.GetBaseException().Message);
            AnimatedModel model = task.Result;
            Camera view = Watch(model.Pivot.position); // the cloth is simulated where it is seen
            try
            {
                LeafOutfit outfit = LeafOutfit.Attach(model, new LeafClothTuning());
                Assert.IsEmpty(outfit.Problems, string.Join(" ; ", outfit.Problems));
                CollectionAssert.AreEquivalent(new[] { "Elfe_Jupe", "Elfe_Epaulettes" }, outfit.Cloths.Select(c => c.name));
                foreach (Cloth cloth in outfit.Cloths)
                {
                    float[] max = cloth.coefficients.Select(c => c.maxDistance).ToArray();
                    Assert.Greater(max.Count(d => d == 0), max.Length / 10, $"{cloth.name} : la base des feuilles doit rester attachée");
                    Assert.Greater(max.Max(), 0.02f, $"{cloth.name} : les pointes doivent être libres");
                    Assert.IsNotEmpty(cloth.sphereColliders, $"{cloth.name} : rien n'empêche les feuilles de traverser le corps");
                    Assert.IsTrue(cloth.sphereColliders.All(p => p.first != null && p.second != null));
                }
                Cloth skirt = outfit.Cloths.First(c => c.name == "Elfe_Jupe");
                ClothSkinningCoefficient[] limits = skirt.coefficients;
                Mesh skirtMesh = skirt.GetComponent<SkinnedMeshRenderer>().sharedMesh;
                Assert.AreEqual(skirtMesh.vertexCount, limits.Length, "chaque feuille doit être d'un seul tenant (rangées qui partagent leurs points)");
                Vector3[] rest = skirtMesh.vertices;
                int[] all = Enumerable.Range(0, rest.Length).ToArray();
                float pinnedY = all.Where(i => limits[i].maxDistance == 0).Average(i => rest[i].y);
                float tipY = all.Where(i => limits[i].maxDistance > 0.04f).Average(i => rest[i].y);
                Assert.Greater(pinnedY, tipY + 0.1f, "la base des feuilles doit être en haut, à la ceinture");
                // The cloth keeps each point from sinking behind its skinned place along its normal: the normals must face out.
                Vector3[] normals = skirtMesh.normals;
                float outward = all.Average(i => Vector3.Dot(normals[i], new Vector3(rest[i].x, 0, rest[i].z).normalized));
                Assert.Greater(outward, 0.5f, "les feuilles doivent avoir leur face extérieure tournée vers l'extérieur du corps");

                outfit.Update(0, 0, 0);
                yield return new WaitForSeconds(1.5f);
                Vector3[] calm = WorldPoints(skirt);
                outfit.Update(1.6, 1, 0); // the game's strongest wind, at a gust's peak
                yield return new WaitForSeconds(1.5f);
                Vector3[] windy = WorldPoints(skirt);

                Assert.IsTrue(windy.All(v => float.IsFinite(v.x) && float.IsFinite(v.y) && float.IsFinite(v.z)), "la simulation a divergé");
                for (int i = 0; i < windy.Length; i++)
                    Assert.LessOrEqual((windy[i] - calm[i]).magnitude, 2 * limits[i].maxDistance + 0.005f, $"point {i} parti au-delà de sa liberté");
                var wind = new Vector3((float)Foliage.WindDirX, 0, (float)Foliage.WindDirZ);
                float along = all.Where(i => limits[i].maxDistance > 0.04f).Average(i => Vector3.Dot(windy[i] - calm[i], wind));
                Assert.Greater(along, 0.01f, "les pointes de la jupe doivent partir avec le vent");
            }
            finally
            {
                Object.Destroy(view.gameObject);
                Object.Destroy(model.Pivot.gameObject);
            }
        }

        // When the whole character jumps (snapped onto the ground once it is loaded, a teleport), the leaves go with her
        // instead of being flung against their limits.
        [UnityTest]
        public IEnumerator AJumpOfTheWholeCharacterDoesNotFlingTheLeaves()
        {
            Assume.That(File.Exists(HeroinePath), "héroïne absente");
            Task<AnimatedModel> task = CharacterLoader.LoadAsync(HeroinePath, 1.7, Shader.Find("JeuSurvie/NaturePBR"));
            yield return new WaitUntil(() => task.IsCompleted);
            Assert.IsTrue(task.Status == TaskStatus.RanToCompletion, task.Exception?.GetBaseException().Message);
            AnimatedModel model = task.Result;
            Camera view = Watch(model.Pivot.position);
            try
            {
                LeafOutfit outfit = LeafOutfit.Attach(model, new LeafClothTuning());
                Cloth skirt = outfit.Cloths.First(c => c.name == "Elfe_Jupe");
                yield return new WaitForSeconds(1f);
                Vector3[] before = AroundPivot(skirt, model);

                var jump = new Vector3(300, 40, 0);
                model.Pivot.position += jump;
                view.transform.position += jump;
                outfit.Update(0, 0, 0);
                ClothSkinningCoefficient[] limits = skirt.coefficients;
                int[] tips = Enumerable.Range(0, limits.Length).Where(i => limits[i].maxDistance > 0.04f).ToArray();
                float worst = 0, until = Time.time + 0.5f;
                while (Time.time < until)
                {
                    yield return null;
                    Vector3[] after = AroundPivot(skirt, model);
                    worst = Mathf.Max(worst, tips.Average(i => (after[i] - before[i]).magnitude));
                }
                Assert.Less(worst, 0.01f, "les feuilles ont été projetées par le saut");
            }
            finally
            {
                Object.Destroy(view.gameObject);
                Object.Destroy(model.Pivot.gameObject);
            }
        }

        // In the game she stands relaxed, walks and runs with her own animations (filmed, retargeted on her: ClipLibrary):
        // her thighs must not come through her leaves. Counted on the cloth's points against her posed skin, each compared with
        // where it sat in the pose she was made in (where the leaves were laid outside her skin): over a crease (the small of
        // her back, her buttocks, her groin) a leaf bridges the hollow, which the nearest-skin measure cannot tell from being
        // inside, and those creases change shape as she moves. Hence shares of points, not zero: measured on 2026-11-02 at 1 %
        // standing, 3 % walking and 6-8 % running, once the skirt leaves were carried by the thigh they hang over (17 % running
        // before: a raised knee came in front of the hanging leaves, as José saw) and the skin hidden under the skirt drawn in
        // (tenue.py shrink_under_skirt: seen on front, side and back views, it closed the holes her buttocks made in the skirt
        // as she runs, which this measure hardly tells from its crease noise), against about 19 %, 16 % and 23 % with the
        // leaves let fall (TheMeasureSeesLeavesFallingIntoHer, which checks the measure sees them).
        private static readonly (string name, double speed, double share)[] Gaits = { ("repos", 0.0, 0.02), ("marche", 1.5, 0.05), ("course", 5.0, 0.10) };
        // At a fixed 60 images/s (Time.captureFramerate), whatever the measure costs: 1.5 s to blend into the gait, then 1 s
        // watched, one frame in six measured.
        private const int BlendFrames = 90, WatchFrames = 60, MeasureEvery = 6;

        [UnityTest]
        public IEnumerator HerLegsNeverComeThroughTheLeaves()
        {
            Assume.That(File.Exists(HeroinePath) && File.Exists(AnimationsPath), "personnage ou animations absents");
            var results = new System.Collections.Generic.List<(string gait, double share, Insides worst, int measures, int points)>();
            yield return SinkingWhileShe(new LeafClothTuning(), results);
            string report = string.Join(" ; ", results.Select(r => $"{r.gait} : {r.worst} sur {r.points}"));
            Assert.IsTrue(results.All(r => r.measures >= WatchFrames / MeasureEvery / 2), "trop peu de mesures — " + report);
            Assert.AreEqual(0, results[0].worst.Tied, "debout, le haut des feuilles reste sous la ceinture — " + report);
            Assert.IsTrue(results.All(r => r.worst.Count <= r.share * r.points), "la jupe entre dans ses cuisses — " + report);
        }

        // The measure must see leaves going into her: left free to fall (no hold behind their place on her, long free tips),
        // gravity presses them into her forward thighs.
        [UnityTest]
        public IEnumerator TheMeasureSeesLeavesFallingIntoHer()
        {
            Assume.That(File.Exists(HeroinePath) && File.Exists(AnimationsPath), "personnage ou animations absents");
            var results = new System.Collections.Generic.List<(string gait, double share, Insides worst, int measures, int points)>();
            yield return SinkingWhileShe(new LeafClothTuning { SinkM = 1, TipFreedomM = 0.25 }, results);
            string report = string.Join(" ; ", results.Select(r => $"{r.gait} : {r.worst}"));
            Assert.IsTrue(results.All(r => r.worst.Count > r.share * r.points), "la mesure ne voit pas des feuilles laissées tomber — " + report);
        }

        private static string AnimationsPath => Path.Combine(Path.GetDirectoryName(HeroinePath), "animations.gltf");
        private static string AnimationsJson => Path.ChangeExtension(AnimationsPath, ".json");

        /// <summary>Loads her with her animations, puts on the outfit with `tuning`, and for each gait keeps the worst
        /// count of skirt points sunk more than 1 cm into her beyond where they sat when she was made.</summary>
        private static IEnumerator SinkingWhileShe(LeafClothTuning tuning, System.Collections.Generic.List<(string, double, Insides, int, int)> results)
        {
            Shader pbr = Shader.Find("JeuSurvie/NaturePBR");
            Task<AnimatedModel> task = CharacterLoader.LoadAsync(HeroinePath, 1.7, pbr);
            yield return new WaitUntil(() => task.IsCompleted);
            Assert.IsTrue(task.Status == TaskStatus.RanToCompletion, "chargement raté");
            AnimatedModel model = task.Result;
            var clipsTask = ClipLibrary.AddAsync(model, AnimationsPath, AnimationsJson);
            yield return new WaitUntil(() => clipsTask.IsCompleted);
            Assert.IsTrue(clipsTask.Status == TaskStatus.RanToCompletion, "animations illisibles : " + clipsTask.Exception?.GetBaseException().Message);
            // Away from the origin, where the bootstrap starts the game (its world, its own heroine) in every PlayMode test:
            // measured there, her held leaf tops sank at random, as if her cloth skipped steps.
            model.Pivot.position = new Vector3(500, 0, 0);
            Camera view = Watch(model.Pivot.position);
            var baked = new Mesh();
            Time.captureFramerate = 60;
            try
            {
                LeafOutfit outfit = LeafOutfit.Attach(model, tuning);
                Cloth skirt = outfit.Cloths.First(c => c.name == "Elfe_Jupe");
                var body = (SkinnedMeshRenderer)model.Renderers.First(r => r.name == "Superhero_Female");
                float[] v = skirt.GetComponent<SkinnedMeshRenderer>().sharedMesh.uv.Select(uv => uv.y).ToArray();
                for (int i = 0; i < 5; i++) yield return null; // the cloth gives its points once it has run a step or two
                float[] made = Depths(skirt, body, baked);
                Assert.IsTrue(made.All(d => Mathf.Abs(d) < 0.15f), "les points de la jupe ne sont pas encore sur elle : mesure de départ fausse");

                CharacterAnimator moves = CharacterAnimator.Create(model, clipsTask.Result);
                foreach ((string name, double speed, double share) in Gaits)
                {
                    Insides worst = default;
                    int measures = 0;
                    for (int frame = 0; frame < BlendFrames + WatchFrames; frame++)
                    {
                        moves.Tick(Time.deltaTime, speed, false);
                        yield return null;
                        if (frame < BlendFrames || (frame - BlendFrames) % MeasureEvery != 0) continue;
                        if (HeldLag(skirt) > 0.005f) continue; // the cloth's points lag her skin by a frame (a loaded machine)
                        measures++;
                        Insides now = Sunk(Depths(skirt, body, baked), made, v, 0.01f);
                        if (now.Count > worst.Count) worst = now;
                    }
                    Debug.Log($"[test tenue] {name} : {worst} sur {v.Length} ({measures} mesures)");
                    results.Add((name, share, worst, measures, v.Length));
                }
            }
            finally
            {
                Time.captureFramerate = 0;
                Object.Destroy(baked);
                Object.Destroy(view.gameObject);
                Object.Destroy(model.Pivot.gameObject);
            }
        }

        /// <summary>How far, on average, the cloth's held points (no freedom) are from where her skeleton puts them now: above a
        /// few millimetres the cloth handed points from an earlier frame, and comparing them with her skin now would be wrong.</summary>
        private static float HeldLag(Cloth cloth)
        {
            var skinned = cloth.GetComponent<SkinnedMeshRenderer>();
            Mesh mesh = skinned.sharedMesh;
            Vector3[] rest = mesh.vertices;
            BoneWeight[] weights = mesh.boneWeights;
            Matrix4x4[] bindposes = mesh.bindposes;
            Transform[] bones = skinned.bones;
            ClothSkinningCoefficient[] limits = cloth.coefficients;
            Vector3[] points = WorldPoints(cloth);
            float sum = 0;
            int held = 0;
            for (int i = 0; i < points.Length; i++)
            {
                if (limits[i].maxDistance > 0) continue;
                BoneWeight w = weights[i];
                Vector3 there = w.weight0 * (bones[w.boneIndex0].localToWorldMatrix * bindposes[w.boneIndex0]).MultiplyPoint3x4(rest[i])
                    + w.weight1 * (bones[w.boneIndex1].localToWorldMatrix * bindposes[w.boneIndex1]).MultiplyPoint3x4(rest[i])
                    + w.weight2 * (bones[w.boneIndex2].localToWorldMatrix * bindposes[w.boneIndex2]).MultiplyPoint3x4(rest[i])
                    + w.weight3 * (bones[w.boneIndex3].localToWorldMatrix * bindposes[w.boneIndex3]).MultiplyPoint3x4(rest[i]);
                sum += (points[i] - there).magnitude;
                held++;
            }
            return held > 0 ? sum / held : 0;
        }

        /// <summary>Leaf points inside her body: how many, where along their leaf (tied top, middle, tip), how deep at worst.</summary>
        private struct Insides
        {
            public int Count, Tied, Middle, Tip;
            public float DeepestM;
            public override string ToString() => $"{Count} point(s) (haut tenu {Tied}, milieu {Middle}, pointe {Tip}), au pire {DeepestM * 100:0.0} cm";
        }

        /// <summary>The points that went more than depthM deeper into her body than where they sat when she was made; `v` is
        /// each point's place along its leaf (its UV v).</summary>
        private static Insides Sunk(float[] depths, float[] made, float[] v, float depthM)
        {
            var found = new Insides();
            for (int i = 0; i < depths.Length; i++)
            {
                if (depths[i] <= 0 || depths[i] - made[i] <= depthM) continue;
                found.Count++;
                if (v[i] <= LeafCloth.AttachedV) found.Tied++;
                else if (v[i] < 0.6f) found.Middle++;
                else found.Tip++;
                found.DeepestM = Mathf.Max(found.DeepestM, depths[i] - made[i]);
            }
            return found;
        }

        /// <summary>How deep each of the cloth's points is inside her posed body (negative: outside), judged by the nearest
        /// point of her skin's triangles and that triangle's outward side.</summary>
        private static float[] Depths(Cloth cloth, SkinnedMeshRenderer body, Mesh baked)
        {
            body.BakeMesh(baked, true);
            Matrix4x4 toWorld = body.transform.localToWorldMatrix; // measured: the baked skin still needs her scale
            Bounds near = cloth.GetComponent<SkinnedMeshRenderer>().bounds;
            near.Expand(0.15f);
            Vector3[] at = baked.vertices.Select(p => toWorld.MultiplyPoint3x4(p)).ToArray(), normals = baked.normals;
            int[] triangles = baked.triangles;
            var skin = new System.Collections.Generic.List<(Vector3 a, Vector3 b, Vector3 c, Vector3 outward)>();
            for (int t = 0; t < triangles.Length; t += 3)
            {
                int i = triangles[t], j = triangles[t + 1], k = triangles[t + 2];
                if (!near.Contains(at[i]) && !near.Contains(at[j]) && !near.Contains(at[k])) continue;
                Vector3 outward = Vector3.Cross(at[j] - at[i], at[k] - at[i]).normalized;
                if (Vector3.Dot(outward, toWorld.MultiplyVector(normals[i] + normals[j] + normals[k])) < 0) outward = -outward;
                skin.Add((at[i], at[j], at[k], outward));
            }
            Vector3[] points = WorldPoints(cloth);
            var depths = new float[points.Length];
            for (int i = 0; i < points.Length; i++)
            {
                float best = float.MaxValue;
                foreach (var s in skin)
                {
                    Vector3 q = ClosestOnTriangle(points[i], s.a, s.b, s.c);
                    float d = (q - points[i]).sqrMagnitude;
                    if (d < best) { best = d; depths[i] = -Vector3.Dot(points[i] - q, s.outward); }
                }
            }
            return depths;
        }

        /// <summary>The point of triangle abc nearest to p (Ericson, Real-Time Collision Detection, 5.1.5).</summary>
        private static Vector3 ClosestOnTriangle(Vector3 p, Vector3 a, Vector3 b, Vector3 c)
        {
            Vector3 ab = b - a, ac = c - a, ap = p - a;
            float d1 = Vector3.Dot(ab, ap), d2 = Vector3.Dot(ac, ap);
            if (d1 <= 0 && d2 <= 0) return a;
            Vector3 bp = p - b;
            float d3 = Vector3.Dot(ab, bp), d4 = Vector3.Dot(ac, bp);
            if (d3 >= 0 && d4 <= d3) return b;
            float vc = d1 * d4 - d3 * d2;
            if (vc <= 0 && d1 >= 0 && d3 <= 0) return a + ab * (d1 / (d1 - d3));
            Vector3 cp = p - c;
            float d5 = Vector3.Dot(ab, cp), d6 = Vector3.Dot(ac, cp);
            if (d6 >= 0 && d5 <= d6) return c;
            float vb = d5 * d2 - d1 * d6;
            if (vb <= 0 && d2 >= 0 && d6 <= 0) return a + ac * (d2 / (d2 - d6));
            float va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return b + (c - b) * ((d4 - d3) / (d4 - d3 + (d5 - d6)));
            float denom = 1 / (va + vb + vc);
            return a + ab * (vb * denom) + ac * (vc * denom);
        }

        [Test]
        public void MissingBonesAreToldAndTheOtherLimbsStillHoldTheLeaves()
        {
            AnimatedModel model = OneLeafModel("Elfe_Jupe", "thigh_l", "calf_l", "foot_l"); // a left leg only
            try
            {
                LeafOutfit outfit = LeafOutfit.Attach(model, new LeafClothTuning());
                Assert.IsNotEmpty(outfit.Problems);
                Assert.IsTrue(outfit.Problems.All(p => p.Contains("os absent")), string.Join(" ; ", outfit.Problems));
                Cloth cloth = outfit.Cloths.Single();
                Assert.AreEqual(2, cloth.sphereColliders.Length, "la cuisse gauche (hanche – mi-cuisse – genou) doit rester");
                float[] max = cloth.coefficients.Select(c => c.maxDistance).ToArray();
                CollectionAssert.AreEqual(new[] { 0f, 0f }, max.Take(2), "la base de la feuille (v = 0) est attachée");
                Assert.AreEqual(new LeafClothTuning().TipFreedomM, max.Last(), 1e-4, "sa pointe (v = 1) est libre");
                Assert.DoesNotThrow(() => outfit.Update(1.6, 1, 1));
            }
            finally { Object.Destroy(model.Pivot.gameObject); }
        }

        [Test]
        public void UnreadableLeavesStaySkinnedAndOtherModelsGetNothing()
        {
            AnimatedModel unreadable = OneLeafModel("Elfe_Jupe", "thigh_l", "calf_l", "foot_l");
            ((SkinnedMeshRenderer)unreadable.Renderers.First(r => r.name == "Elfe_Jupe")).sharedMesh.UploadMeshData(true);
            AnimatedModel other = OneLeafModel("Demon_Corps");
            try
            {
                LeafOutfit outfit = LeafOutfit.Attach(unreadable, new LeafClothTuning());
                Assert.IsEmpty(outfit.Cloths);
                Assert.IsTrue(outfit.Problems.Any(p => p.Contains("illisible")), string.Join(" ; ", outfit.Problems));

                LeafOutfit none = LeafOutfit.Attach(other, new LeafClothTuning());
                Assert.IsEmpty(none.Cloths);
                Assert.IsEmpty(none.Problems);
            }
            finally
            {
                Object.Destroy(unreadable.Pivot.gameObject);
                Object.Destroy(other.Pivot.gameObject);
            }
        }

        private static Camera Watch(Vector3 target)
        {
            var view = new GameObject("vue du test").AddComponent<Camera>();
            view.transform.position = target + new Vector3(0, 1.0f, 3f);
            view.transform.LookAt(target + new Vector3(0, 1.0f, 0));
            return view;
        }

        /// <summary>The cloth's points in the world: Unity gives them in the frame of its skin's root bone, turned but not scaled
        /// (measured: they match the skinned position of the attached points).</summary>
        private static Vector3[] WorldPoints(Cloth cloth)
        {
            var skinned = cloth.GetComponent<SkinnedMeshRenderer>();
            Transform frame = skinned.rootBone != null ? skinned.rootBone : skinned.transform;
            return cloth.vertices.Select(v => frame.position + frame.rotation * v).ToArray();
        }

        /// <summary>The cloth's points around the character (her pivot), metres: unchanged when she simply moves.</summary>
        private static Vector3[] AroundPivot(Cloth cloth, AnimatedModel model) =>
            WorldPoints(cloth).Select(p => p - model.Pivot.position).ToArray();

        /// <summary>A model made of one hanging leaf (3 rows, UV v 0 at the top to 1 at the tip) named `mesh`, skinned to a root,
        /// the given bones chained under it every 20 cm, and a skin: a 6 cm cylinder down the chain, each ring following the
        /// bone of its segment.</summary>
        private static AnimatedModel OneLeafModel(string mesh, params string[] bones)
        {
            var pivot = new GameObject("modèle du test").transform;
            var model = new AnimatedModel { Pivot = pivot };
            Transform root = new GameObject("root").transform;
            root.SetParent(pivot, false);
            model.Nodes["root"] = root;
            var chain = new System.Collections.Generic.List<Transform> { root };
            foreach (string name in bones)
            {
                Transform bone = new GameObject(name).transform;
                bone.SetParent(chain[chain.Count - 1], false);
                bone.localPosition = new Vector3(0, -0.2f, 0);
                model.Nodes[name] = bone;
                chain.Add(bone);
            }

            var skin = new System.Collections.Generic.List<Vector3>();
            var follows = new System.Collections.Generic.List<BoneWeight>();
            for (int ring = 0; ring < 26; ring++)
                for (int k = 0; k < 16; k++)
                {
                    float a = 2 * Mathf.PI * k / 16, y = -0.15f - 0.02f * ring;
                    skin.Add(new Vector3(0.06f * Mathf.Cos(a), y, 0.06f * Mathf.Sin(a)));
                    follows.Add(new BoneWeight { boneIndex0 = Mathf.Clamp(Mathf.FloorToInt(-y / 0.2f), 0, chain.Count - 1), weight0 = 1 });
                }
            var bodyGo = new GameObject("corps");
            bodyGo.transform.SetParent(pivot, false);
            var bodyMesh = new Mesh { name = "corps", vertices = skin.ToArray() };
            bodyMesh.SetIndices(Enumerable.Range(0, skin.Count).ToArray(), MeshTopology.Points, 0);
            bodyMesh.boneWeights = follows.ToArray();
            bodyMesh.bindposes = chain.Select(b => b.worldToLocalMatrix * bodyGo.transform.localToWorldMatrix).ToArray();
            var body = bodyGo.AddComponent<SkinnedMeshRenderer>();
            body.sharedMesh = bodyMesh;
            body.bones = chain.ToArray();
            body.rootBone = root;
            model.Renderers.Add(body);

            var leaf = new Mesh { name = mesh };
            leaf.vertices = new[] { new Vector3(-0.02f, 1, 0.1f), new Vector3(0.02f, 1, 0.1f), new Vector3(-0.02f, 0.9f, 0.1f), new Vector3(0.02f, 0.9f, 0.1f), new Vector3(-0.02f, 0.8f, 0.1f), new Vector3(0.02f, 0.8f, 0.1f) };
            leaf.uv = new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 0.5f), new Vector2(1, 0.5f), new Vector2(0, 1), new Vector2(1, 1) };
            leaf.triangles = new[] { 0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4 };
            leaf.boneWeights = Enumerable.Repeat(new BoneWeight { boneIndex0 = 0, weight0 = 1 }, 6).ToArray();
            leaf.bindposes = new[] { root.worldToLocalMatrix * pivot.localToWorldMatrix };
            leaf.RecalculateNormals();
            var go = new GameObject(mesh);
            go.transform.SetParent(pivot, false);
            var skinned = go.AddComponent<SkinnedMeshRenderer>();
            skinned.sharedMesh = leaf;
            skinned.bones = new[] { root };
            skinned.rootBone = root;
            model.Renderers.Add(skinned);
            return model;
        }
    }
}
#endif
