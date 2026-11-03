// The harvest as a player lives it, frame by frame (30 frames a second, no Unity): pick up a tool, work a tree, a rock,
// a flower; and everything that must NOT happen — the wrong tool, a broken tool, a full bag, too far, through a trunk,
// an interrupted gesture, a depleted thing, a regrowth under the player's eyes.
using System.Collections.Generic;
using System.Linq;
using JeuSurvie.Core.App;
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Gameplay;
using JeuSurvie.Core.Items;
using JeuSurvie.Core.Physics;
using JeuSurvie.Core.Shared;
using JeuSurvie.Core.World;
using NUnit.Framework;

namespace JeuSurvie.Tests
{
    public class HarvestTests
    {
        internal sealed class FakeWorld : IWorldQuery
        {
            public readonly List<Harvestable> Nodes = new List<Harvestable>();
            public readonly List<Circle> Extra = new List<Circle>();
            public uint Seed => 42;
            public void Near(double x, double z, double radius, List<Harvestable> into) =>
                into.AddRange(Nodes.Where(h => MathUtil.Hypot(h.X - x, h.Z - z) <= radius + 3));
            public bool TryGet(NodeId id, out Harvestable node) => (node = Nodes.FirstOrDefault(h => h.Id.Equals(id))) != null;
            public double? GroundAt(double x, double z) => 0;
            public bool Loaded(double x, double z) => true;
            public void ObstaclesNear(double x, double z, double radius, List<Circle> into) => into.AddRange(Extra);
        }

        private const double Dt = 1.0 / 30;
        private static readonly Vec3 Origin = new Vec3(0, 0, 0);

        private static Harvestable Node(int i, HarvestKind kind, string model, double x, double z, double scale = 1) =>
            new Harvestable(new NodeId(NodeLayer.Camp, i, 0), kind, model, x, z, 0, scale);

        private static GameplayState WithTool(string itemId, int? durability = null, GameplayState s = null)
        {
            s = s ?? new GameplayState(PlayerItems.Initial, WorldOverlay.Empty, LootList.Empty, ActionState.Idle, Target.None, 1, 1);
            PlayerItems items = s.Items.Receive(s.Items.NewTool(itemId, durability)).Next;
            // In game, playing and with the button released once: the next press strikes.
            return s.With(items: items.Equip(items.Inventory.Stacks.Last(st => st.IsTool).ToolId), action: new ActionState(ActionPhase.Idle, default, 0, true));
        }

        /// <summary>Plays `seconds` of game with these intentions; returns every event.</summary>
        private static List<GameplayEvent> Play(ref GameplayState s, FakeWorld w, double seconds, bool use = false, bool gather = false,
            bool moving = false, Vec3? at = null, double yaw = 0, bool allowed = true, long startTick = 0)
        {
            var all = new List<GameplayEvent>();
            int frames = (int)System.Math.Round(seconds / Dt);
            for (int f = 0; f < frames; f++)
            {
                var input = new GameplayInput(at ?? Origin, yaw, use, gather && f == 0, moving, -1, allowed);
                StepResult r = GameplaySimulation.Step(s, input, w, startTick + f, Dt);
                s = r.Next;
                all.AddRange(r.Events);
            }
            return all;
        }

        private static int Count(List<GameplayEvent> e, GameplayEventType t) => e.Count(x => x.Type == t);

        [Test]
        public void EveryKindHasARuleWhoseYieldExistsAndAGesture()
        {
            foreach (HarvestKind k in System.Enum.GetValues(typeof(HarvestKind)))
            {
                Assert.IsTrue(HarvestData.Rules.ContainsKey(k), k.ToString());
                HarvestRule r = HarvestData.Rules[k];
                Assert.IsTrue(ItemCatalog.TryGet(r.PerStage.ItemId, out _), k.ToString());
                Assert.LessOrEqual(r.PerStage.Min, r.PerStage.Max);
                Assert.IsTrue(HarvestData.Gestures.ContainsKey(r.Gesture));
            }
            Assert.AreEqual(2, HarvestData.Rules[HarvestKind.IronOre].MinTier, "le fer demande une pioche de cuivre ou mieux");
        }

