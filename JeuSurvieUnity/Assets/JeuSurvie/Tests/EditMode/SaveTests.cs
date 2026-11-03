// The game save: after a reload everything is where it was (bag, wear, hand, hotbar, worked things and their regrowth
// times, objects on the ground, position and time), and a damaged or foreign file never loses or invents anything.
using System.Collections.Generic;
using System.Linq;
using JeuSurvie.Core.Gameplay;
using JeuSurvie.Core.Items;
using JeuSurvie.Core.Storage;
using NUnit.Framework;

namespace JeuSurvie.Tests
{
    public class SaveTests
    {
        private sealed class MemoryStore : ISaveStore
        {
            public string Main, Backup;
            public int Quarantined;
            public string Read(bool backup) => backup ? Backup : Main;
            public void WriteAtomic(string text) { Backup = Main; Main = text; }
            public void Quarantine() { Quarantined++; Main = null; }
        }

        private static SaveData Sample()
        {
            PlayerItems p = PlayerItems.Initial;
            p = p.Receive(ItemStack.Of("wood", 37)).Next;
            p = p.Receive(p.NewTool("axe_copper", 51)).Next;
            p = p.Receive(p.NewTool("pickaxe_stone", 0)).Next;
            p = p.Receive(ItemStack.Of("flower_gold", 2)).Next;
            p = p.WithInventory(p.Inventory.Move(3, 17)).Select(1);
            WorldOverlay world = WorldOverlay.Empty
                .With(new NodeId(NodeLayer.Resource, 12, -3), new NodeState(NodePhase.Stump, 0, 0, 0, 1, 36000, 120))
                .With(new NodeId(NodeLayer.Feature, -40, 7), new NodeState(NodePhase.Damaged, 1, 50, 3, 0, 0, 0))
                .With(new NodeId(NodeLayer.Camp, 13, 0), new NodeState(NodePhase.Tilled, 0, 0, 0, 1, 0, 400));
            LootList loot = LootList.Of(new[] { new LootDrop(4, ItemStack.Of("stone", 3), 1.5, 2.25, -7.125), new LootDrop(9, ItemStack.NewTool("hoe_iron", 77, 12), 0, 1, 2) });
            var state = new GameplayState(p, world, loot, ActionState.Idle, Target.None, 10, 1);
            return new SaveData(4242, 99999, 123456, 10.5, 3.25, -8.75, 1.25, state);
        }

        [Test]
        public void EverythingComesBackAfterAReload()
        {
            SaveData d = Sample();
            LoadResult r = GameSave.Read(GameSave.Write(d), 4242);
            Assert.IsNull(r.Refusal);
            Assert.IsEmpty(r.Repairs);
            SaveData b = r.Data;
            Assert.AreEqual(d.WorldTicks, b.WorldTicks);
            Assert.AreEqual(d.PlayTicks, b.PlayTicks);
            Assert.AreEqual(new[] { d.X, d.Y, d.Z, d.Heading }, new[] { b.X, b.Y, b.Z, b.Heading });
            for (int i = 0; i < Inventory.DefaultSize; i++)
            {
                ItemStack x = d.State.Items.Inventory[i], y = b.State.Items.Inventory[i];
                Assert.AreEqual(x == null, y == null, $"case {i}");
                if (x == null) continue;
                Assert.AreEqual((x.ItemId, x.Count, x.ToolId, x.Durability), (y.ItemId, y.Count, y.ToolId, y.Durability), $"case {i}");
            }
            Assert.AreEqual(d.State.Items.Equipped, b.State.Items.Equipped);
            for (int i = 0; i < Hotbar.Size; i++) Assert.AreEqual(d.State.Items.Hotbar[i].ToolId, b.State.Items.Hotbar[i].ToolId);
            Assert.Greater(b.State.Items.NextToolId, 77, "un nouvel outil ne reprendra jamais le numéro d'un outil posé au sol");
            CollectionAssert.AreEquivalent(d.State.World.Entries.Select(e => e.Key + "/" + e.Value.Phase + e.Value.Stage + e.Value.Work + e.Value.Hits + e.Value.Generation + e.Value.RespawnAt + e.Value.Since),
                b.State.World.Entries.Select(e => e.Key + "/" + e.Value.Phase + e.Value.Stage + e.Value.Work + e.Value.Hits + e.Value.Generation + e.Value.RespawnAt + e.Value.Since));
            CollectionAssert.AreEquivalent(d.State.Loot.All.Select(l => (l.Id, l.Stack.ItemId, l.Stack.Count, l.Stack.ToolId, l.Stack.Durability, l.X, l.Y, l.Z)),
                b.State.Loot.All.Select(l => (l.Id, l.Stack.ItemId, l.Stack.Count, l.Stack.ToolId, l.Stack.Durability, l.X, l.Y, l.Z)));
            Assert.GreaterOrEqual(b.State.NextLootId, 10);
        }

