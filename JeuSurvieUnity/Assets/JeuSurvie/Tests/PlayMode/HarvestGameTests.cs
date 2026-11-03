// The whole harvest in the real game (started like the Play button, the world generated, the camp where the seed puts it):
// pick up the starter tools on the bench, fell the camp's tree, break its rock, mine copper and iron, scythe tall grass,
// pick herbs and flowers, hoe the loose soil — through the same keys a player uses (E, left button, 1–8), never the real
// mouse. Pictures of each step go to Builds/Capture/recolte-*.png for the visual check, and every gesture, her walk and her
// run (empty-handed, then carrying a tool) are filmed frame by frame (recolte-film-<name>-NN.png). Hold times follow the
// gestures' durations (HarvestData.Gestures): blows needed × duration.
#if UNITY_EDITOR
using System.Collections;
using System.IO;
using System.Linq;
using JeuSurvie.Bootstrap;
using JeuSurvie.Core.App;
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Gameplay;
using JeuSurvie.Core.Items;
using JeuSurvie.Gameplay;
using JeuSurvie.InputDevices;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace JeuSurvie.Tests
{
    public class HarvestGameTests
    {
        private const float LoadTimeoutS = 150;
        private GameBootstrap game;
        private GameplayRoot g;

        private IEnumerator Ready()
        {
            float started = Time.realtimeSinceStartup;
            yield return new WaitUntil(() =>
            {
                game = game ?? Object.FindAnyObjectByType<GameBootstrap>();
                g = game != null ? game.Gameplay : null;
                return (g != null && g.World.Loaded(g.Camp.X, g.Camp.Z) && g.World.TryGet(g.Camp.Nodes[0].Id, out _))
                       || Time.realtimeSinceStartup - started > LoadTimeoutS;
            });
            Assert.IsNotNull(g, "le jeu n'a pas démarré");
            Assert.IsTrue(g.World.Loaded(g.Camp.X, g.Camp.Z), "le camp n'est pas chargé");
            game.TestMode = InputMode.Playing;
            yield return new WaitForSecondsRealtime(4); // vegetation, models and shadows settle
        }

        /// <summary>Stands `gap` metres from the surface of `h`, on the camp's side, facing it.</summary>
        private IEnumerator Face(Harvestable h, double gap = 0.7, bool closeUp = false)
        {
            double cx = h.Collider?.X ?? h.X, cz = h.Collider?.Z ?? h.Z, r = h.Collider?.R ?? Harvestable.PlantRadiusM;
            double dx = g.Camp.X - cx, dz = g.Camp.Z - cz, d = System.Math.Sqrt(dx * dx + dz * dz);
            if (d < 1e-3) { dx = 1; dz = 0; d = 1; }
            double x = cx + dx / d * (r + gap), z = cz + dz / d * (r + gap);
            double heading = System.Math.Atan2(cx - x, cz - z);
            if (closeUp) game.PlacePlayerForTests(x, z, heading, heading - 0.75, 2.6, 0.15); // close, three-quarter from her right: the tool in her hand (still aiming)
            else game.PlacePlayerForTests(x, z, heading);
            yield return new WaitForSecondsRealtime(0.4f);
        }

        private IEnumerator Press(GameKey key, float waitS)
        {
            game.TestInput.Pressed.Add(key);
            yield return new WaitForSecondsRealtime(waitS);
        }

        private IEnumerator Hold(float seconds, string pictureAt = null, float pictureAfterS = 0)
        {
            game.TestInput.UseHeld = true;
            if (pictureAt != null)
            {
                yield return new WaitForSecondsRealtime(pictureAfterS);
                Snap(pictureAt);
                yield return new WaitForSecondsRealtime(seconds - pictureAfterS);
            }
            else yield return new WaitForSecondsRealtime(seconds);
            game.TestInput.UseHeld = false;
            yield return new WaitForSecondsRealtime(0.3f);
        }

        private static float DurationOf(Gesture g) => (float)HarvestData.Gestures[g].DurationS;

        /// <summary>Holds the tool for `totalS` seconds in all, filming `frames` pictures `everyS` apart from the start.</summary>
        private IEnumerator HoldFilmed(float totalS, string film, int frames, float everyS)
        {
            float start = Time.realtimeSinceStartup;
            game.TestInput.UseHeld = true;
            yield return Film(film, frames, everyS);
            yield return new WaitForSecondsRealtime(Mathf.Max(0, totalS - (Time.realtimeSinceStartup - start)));
            game.TestInput.UseHeld = false;
            yield return new WaitForSecondsRealtime(0.3f);
        }

        /// <summary>`frames` pictures `everyS` seconds apart (a film to read frame by frame).</summary>
        private static IEnumerator Film(string name, int frames, float everyS)
        {
            for (int i = 0; i < frames; i++)
            {
                float t = Time.realtimeSinceStartup;
                Snap($"film-{name}-{i:00}");
                yield return new WaitForSecondsRealtime(Mathf.Max(0, everyS - (Time.realtimeSinceStartup - t)));
            }
        }

        /// <summary>She goes to the right of the screen (seen from her side) for a while, then is filmed; `slow`: walking. She
        /// starts on the open ground before the camp's bench, the camera close behind her.</summary>
        private IEnumerator FilmGoing(string name, bool slow)
        {
            double heading = g.Camp.TowardSpawn;
            game.PlacePlayerForTests(g.Camp.Bench.X + System.Math.Sin(heading) * 3, g.Camp.Bench.Z + System.Math.Cos(heading) * 3, heading, heading, 3.4, 0.12);
            yield return new WaitForSecondsRealtime(0.4f);
            game.TestInput.Down.Add(GameKey.Right);
            if (slow) game.TestInput.Down.Add(GameKey.Slow);
            yield return new WaitForSecondsRealtime(1.2f); // into her stride
            yield return Film(name, 10, slow ? 0.1f : 0.07f);
            game.TestInput.Down.Clear();
            yield return new WaitForSecondsRealtime(0.6f);
        }

        private IEnumerator Equip(string itemId)
        {
            PlayerItems items = g.State.Items;
            int cell = Enumerable.Range(0, Hotbar.Size).Where(i => items.Inventory.Tool(items.Hotbar[i].ToolId)?.ItemId == itemId)
                .OrderByDescending(i => items.Inventory.Tool(items.Hotbar[i].ToolId).Durability).FirstOrDefault(); // the least worn
            Assert.AreEqual(itemId, items.Inventory.Tool(items.Hotbar[cell].ToolId)?.ItemId, itemId + " dans la barre");
            if (items.Equipped != items.Hotbar[cell].ToolId) yield return Press(GameKey.Hotbar1 + cell, 0.3f);
            Assert.AreEqual(itemId, g.State.Items.EquippedStack?.ItemId);
        }

        private Harvestable Camp(HarvestKind kind, int nth = 0) => g.Camp.Nodes.Where(n => n.Kind == kind).Skip(nth).First();

        private int Count(string item) => g.State.Items.Inventory.CountOf(item);

        [UnityTest]
        [Timeout(420000)]
        public IEnumerator TheWholeHarvestWorksInTheGame()
        {
            LogAssert.ignoreFailingMessages = true;
            yield return Ready();

            // 1. The starter tools lie on the bench: pick them all up (E), the first one goes to the hand.
            var bench = g.Camp.Bench;
            game.PlacePlayerForTests(bench.X + System.Math.Sin(g.Camp.TowardSpawn) * 1.0, bench.Z + System.Math.Cos(g.Camp.TowardSpawn) * 1.0, g.Camp.TowardSpawn + System.Math.PI);
            yield return new WaitForSecondsRealtime(1.5f);
            Snap("1-camp");
            Assert.AreEqual(CampSite.StarterTools.Length, g.State.Loot.All.Count, "les outils attendent sur le banc");
            float pickup = DurationOf(Gesture.Pickup) + 0.2f; // she crouches for each one
            for (int i = 0; i < CampSite.StarterTools.Length; i++) yield return Press(GameKey.Gather, pickup);
            Assert.AreEqual(0, g.State.Loot.All.Count, "tous les outils ont été ramassés");
            Assert.AreEqual(CampSite.StarterTools.Length, g.State.Items.Inventory.Stacks.Count(s => s.IsTool));
            Assert.AreNotEqual(0, g.State.Items.Equipped, "le premier outil ramassé est en main");

            // Her walk and run, carrying a tool (filmed from her side).
            yield return Equip("axe_stone");
            yield return FilmGoing("marche-outil", true);
            yield return FilmGoing("course-outil", false);

            // 2. Fell the camp's tree with the stone axe: wood in the bag, a stump stays.
            Harvestable tree = Camp(HarvestKind.Tree);
            yield return Face(tree, 0.7, true);
            Assert.AreEqual(TargetStatus.Ok, g.State.Target.Status, "l'arbre est visé et peut être abattu");
            yield return SnapWithInterface("2-hache-en-main");
            float chop = DurationOf(Gesture.Chop);
            yield return HoldFilmed(5.6f * chop, "hache", 12, chop / 11); // 6 blows; released before a 7th starts on the stump
            yield return Face(tree);
            Assert.That(Count("wood"), Is.InRange(4, 6), "bûches reçues");
            Assert.AreEqual(NodePhase.Stump, g.State.World[tree.Id].Phase);
            yield return new WaitForSecondsRealtime(0.6f);
            Snap("4-arbre-qui-tombe");
            yield return new WaitForSecondsRealtime(3f);
            Snap("5-souche");

            // 3. Rock, copper and iron with the pickaxes (iron needs copper).
            yield return Equip("pickaxe_stone");
            Harvestable rock = Camp(HarvestKind.Rock);
            yield return Face(rock, 0.5, true);
            float strike = DurationOf(Gesture.Overhead);
            yield return HoldFilmed(9 * strike + 0.5f, "pioche", 12, strike / 11); // 3 stages × 3 blows of a stone pickaxe
            Assert.GreaterOrEqual(Count("stone"), 6, "pierres reçues");
            Assert.AreEqual(NodePhase.Depleted, g.State.World[rock.Id].Phase);
            Harvestable iron = Camp(HarvestKind.IronOre);
            yield return Face(iron, 0.5);
            yield return Hold(1.5f);
            Assert.IsTrue(g.State.World[iron.Id].IsFresh, "le fer résiste à la pioche de pierre");
            yield return Equip("pickaxe_copper");
            yield return Hold(8 * strike + 0.6f); // 2 stages × 4 blows of a copper pickaxe
            Assert.GreaterOrEqual(Count("iron_ore"), 2, "minerai de fer reçu (deux étapes)");
            Harvestable copper = Camp(HarvestKind.CopperOre);
            yield return Face(copper, 0.5);
            yield return Hold(6 * strike + 0.5f, "7-cuivre", 0.65f);
            Assert.GreaterOrEqual(Count("copper_ore"), 2, "minerai de cuivre reçu");

            // 4. Plants: the sickle on tall grass, hands on herbs and flowers, a branch.
            yield return Equip("sickle_stone");
            yield return Face(Camp(HarvestKind.TallGrass), 0.6, true);
            float sweep = DurationOf(Gesture.Sweep);
            yield return HoldFilmed(sweep + 0.2f, "faucille", 14, sweep / 13);
            Assert.GreaterOrEqual(Count("fibre"), 2, "fibres reçues");
            yield return Press(GameKey.Hotbar1 + g.State.Items.Hotbar.CellOf(g.State.Items.Equipped), 0.3f); // put the sickle away
            Assert.AreEqual(0, g.State.Items.Equipped);
            yield return FilmGoing("marche", true);
            yield return FilmGoing("course", false);
            foreach (HarvestKind k in new[] { HarvestKind.Herb, HarvestKind.FlowerRose, HarvestKind.FlowerGold, HarvestKind.Branch })
            {
                yield return Face(Camp(k), 0.6, true);
                Gesture gesture = HarvestData.Rules[k].Gesture;
                float d = DurationOf(gesture) + 0.25f;
                game.TestInput.Pressed.Add(GameKey.Gather);
                if (k == HarvestKind.FlowerGold) yield return new WaitForSecondsRealtime(d);
                else yield return Film(k == HarvestKind.Herb ? "arracher" : k == HarvestKind.FlowerRose ? "cueillette" : "ramasser", 14, d / 14);
            }
            Assert.GreaterOrEqual(Count("herb"), 1);
            Assert.GreaterOrEqual(Count("flower_rose"), 1);
            Assert.GreaterOrEqual(Count("flower_gold"), 1);
            Assert.GreaterOrEqual(Count("branch"), 1);

            // 5. The hoe on loose soil: roots, and the soil stays tilled.
            yield return Equip("hoe_stone");
            Harvestable soil = Camp(HarvestKind.Soil);
            yield return Face(soil, 0.6, true);
            float dig = DurationOf(Gesture.Dig);
            yield return HoldFilmed(2 * dig + 0.3f, "houe", 12, dig / 11); // 2 blows of a stone hoe
            Assert.GreaterOrEqual(Count("root"), 1, "racines reçues");
            Assert.AreEqual(NodePhase.Tilled, g.State.World[soil.Id].Phase);
            yield return new WaitForSecondsRealtime(0.5f);
            Snap("11-terre-labouree");

            // The bag (Tab): what was gathered, with its counts and the tools' wear; the world is not touched meanwhile.
            game.TestMode = InputMode.Menu;
            g.OpenInventory();
            game.TestInput.UseHeld = true;
            yield return new WaitForSecondsRealtime(0.8f);
            Assert.AreEqual(ActionPhase.Idle, g.State.Action.Phase, "sac ouvert : aucun coup dans le monde");
            game.TestInput.UseHeld = false;
            yield return SnapWithInterface("13-sac");
            g.CloseInventory();
            game.TestMode = InputMode.Playing;
            yield return new WaitForSecondsRealtime(0.3f);

            // 6. The old axe breaks after its last blows and is refused afterwards.
            yield return Equip("axe_stone");
            long good = g.State.Items.Equipped;
            long old = g.State.Items.Inventory.Stacks.First(s => s.ItemId == "axe_stone" && s.ToolId != good).ToolId;
            Assert.Less(g.State.Items.Inventory.Tool(old).Durability, 10, "la vieille hache est presque cassée");
            yield return Face(Camp(HarvestKind.Stump), 0.6);
            yield return Press(GameKey.Hotbar1 + g.State.Items.Hotbar.CellOf(old), 0.3f);
            yield return Hold(4.7f * DurationOf(Gesture.Chop));
            Assert.IsTrue(g.State.Items.Inventory.Tool(old).IsBroken, "la vieille hache s'est cassée");
            Snap("12-outil-casse");
        }

        private const int Width = 1280, Height = 720;

        private static void Snap(string name) => Save(name, Scene());

        private static Texture2D Scene()
        {
            Camera cam = Camera.main;
            var tex = new Texture2D(Width, Height, TextureFormat.RGBA32, false);
            if (cam == null) return tex;
            var rt = new RenderTexture(Width, Height, 24);
            RenderTexture previous = cam.targetTexture;
            cam.targetTexture = rt;
            cam.Render();
            cam.targetTexture = previous;
            RenderTexture.active = rt;
            tex.ReadPixels(new Rect(0, 0, Width, Height), 0, 0);
            RenderTexture.active = null;
            rt.Release();
            Object.Destroy(rt);
            return tex;
        }

        /// <summary>The scene with the interface over it (batch mode has no screen: the interface is drawn into a texture).</summary>
        private static IEnumerator SnapWithInterface(string name)
        {
            var doc = Object.FindAnyObjectByType<UnityEngine.UIElements.UIDocument>();
            var ui = new RenderTexture(Width, Height, 0, RenderTextureFormat.ARGB32);
            if (doc != null) doc.panelSettings.targetTexture = ui;
            yield return null;
            yield return null;
            Texture2D scene = Scene();
            RenderTexture.active = ui;
            var over = new Texture2D(Width, Height, TextureFormat.RGBA32, false);
            over.ReadPixels(new Rect(0, 0, Width, Height), 0, 0);
            RenderTexture.active = null;
            if (doc != null) doc.panelSettings.targetTexture = null;
            Color[] a = scene.GetPixels(), b = over.GetPixels();
            for (int i = 0; i < a.Length; i++) a[i] = Color.Lerp(a[i], new Color(b[i].r, b[i].g, b[i].b, 1), b[i].a);
            scene.SetPixels(a);
            Save(name, scene);
            ui.Release();
            Object.Destroy(ui);
            Object.Destroy(over);
        }

        private static void Save(string name, Texture2D tex)
        {
            string dir = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "Builds", "Capture"));
            Directory.CreateDirectory(dir);
            File.WriteAllBytes(Path.Combine(dir, "recolte-" + name + ".png"), tex.EncodeToPNG());
            Object.Destroy(tex);
        }
    }
}
#endif