        [Test]
        public void ChoppingATreeWithTheStoneAxeTakesSixBlowsGivesWoodAndLeavesAStump()
        {
            var w = new FakeWorld();
            Harvestable tree = Node(0, HarvestKind.Tree, "CommonTree_2", 0, 1.6);
            w.Nodes.Add(tree);
            GameplayState s = WithTool("axe_stone");
            List<GameplayEvent> e = Play(ref s, w, 5.6, use: true);
            Assert.AreEqual(6, Count(e, GameplayEventType.Impact), "6 coups d'une hache de pierre");
            Assert.AreEqual(1, Count(e, GameplayEventType.Felled));
            int wood = s.Items.Inventory.CountOf("wood");
            Assert.That(wood, Is.InRange(4, 6));
            Assert.AreEqual(wood, e.Where(x => x.Type == GameplayEventType.Gained).Sum(x => x.Count), "ce qui est annoncé est ce qui est reçu");
            Assert.AreEqual(NodePhase.Stump, s.World[tree.Id].Phase);
            Assert.AreEqual(40 - 6, s.Items.EquippedStack.Durability, "une usure par coup valide");
            Assert.AreEqual(HarvestKind.Stump, s.Target.Kind, "la souche se travaille ensuite à la hache");
        }

        [Test]
        public void LookingAwayKeepsTheWorkGoingWhileTheButtonIsHeld()
        {
            var w = new FakeWorld();
            w.Nodes.Add(Node(0, HarvestKind.Tree, "CommonTree_2", 0, 1.6));
            GameplayState s = WithTool("axe_stone");
            double chop = HarvestData.Gestures[Gesture.Chop].DurationS;
            List<GameplayEvent> e = Play(ref s, w, chop * 0.3, use: true); // the first blow starts on the tree before her
            e.AddRange(Play(ref s, w, chop * 3, use: true, yaw: System.Math.PI, startTick: 1000)); // the camera turns away
            Assert.AreEqual(3, Count(e, GameplayEventType.Impact), "le travail continue même en regardant ailleurs");
            Assert.AreEqual(0, Count(e, GameplayEventType.SwingCancelled));
            Play(ref s, w, chop, yaw: System.Math.PI, startTick: 5000); // the blow already swung lands
            e = Play(ref s, w, chop * 2, yaw: System.Math.PI, startTick: 6000);
            Assert.AreEqual(0, Count(e, GameplayEventType.Impact), "le clic lâché, le travail s'arrête");
        }

        [Test]
        public void BetterToolsNeedFewerBlows()
        {
            foreach (var (tool, blows) in new[] { ("axe_copper", 4), ("axe_iron", 3) })
            {
                var w = new FakeWorld();
                w.Nodes.Add(Node(0, HarvestKind.Tree, "CommonTree_2", 0, 1.6));
                GameplayState s = WithTool(tool);
                List<GameplayEvent> e = Play(ref s, w, blows * HarvestData.Gestures[Gesture.Chop].DurationS + 0.3, use: true);
                Assert.AreEqual(1, Count(e, GameplayEventType.Felled), tool);
                Assert.AreEqual(blows, Count(e, GameplayEventType.Impact), tool);
            }
        }

        [Test]
        public void WrongToolTooWeakToolOrBareHandsAreRefusedWithTheRightMessage()
        {
            var w = new FakeWorld();
            w.Nodes.Add(Node(0, HarvestKind.Tree, "CommonTree_2", 0, 1.6));
            GameplayState s = WithTool("pickaxe_stone");
            List<GameplayEvent> e = Play(ref s, w, 2, use: true);
            Assert.AreEqual(0, Count(e, GameplayEventType.SwingStarted));
            Assert.AreEqual(1, Count(e, GameplayEventType.Refused), "un seul message tant que le bouton reste appuyé");
            Assert.AreEqual("Il faut une hache", e.First(x => x.Type == GameplayEventType.Refused).Text);

            Play(ref s, w, 0.1); // the button is released
            w.Nodes.Clear();
            w.Nodes.Add(Node(1, HarvestKind.IronOre, "Gisement_Fer_1", 0, 1.8, 0.5));
            e = Play(ref s, w, 1, use: true);
            Assert.AreEqual("Il faut une pioche en cuivre ou mieux", e.First(x => x.Type == GameplayEventType.Refused).Text);
            s = WithTool("pickaxe_copper", null, s);
            e = Play(ref s, w, 1.2, use: false);
            e = Play(ref s, w, 1.2, use: true);
            Assert.AreEqual(1, Count(e, GameplayEventType.Impact), "la pioche de cuivre extrait le fer");
        }

