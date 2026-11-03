// Her left hand on the handle of the axe, the pickaxe and the hoe (HandIk): all along each swing, once it has joined her
// right hand, the middle of her left fist is on the handle (the same middle of the fist the tool is put in on her right),
// at its place up the handle (AnimationData.SecondGripAlongHandleM) and not off its end, the handle running across her
// fist. Every tool of these kinds is measured (their handles differ), the gesture's time stepped from its start to its end.
#if UNITY_EDITOR
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using JeuSurvie.Characters;
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Gameplay;
using JeuSurvie.Core.Items;
using JeuSurvie.Vegetation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace JeuSurvie.Tests
{
    public class HandOnHandleTests
    {
        private static string ModelsDir => Path.Combine(Application.streamingAssetsPath, "assets", "models");
        private static string HeroineDir => Path.Combine(ModelsDir, "characters", "heroine");

        /// <summary>The fist's middle within the handle's half-thickness and a little play of its axis (m), this close to its
        /// place up the handle (m); the handle across the fist (degrees off the knuckles' line); the fist at least this far
        /// up from the handle's end (m).</summary>
        private const float OnHandleM = 0.03f, AtItsPlaceM = 0.02f, AcrossDeg = 25, FromTheEndM = 0.03f;
        private const int Steps = 40;

        [UnityTest]
        public IEnumerator HerLeftFistStaysOnTheHandleThroughEveryTwoHandedSwing()
        {
            string heroinePath = Path.Combine(HeroineDir, "heroine.gltf"), clipsPath = Path.Combine(HeroineDir, "animations.gltf");
            Assume.That(File.Exists(heroinePath) && File.Exists(clipsPath), "personnage ou animations absents");
            Shader pbr = Shader.Find("JeuSurvie/NaturePBR");
            Task<AnimatedModel> load = CharacterLoader.LoadAsync(heroinePath, 1.7, pbr);
            yield return new WaitUntil(() => load.IsCompleted);
            Assert.IsTrue(load.Status == TaskStatus.RanToCompletion, "chargement raté : " + load.Exception?.GetBaseException().Message);
            AnimatedModel model = load.Result;
            try
            {
                var clips = ClipLibrary.AddAsync(model, clipsPath, Path.ChangeExtension(clipsPath, ".json"));
                yield return new WaitUntil(() => clips.IsCompleted);
                Assert.IsTrue(clips.Status == TaskStatus.RanToCompletion, "animations illisibles : " + clips.Exception?.GetBaseException().Message);
                ItemDef[] tools = ItemCatalog.All.Where(d => d.IsTool && AnimationData.TwoHanded(Targeting.GestureOf(d.Tool.Type))).ToArray();
                var objects = new ModelLibrary(Path.Combine(ModelsDir, "objets"), Shader.Find("JeuSurvie/Foliage"), pbr);
                Task loadTools = objects.LoadAsync(tools.Select(d => d.Model));
                yield return new WaitUntil(() => loadTools.IsCompleted);
                Assert.IsTrue(loadTools.Status == TaskStatus.RanToCompletion, "outils illisibles : " + loadTools.Exception?.GetBaseException().Message);

                model.Pivot.position = new Vector3(-500, 0, 0); // away from the game the bootstrap starts in every PlayMode test
                var inHand = new ToolInHand(model, objects);
                var gestures = new GestureLayer(model, clips.Result);
                Assert.IsNotNull(HandIk.Attach(model, inHand, gestures), "bras gauche incomplet");
                Assert.IsTrue(Fist.TryOf(model, "l", out Transform left, out Fist leftFist));
                Transform shoulder = model.Nodes["upperarm_l"];

                var misses = new List<string>();
                foreach (ItemDef tool in tools)
                {
                    inHand.Show(tool.Id);
                    Transform held = inHand.Current;
                    Assert.IsNotNull(held, tool.Id + " pas en main");
                    float end = held.GetComponentsInChildren<MeshFilter>().Min(f => f.sharedMesh.bounds.min.y);
                    float place = (float)AnimationData.SecondGripAlongHandleM(tool.Tool.Type);
                    Gesture gesture = Targeting.GestureOf(tool.Tool.Type);
                    float worst = float.NegativeInfinity;
                    string report = null;
                    for (int i = 0; i <= Steps; i++)
                    {
                        double progress = (double)i / Steps;
                        gestures.Show(gesture, progress, true, 1); // a long frame: the gesture and both grips fully in
                        yield return null; // posed, her left arm bent (LateUpdate); read before the next frame poses her again
                        Assert.AreEqual(1, gestures.LeftHandOnHandle, 1e-6);
                        Vector3 fist = left.TransformPoint(leftFist.Centre), v = fist - held.position;
                        float along = Vector3.Dot(v, held.up), off = (v - along * held.up).magnitude;
                        float across = Vector3.Angle(left.TransformDirection(leftFist.Handle), held.up);
                        across = Mathf.Min(across, 180 - across);
                        // Each fault as a share of its tolerance (above 0: out of it), the worst one kept for the report.
                        float miss = Mathf.Max(off / OnHandleM - 1, Mathf.Abs(along - place) / AtItsPlaceM - 1, across / AcrossDeg - 1,
                                               (end + FromTheEndM - along) / FromTheEndM);
                        if (miss <= worst) continue;
                        worst = miss;
                        float reach = (fist - shoulder.position).magnitude;
                        report = $"{tool.Id} à {progress:P0} du geste : poing à {off * 100:0.0} cm du manche, à {along * 100:0} cm de la main droite "
                                 + $"(sa place : {place * 100:0} cm ; bout du manche à {end * 100:0} cm), manche à {across:0}° du travers du poing, "
                                 + $"épaule–poing {reach * 100:0} cm";
                    }
                    Debug.Log("[test main gauche] " + report);
                    if (worst > 0) misses.Add(report);
                }
                Assert.IsEmpty(misses, "la main gauche lâche le manche — " + string.Join(" ; ", misses));
            }
            finally { Object.Destroy(model.Pivot.gameObject); }
        }
    }
}
#endif