        [Test]
        public void ASaveOfAnotherWorldOrANewerGameIsRefusedAndKept()
        {
            string text = GameSave.Write(Sample());
            Assert.IsNotNull(GameSave.Read(text, 1).Refusal);
            Assert.IsNotNull(GameSave.Read(text.Replace("\"version\":1", "\"version\":7"), 4242).Refusal);
            var store = new MemoryStore { Main = text.Replace("\"version\":1", "\"version\":7") };
            LoadResult r = SaveService.Load(store, 4242);
            Assert.IsNull(r.Data);
            Assert.AreEqual(0, store.Quarantined, "le fichier d'une version plus récente n'est pas touché");
        }

        [Test]
        public void ADamagedSaveFallsBackToTheBackupAndIsKeptAside()
        {
            var store = new MemoryStore();
            store.WriteAtomic(GameSave.Write(Sample()));
            store.WriteAtomic("{\"format\":\"jeusurvie.save\",\"vers"); // cut while writing
            LoadResult r = SaveService.Load(store, 4242);
            Assert.IsNotNull(r.Data);
            Assert.AreEqual(37, r.Data.State.Items.Inventory.CountOf("wood"));
            Assert.AreEqual(1, store.Quarantined);

            var nothing = new MemoryStore { Main = "pas du json" };
            LoadResult fresh = SaveService.Load(nothing, 4242);
            Assert.IsNull(fresh.Data);
            Assert.IsNotNull(fresh.Refusal);
        }

        [Test]
        public void AForeignOrNewerSaveIsNeverWrittenOver()
        {
            string text = GameSave.Write(Sample());
            Assert.IsFalse(SaveService.Load(new MemoryStore { Main = text }, 1).MaySaveOver, "sauvegarde d'un autre monde : on n'écrit pas par-dessus");
            Assert.IsFalse(SaveService.Load(new MemoryStore { Main = text.Replace("\"version\":1", "\"version\":7") }, 4242).MaySaveOver);
            Assert.IsTrue(SaveService.Load(new MemoryStore { Main = text }, 4242).MaySaveOver);
            Assert.IsTrue(SaveService.Load(new MemoryStore(), 4242).MaySaveOver, "pas encore de sauvegarde");
            Assert.IsTrue(SaveService.Load(new MemoryStore { Main = "abîmé", Backup = "abîmé aussi" }, 4242).MaySaveOver, "l'illisible a été mis de côté");
        }

        [Test]
        public void LootIsNeverTruncatedAndIdsStayUnique()
        {
            string text = GameSave.Write(Sample())
                .Replace("{\"item\":\"stone\",\"count\":3}", "{\"item\":\"stone\",\"count\":130}")
                .Replace("{\"item\":\"wood\",\"count\":37}", "{\"item\":\"wood\",\"count\":80}")
                .Replace("\"next\":10", "\"next\":1"); // a stale counter: new drops must still get new numbers
            SaveData d = GameSave.Read(text, 4242).Data;
            Assert.AreEqual(130, d.State.Loot.All.Where(l => l.Stack.ItemId == "stone").Sum(l => l.Stack.Count));
            Assert.AreEqual(80, d.State.Items.Inventory.CountOf("wood") + d.State.Loot.All.Where(l => l.Stack.ItemId == "wood").Sum(l => l.Stack.Count));
            Assert.AreEqual(d.State.Loot.All.Count, d.State.Loot.All.Select(l => l.Id).Distinct().Count(), "numéros d'objets au sol uniques");
            Assert.Greater(d.State.NextLootId, d.State.Loot.All.Max(l => l.Id));
        }