        [Test]
        public void ABrokenToolStopsWorkingWithAClearMessage()
        {
            var w = new FakeWorld();
            w.Nodes.Add(Node(0, HarvestKind.Tree, "CommonTree_2", 0, 1.6));
            GameplayState s = WithTool("axe_stone", 1);
            List<GameplayEvent> e = Play(ref s, w, 1.2, use: true);
            Assert.AreEqual(1, Count(e, GameplayEventType.ToolBroken));
            Assert.IsTrue(s.Items.EquippedStack.IsBroken);
            Assert.AreEqual(TargetStatus.ToolBroken, s.Target.Status);
            e = Play(ref s, w, 0.2, use: false);
            e = Play(ref s, w, 1.5, use: true);
            Assert.AreEqual(0, Count(e, GameplayEventType.Impact));
            StringAssert.StartsWith("Ta hache en pierre est cassée", e.First(x => x.Type == GameplayEventType.Refused).Text);
            Assert.AreEqual(1, s.Items.Inventory.Stacks.Count(st => st.IsTool), "l'outil cassé reste dans le sac");
        }

        [Test]
        public void AFullBagRefusesBeforeConsumingAndAPartialYieldLeavesTheRestOnTheGround()
        {
            var w = new FakeWorld();
            Harvestable flowers = Node(0, HarvestKind.FlowerRose, "Flower_3_Group", 0, 1.0);
            w.Nodes.Add(flowers);
            GameplayState s = new GameplayState(PlayerItems.Initial, WorldOverlay.Empty, LootList.Empty, ActionState.Idle, Target.None, 1, 1);
            Inventory full = Inventory.Empty();
            for (int i = 0; i < full.Size; i++) full = full.Add(ItemStack.Of("stone", 50), AddMode.AllOrNothing).Next;
            s = s.With(items: s.Items.WithInventory(full));
            List<GameplayEvent> e = Play(ref s, w, 1.5, gather: true);
            Assert.AreEqual(0, Count(e, GameplayEventType.SwingStarted));
            Assert.AreEqual(PromptText.Full, e.First(x => x.Type == GameplayEventType.Refused).Text);
            Assert.IsTrue(s.World[flowers.Id].IsFresh, "la fleur n'a pas été consommée");

            // Room for exactly one rose: the rest of the bunch is left on the ground, nothing disappears.
            Inventory almost = full.Remove(0, 50, out _).Add(ItemStack.Of("flower_rose", 29), AddMode.AllOrNothing).Next;
            s = s.With(items: s.Items.WithInventory(almost));
            e = Play(ref s, w, 1.5, gather: true);
            int rolled = GameplaySimulation.YieldRoll(w.Seed, flowers.Id, 0, 1, HarvestData.Rules[HarvestKind.FlowerRose].PerStage);
            Assert.AreEqual(30, s.Items.Inventory.CountOf("flower_rose"));
            Assert.AreEqual(rolled - 1, s.Loot.All.Where(l => l.Stack.ItemId == "flower_rose").Sum(l => l.Stack.Count));
            if (rolled > 1) Assert.AreEqual(1, Count(e, GameplayEventType.SurplusDropped));
        }

        [Test]
        public void TooFarAndBehindATrunkCannotBeWorked()
        {
            var w = new FakeWorld();
            w.Nodes.Add(Node(0, HarvestKind.Rock, "Rock_Medium_2", 0, 3.6, 0.6));
            GameplayState s = WithTool("pickaxe_stone");
            Play(ref s, w, 0.1);
            Assert.AreEqual(TargetStatus.TooFar, s.Target.Status);

            w.Nodes.Clear();
            Harvestable rose = Node(1, HarvestKind.FlowerRose, "Flower_3_Group", 0, 1.4);
            w.Nodes.Add(rose);
            w.Extra.Add(new Circle(0, 0.75, 0.3, 2)); // something solid between the player and the flower
            List<GameplayEvent> e = Play(ref s, w, 1.5, gather: true);
            Assert.AreEqual(TargetStatus.Blocked, s.Target.Status);
            Assert.AreEqual(0, Count(e, GameplayEventType.SwingStarted));
        }

        [Test]
        public void AnInterruptedGestureGivesNothingAndCostsNothing()
        {
            var w = new FakeWorld();
            w.Nodes.Add(Node(0, HarvestKind.Tree, "CommonTree_2", 0, 1.6));
            GameplayState s = WithTool("axe_stone");
            List<GameplayEvent> e = Play(ref s, w, 0.3, use: true);
            Assert.AreEqual(1, Count(e, GameplayEventType.SwingStarted));
            e = Play(ref s, w, 1, moving: true);
            Assert.AreEqual(1, Count(e, GameplayEventType.SwingCancelled));
            Assert.AreEqual(0, Count(e, GameplayEventType.Impact));
            Assert.AreEqual(40, s.Items.EquippedStack.Durability);
            Assert.IsTrue(s.World[w.Nodes[0].Id].IsFresh);

            // Opening the bag during a gesture cancels it as well, and nothing is aimed at while it is open.
            e = Play(ref s, w, 0.3, use: false);
            e = Play(ref s, w, 0.3, use: true);
            e.AddRange(Play(ref s, w, 1, use: true, allowed: false));
            Assert.AreEqual(1, Count(e, GameplayEventType.SwingCancelled));
            Assert.AreEqual(0, Count(e, GameplayEventType.Impact));
            Assert.IsTrue(s.Target.IsNone);
        }

        [Test]
        public void AClickThatOpenedTheGameDoesNotStrike()
        {
            var w = new FakeWorld();
            w.Nodes.Add(Node(0, HarvestKind.Tree, "CommonTree_2", 0, 1.6));
            GameplayState s = WithTool("axe_stone");
            List<GameplayEvent> e = Play(ref s, w, 0.5, use: true, allowed: false);
            e.AddRange(Play(ref s, w, 1.5, use: true));
            Assert.AreEqual(0, Count(e, GameplayEventType.SwingStarted), "le bouton doit d'abord être relâché");
        }

        [Test]
        public void PickingUpAToolPutsItInHandAndDroppingItLeavesItOnTheGround()
        {
            var w = new FakeWorld();
            var drop = new LootDrop(5, ItemStack.NewTool("sickle_stone", 9), 0, 0.4, 0.9);
            GameplayState s = new GameplayState(PlayerItems.Initial, WorldOverlay.Empty, LootList.Of(new[] { drop }), ActionState.Idle, Target.None, 6, 1);
            double pickup = HarvestData.Gestures[Gesture.Pickup].DurationS + 0.1; // the whole crouch, up again
            List<GameplayEvent> e = Play(ref s, w, pickup, gather: true);
            Assert.AreEqual(1, Count(e, GameplayEventType.PickedUp));
            Assert.AreEqual(9, s.Items.Equipped);
            Assert.AreEqual(9, s.Items.Hotbar[0].ToolId);
            Assert.AreEqual(0, s.Loot.All.Count);

            StepResult r = GameplaySimulation.Apply(s, InventoryCommand.Drop(0), w, Origin, 0);
            s = r.Next;
            Assert.AreEqual(0, s.Items.Equipped, "l'outil posé n'est plus en main");
            Assert.AreEqual(1, s.Loot.All.Count);
            Assert.AreEqual(9, s.Loot.All[0].Stack.ToolId, "c'est le même outil, avec son usure");
            e = Play(ref s, w, pickup, gather: true);
            Assert.AreEqual(1, s.Items.Inventory.Stacks.Count());
        }