        [Test]
        public void BadNumbersOfTheWorldAreRepairedInsteadOfCrashing()
        {
            string text = GameSave.Write(Sample())
                .Replace("\"phase\":\"damaged\",\"stage\":1", "\"phase\":\"damaged\",\"stage\":-3")
                .Replace("\"phase\":\"tilled\"", "\"phase\":\"7\"");
            LoadResult r = GameSave.Read(text, 4242);
            var damaged = r.Data.State.World[new NodeId(NodeLayer.Feature, -40, 7)];
            Assert.AreEqual(0, damaged.Stage);
            Assert.IsTrue(r.Data.State.World[new NodeId(NodeLayer.Camp, 13, 0)].IsFresh, "une phase inconnue est ignorée");
            var rock = new Harvestable(new NodeId(NodeLayer.Feature, -40, 7), HarvestKind.Rock, "Rock_Medium_2", 0, 0, 0, 1);
            Assert.DoesNotThrow(() => NodeViews.Of(rock, new NodeState(NodePhase.Damaged, -3, 0, 0, 0, 0, 0), 0));
        }

        [Test]
        public void NumbersAreWrittenTheSameWhateverTheLanguageOfThePc()
        {
            var culture = System.Globalization.CultureInfo.CurrentCulture;
            try
            {
                System.Globalization.CultureInfo.CurrentCulture = new System.Globalization.CultureInfo("sv-SE"); // its minus sign is not « - »
                string text = GameSave.Write(Sample());
                System.Globalization.CultureInfo.CurrentCulture = System.Globalization.CultureInfo.InvariantCulture;
                SaveData d = GameSave.Read(text, 4242).Data;
                Assert.AreEqual(NodePhase.Damaged, d.State.World[new NodeId(NodeLayer.Feature, -40, 7)].Phase);
                Assert.AreEqual(-8.75, d.Z);
            }
            finally { System.Globalization.CultureInfo.CurrentCulture = culture; }
        }

        [Test]
        public void TheCampStaysWhereItWasEvenIfTheStartChanges()
        {
            SaveData s = Sample();
            var withCamp = new SaveData(s.Seed, s.WorldTicks, s.PlayTicks, s.X, s.Y, s.Z, s.Heading, s.State, CampSite.At(31.5, -12.25, 0, 0));
            SaveData d = GameSave.Read(GameSave.Write(withCamp), 4242).Data;
            Assert.IsNotNull(d.Camp);
            Assert.AreEqual(31.5, d.Camp.X);
            Assert.AreEqual(-12.25, d.Camp.Z);
            Assert.AreEqual(withCamp.Camp.TowardSpawn, d.Camp.TowardSpawn, 1e-12);
            string otherLayout = GameSave.Write(withCamp).Replace("\"layout\":" + CampSite.LayoutVersion, "\"layout\":99");
            LoadResult r = GameSave.Read(otherLayout, 4242);
            Assert.IsTrue(r.Data.State.World[new NodeId(NodeLayer.Camp, 13, 0)].IsFresh, "un camp redessiné repart à neuf");
            Assert.IsNotEmpty(r.Repairs);
        }

        [Test]
        public void UnknownObjectsAreSkippedWearIsClampedAndExtraItemsWaitOnTheGround()
        {
            string text = GameSave.Write(Sample())
                .Replace("{\"item\":\"wood\",\"count\":37}", "{\"item\":\"wood\",\"count\":130}")
                .Replace("\"item\":\"flower_gold\"", "\"item\":\"plume_de_dragon\"")
                .Replace("\"wear\":51", "\"wear\":9999");
            LoadResult r = GameSave.Read(text, 4242);
            SaveData d = r.Data;
            Assert.AreEqual(0, d.State.Items.Inventory.CountOf("flower_gold"));
            Assert.AreEqual(ItemCatalog.Get("axe_copper").Tool.MaxDurability, d.State.Items.Inventory.Stacks.First(s => s.ItemId == "axe_copper").Durability);
            int wood = d.State.Items.Inventory.CountOf("wood") + d.State.Loot.All.Where(l => l.Stack.ItemId == "wood").Sum(l => l.Stack.Count);
            Assert.AreEqual(130, wood, "rien n'est perdu : le surplus attend au sol");
            Assert.GreaterOrEqual(r.Repairs.Count, 3);
            Assert.AreEqual(d.State.Loot.All.Count, d.State.Loot.All.Select(l => l.Id).Distinct().Count());
        }
    }
}