        [Test]
        public void ADepletedThingCannotBeHarvestedTwiceAndGrowsBackOnlyOutOfSight()
        {
            var w = new FakeWorld();
            Harvestable herb = Node(0, HarvestKind.Herb, "Herbe_Sauvage", 0, 1.0);
            w.Nodes.Add(herb);
            GameplayState s = new GameplayState(PlayerItems.Initial, WorldOverlay.Empty, LootList.Empty, ActionState.Idle, Target.None, 1, 1);
            Play(ref s, w, 1.5, gather: true);
            Assert.AreEqual(NodePhase.Depleted, s.World[herb.Id].Phase);
            int herbs = s.Items.Inventory.CountOf("herb");
            List<GameplayEvent> e = Play(ref s, w, 1.5, gather: true);
            Assert.AreEqual(herbs, s.Items.Inventory.CountOf("herb"));
            Assert.IsTrue(s.Target.IsNone);

            long due = s.World[herb.Id].RespawnAt;
            var view = new Core.RenderData.ViewCull(Core.RenderData.ViewSectors.For(0, 1, 1.6), 0, -5);
            StepResult r = GameplaySimulation.Regrow(s, w, due, 0, 0, view);
            Assert.AreEqual(NodePhase.Depleted, r.Next.World[herb.Id].Phase, "pas sous les yeux du joueur");
            Assert.Greater(r.Next.World[herb.Id].RespawnAt, due);
            r = GameplaySimulation.Regrow(s, w, due, 0, 60, view);
            Assert.AreEqual(NodePhase.Regrowing, r.Next.World[herb.Id].Phase, "loin du joueur, elle repousse");
            r = GameplaySimulation.Regrow(r.Next, w, due + 60, 0, 60, view);
            Assert.IsTrue(r.Next.World[herb.Id].IsFresh);
        }

        [Test]
        public void HerbsGiveMoreWithTheSickleAndTallGrassNeedsIt()
        {
            var w = new FakeWorld();
            Harvestable herb = Node(0, HarvestKind.Herb, "Herbe_Sauvage", 0, 1.0);
            w.Nodes.Add(herb);
            GameplayState s = WithTool("sickle_stone");
            Play(ref s, w, 1.5, use: true);
            int byHand = GameplaySimulation.YieldRoll(w.Seed, herb.Id, 0, 1, HarvestData.Rules[HarvestKind.Herb].PerStage);
            Assert.AreEqual(byHand + 1, s.Items.Inventory.CountOf("herb"));

            w.Nodes.Clear();
            w.Nodes.Add(Node(1, HarvestKind.TallGrass, "Grass_Common_Tall", 0, 1.0));
            GameplayState hands = new GameplayState(PlayerItems.Initial, WorldOverlay.Empty, LootList.Empty, ActionState.Idle, Target.None, 1, 1);
            Play(ref hands, w, 0.1);
            Assert.AreEqual(TargetStatus.NeedsTool, hands.Target.Status);
        }

        [Test]
        public void RocksShrinkStageByStageAndTheBagGetsStoneEachTime()
        {
            var w = new FakeWorld();
            Harvestable rock = Node(0, HarvestKind.Rock, "Rock_Medium_2", 0, 1.7, 0.6); // close enough to reach it once it has shrunk
            w.Nodes.Add(rock);
            GameplayState s = WithTool("pickaxe_iron");
            List<GameplayEvent> e = Play(ref s, w, 1.1 * 2 + 0.2, use: true);
            Assert.AreEqual(1, s.World[rock.Id].Stage);
            Assert.Less(NodeViews.Of(rock, s.World[rock.Id], 0).Scale, rock.Scale);
            Assert.That(s.Items.Inventory.CountOf("stone"), Is.InRange(2, 3));
            Play(ref s, w, 1.1 * 4 + 0.3, use: true);
            Assert.AreEqual(NodePhase.Depleted, s.World[rock.Id].Phase);
            Assert.IsNull(NodeViews.Of(rock, s.World[rock.Id], 0).Collider, "un rocher épuisé ne bloque plus le passage");
        }

        [Test]
        public void YieldsAreDeterministicAndInRange()
        {
            var id = new NodeId(NodeLayer.Resource, 12, -3);
            var y = new Yield("wood", 4, 6);
            for (int hits = 1; hits < 40; hits++)
            {
                int a = GameplaySimulation.YieldRoll(1234, id, 0, hits, y);
                Assert.AreEqual(a, GameplaySimulation.YieldRoll(1234, id, 0, hits, y));
                Assert.That(a, Is.InRange(4, 6));
            }
        }

        [Test]
        public void FeaturesAreDeterministicAndNeverOnATreeARockOrTheCamp()
        {
            const uint seed = 12345;
            CampSite camp = CampSite.Find(seed, 0, 0, 0.6);
            var kinds = new HashSet<HarvestKind>();
            for (int cx = -3; cx <= 3; cx++)
                for (int cz = -3; cz <= 3; cz++)
                {
                    List<Harvestable> a = Features.InChunk(seed, cx, cz, camp), b = Features.InChunk(seed, cx, cz, camp);
                    CollectionAssert.AreEqual(a.Select(h => h.Id.ToString() + h.Model + h.X), b.Select(h => h.Id.ToString() + h.Model + h.X));
                    List<Resource> placed = Placement.InCells(seed, cx * 8 - 2, cz * 8 - 2, cx * 8 + 10, cz * 8 + 10);
                    foreach (Harvestable h in a)
                    {
                        kinds.Add(h.Kind);
                        Assert.IsFalse(camp.Covers(h.X, h.Z, 1), "rien du décor dans le camp");
                        double foot = h.Collider?.R ?? 0.3;
                        foreach (Resource r in placed)
                        {
                            Circle? c = Colliders.ColliderOf(r);
                            if (c != null) Assert.Greater(MathUtil.Hypot((h.Collider?.X ?? h.X) - c.Value.X, (h.Collider?.Z ?? h.Z) - c.Value.Z), c.Value.R + foot, $"{h.Id} dans {r.Id}");
                        }
                    }
                }
            Assert.Greater(kinds.Count, 3, "la couche donne plusieurs sortes de choses à récolter");
            Assert.That(Features.SaltKind, Is.GreaterThanOrEqualTo(1000), "les sels du monde scellé ne sont jamais réutilisés");
        }

        [Test]
        public void TheCampIsClearDeterministicAndHoldsEveryCategoryAndTheStarterTools()
        {
            const uint seed = 777;
            CampSite a = CampSite.Find(seed, 0, 0, 0.6), b = CampSite.Find(seed, 0, 0, 0.6);
            Assert.AreEqual(a.X, b.X);
            Assert.AreEqual(a.Z, b.Z);
            Assert.Greater(MathUtil.Hypot(a.X, a.Z), CampSite.RadiusM, "on n'arrive pas dans le camp");
            var kinds = new HashSet<HarvestKind>(a.Nodes.Select(n => n.Kind));
            foreach (HarvestKind k in new[] { HarvestKind.Tree, HarvestKind.Stump, HarvestKind.Branch, HarvestKind.Rock, HarvestKind.CopperOre,
                         HarvestKind.IronOre, HarvestKind.TallGrass, HarvestKind.Herb, HarvestKind.FlowerRose, HarvestKind.FlowerGold, HarvestKind.Soil })
                Assert.IsTrue(kinds.Contains(k), k.ToString());
            GameplayState s = GameplayState.Initial(a, (x, z) => 0);
            Assert.AreEqual(CampSite.StarterTools.Length, s.Loot.All.Count);
            Assert.AreEqual(CampSite.StarterTools.Length, s.Loot.All.Select(l => l.Stack.ToolId).Distinct().Count());
            Assert.Greater(s.Items.NextToolId, s.Loot.All.Max(l => l.Stack.ToolId), "les outils du camp ne réutilisent jamais un numéro");
        }

        [Test]
        public void OverlayInstancesReplaceAFelledTreeByItsStumpAndShrinkRocks()
        {
            var tree = new Harvestable(new NodeId(NodeLayer.Resource, 1, 1), HarvestKind.Tree, "CommonTree_2", 10, 20, 0, 1);
            var rock = new Harvestable(new NodeId(NodeLayer.Resource, 2, 1), HarvestKind.Rock, "Rock_Medium_2", 30, 20, 0, 1);
            float[] Matrix(double x, double z) => new float[] { 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, (float)x, 4.85f, (float)z, 1 };
            var batches = new Dictionary<string, float[]> { { "CommonTree_2", Matrix(10, 20).Concat(Matrix(50, 50)).ToArray() }, { "Rock_Medium_2", Matrix(30, 20) } };
            WorldOverlay o = WorldOverlay.Empty.With(tree.Id, new NodeState(NodePhase.Stump, 0, 0, 0, 1, 99, 0))
                .With(rock.Id, new NodeState(NodePhase.Damaged, 1, 0, 4, 0, 0, 0));
            Dictionary<string, float[]> e = OverlayInstances.Effective(batches, new[] { tree, rock }, o, 0);
            Assert.AreEqual(16, e["CommonTree_2"].Length, "l'arbre abattu n'est plus dessiné, l'autre reste");
            Assert.AreEqual(50f, e["CommonTree_2"][12]);
            Assert.AreEqual(16, e["Souche_Feuillu"].Length);
            Assert.AreEqual((float)HarvestData.StumpScale, e["Souche_Feuillu"][0], 1e-5);
            Assert.AreEqual((float)HarvestData.RockStageScales[1], e["Rock_Medium_2"][0], 1e-5);
            Assert.AreEqual(5f, e["Rock_Medium_2"][13] + VegetationTestSink * e["Rock_Medium_2"][5], 1e-4, "le pied reste au sol");
            Assert.AreEqual(2, batches["CommonTree_2"].Length / 16, "les matrices d'origine ne sont jamais modifiées");
        }

        private static readonly float VegetationTestSink = (float)Core.RenderData.VegetationInstances.SinkM;

        [Test]
        public void ObstaclesFollowWhatWasHarvested()
        {
            var tree = new Harvestable(new NodeId(NodeLayer.Resource, 1, 1), HarvestKind.Tree, "CommonTree_2", 10, 10, 0, 1);
            var rock = new Harvestable(new NodeId(NodeLayer.Resource, 2, 1), HarvestKind.Rock, "Rock_Medium_2", 16, 10, 0, 1);
            var ore = new Harvestable(new NodeId(NodeLayer.Feature, 5, 5), HarvestKind.CopperOre, "Gisement_Cuivre_1", 12, 14, 0, 0.5);
            var flower = new Harvestable(new NodeId(NodeLayer.Feature, 6, 5), HarvestKind.FlowerRose, "Flower_3_Group", 11, 11, 0, 1);
            var near = new List<Harvestable> { tree, rock, ore, flower };
            WorldOverlay o = WorldOverlay.Empty.With(tree.Id, new NodeState(NodePhase.Stump, 0, 0, 0, 1, 99, 0))
                .With(rock.Id, new NodeState(NodePhase.Depleted, 0, 0, 0, 1, 99, 0));
            var circles = new List<Circle> { tree.Collider.Value, rock.Collider.Value, new Circle(30, 30, 1) }; // the world's own index
            HarvestObstacles.Adjust(circles, near, o, 0, 5, 5, 20, 20);
            Assert.IsFalse(circles.Contains(rock.Collider.Value), "un rocher épuisé ne bloque plus");
            Assert.IsFalse(circles.Contains(tree.Collider.Value), "l'arbre abattu ne bloque plus…");
            Assert.IsTrue(circles.Exists(c => c.X == 10 && c.Z == 10 && c.R < tree.Collider.Value.R), "…sa souche si, un peu");
            Assert.IsTrue(circles.Contains(ore.Collider.Value), "les gisements ajoutés bloquent");
            Assert.AreEqual(1, circles.Count(c => c.X == 30), "le reste du monde ne change pas");
            Assert.AreEqual(3, circles.Count, "une fleur ne bloque pas");
        }

        [Test]
        public void GainsAreWrittenInGoodFrench()
        {
            Assert.AreEqual("+1 Bûche", PromptText.Gain("wood", 1));
            Assert.AreEqual("+3 Bûches", PromptText.Gain("wood", 3));
            Assert.AreEqual("+2 Haches en pierre", PromptText.Gain("axe_stone", 2));
            Assert.AreEqual("+2 Minerais de cuivre", PromptText.Gain("copper_ore", 2));
            Assert.AreEqual("+4 Fibres végétales", PromptText.Gain("fibre", 4));
            Assert.AreEqual("+2 Épis dorés", PromptText.Gain("flower_gold", 2));
        }

        [Test]
        public void TheBagKeyOpensAMenuWhereTheGameGoesOnButTheWorldIsNotTouched()
        {
            Assert.AreEqual(InputMode.Menu, InputModes.OpenMenu(InputMode.Playing));
            Assert.AreEqual(InputMode.Menu, InputModes.Next(InputMode.Menu, ModeEvent.CaptureLost), "libérer la souris pour le sac n'est pas une pause");
            Assert.AreEqual(InputMode.Playing, InputModes.Next(InputMode.Menu, ModeEvent.CaptureGained));
            Assert.IsTrue(InputModes.SimulationRuns(InputMode.Menu));
            Assert.IsFalse(InputModes.WorldActionsAllowed(InputMode.Menu));
            Assert.AreEqual(InputMode.Paused, InputModes.OpenMenu(InputMode.Paused));
        }
    }
}
