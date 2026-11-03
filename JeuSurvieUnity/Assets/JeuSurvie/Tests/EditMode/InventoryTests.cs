// Items, inventory, hotbar and equipment: what the player can hold and how it moves. The key promise: no operation ever
// creates, loses or duplicates an item (conservation), whatever the order of the operations.
using System.Collections.Generic;
using System.Linq;
using JeuSurvie.Core.Items;
using JeuSurvie.Core.Shared;
using NUnit.Framework;

namespace JeuSurvie.Tests
{
    public class InventoryTests
    {
        private static Inventory With(params ItemStack[] stacks)
        {
            Inventory inv = Inventory.Empty();
            foreach (ItemStack s in stacks)
            {
                AddResult r = inv.Add(s, AddMode.AllOrNothing);
                Assert.AreEqual(0, r.Remaining);
                inv = r.Next;
            }
            return inv;
        }

        [Test]
        public void CatalogHasStableUniqueIdsAndEveryToolInThreeQualities()
        {
            Assert.AreEqual(ItemCatalog.All.Count, ItemCatalog.All.Select(d => d.Id).Distinct().Count());
            foreach (ToolType t in new[] { ToolType.Axe, ToolType.Pickaxe, ToolType.Hoe, ToolType.Sickle })
                for (int tier = 1; tier <= 3; tier++)
                {
                    ItemDef d = ItemCatalog.ToolOf(t, tier);
                    Assert.NotNull(d, $"{t} niveau {tier}");
                    Assert.AreEqual(1, d.MaxStack);
                    Assert.AreEqual(ItemCategory.Tool, d.Category);
                }
            foreach (ItemDef d in ItemCatalog.All)
            {
                Assert.IsNotEmpty(d.Name);
                Assert.IsNotEmpty(d.Description);
                Assert.IsNotEmpty(d.Model);
            }
            Assert.Greater(ItemCatalog.Get("axe_iron").Tool.MaxDurability, ItemCatalog.Get("axe_copper").Tool.MaxDurability);
            Assert.Greater(ItemCatalog.Get("axe_copper").Tool.MaxDurability, ItemCatalog.Get("axe_stone").Tool.MaxDurability);
        }

        [Test]
        public void AddFillsExistingStacksFirstThenEmptySlots()
        {
            Inventory inv = With(ItemStack.Of("wood", 45), ItemStack.Of("stone", 3));
            AddResult r = inv.Add(ItemStack.Of("wood", 12), AddMode.AllOrNothing);
            Assert.AreEqual(12, r.Added);
            Assert.AreEqual(50, r.Next[0].Count);
            Assert.AreEqual("stone", r.Next[1].ItemId);
            Assert.AreEqual(7, r.Next[2].Count);
            Assert.AreEqual(57, r.Next.CountOf("wood"));
            Assert.AreEqual(45, inv.CountOf("wood"), "l'inventaire d'origine ne change pas");
        }

        [Test]
        public void FullInventoryRefusesAllOrNothingAndPartialReportsTheRest()
        {
            Inventory inv = Inventory.Empty(2);
            inv = inv.Add(ItemStack.Of("wood", 50), AddMode.AllOrNothing).Next;
            inv = inv.Add(ItemStack.Of("wood", 48), AddMode.AllOrNothing).Next;
            Assert.AreEqual(2, inv.RoomFor("wood"));
            AddResult refused = inv.Add(ItemStack.Of("wood", 5), AddMode.AllOrNothing);
            Assert.AreEqual(0, refused.Added);
            Assert.AreEqual(5, refused.Remaining);
            Assert.AreSame(inv, refused.Next);
            AddResult partial = inv.Add(ItemStack.Of("wood", 5), AddMode.Partial);
            Assert.AreEqual(2, partial.Added);
            Assert.AreEqual(3, partial.Remaining);
            Assert.AreEqual(100, partial.Next.CountOf("wood"));
            Assert.AreEqual(0, partial.Next.RoomFor("stone"));
        }

        [Test]
        public void ToolsNeverStackAndKeepTheirOwnWear()
        {
            Inventory inv = With(ItemStack.NewTool("axe_stone", 1, 10), ItemStack.NewTool("axe_stone", 2));
            Assert.AreEqual(10, inv[0].Durability);
            Assert.AreEqual(ItemCatalog.Get("axe_stone").Tool.MaxDurability, inv[1].Durability);
            Inventory moved = inv.Move(0, 1);
            Assert.AreEqual(2, moved[0].ToolId, "deux outils identiques s'échangent, ils ne fusionnent pas");
            Assert.AreEqual(1, moved[1].ToolId);
        }

        [Test]
        public void MoveMergesWithOverflowAndSwapsDifferentItems()
        {
            Inventory inv = With(ItemStack.Of("wood", 30), ItemStack.Of("stone", 4)).Move(0, 5);
            Assert.IsNull(inv[0]);
            Assert.AreEqual(30, inv[5].Count);
            inv = inv.Add(ItemStack.Of("wood", 40), AddMode.AllOrNothing).Next; // slot 5 → 50, 20 in slot 0
            Inventory merged = inv.Move(0, 5);
            Assert.AreEqual(50, merged[5].Count);
            Assert.AreEqual(20, merged[0].Count, "le surplus reste à sa place");
            Inventory swapped = merged.Move(1, 5);
            Assert.AreEqual("wood", swapped[1].ItemId);
            Assert.AreEqual("stone", swapped[5].ItemId);
        }

        [Test]
        public void SplitPutsPartOfAStackInAnEmptySlotOnly()
        {
            Inventory inv = With(ItemStack.Of("fibre", 9), ItemStack.Of("stone", 2));
            Inventory split = inv.Split(0, 4, 4);
            Assert.AreEqual(5, split[0].Count);
            Assert.AreEqual(4, split[4].Count);
            Assert.AreSame(inv, inv.Split(0, 1, 4), "jamais sur une case occupée");
            Assert.AreSame(inv, inv.Split(0, 4, 9), "jamais toute la pile");
            Assert.AreSame(inv, inv.Split(0, 4, 0));
        }

        [Test]
        public void RemoveGivesBackExactlyWhatLeaves()
        {
            Inventory inv = With(ItemStack.Of("herb", 6));
            Inventory after = inv.Remove(0, 4, out ItemStack removed);
            Assert.AreEqual(4, removed.Count);
            Assert.AreEqual(2, after[0].Count);
            after = after.Remove(0, 99, out removed);
            Assert.AreEqual(2, removed.Count);
            Assert.IsNull(after[0]);
        }

        [Test]
        public void SortMergesStacksAndOrdersByCategoryThenName()
        {
            Inventory inv = With(ItemStack.Of("stone", 10), ItemStack.NewTool("axe_stone", 1), ItemStack.Of("wood", 3));
            inv = inv.Move(0, 7).Add(ItemStack.Of("stone", 45), AddMode.AllOrNothing).Next; // stone 50 in 7, 5 in 0
            Inventory sorted = inv.Sort();
            Assert.AreEqual(inv.CountOf("stone"), sorted.CountOf("stone"));
            Assert.AreEqual("wood", sorted[0].ItemId, "ressources d'abord, par nom (Bûche avant Pierre)");
            Assert.AreEqual("stone", sorted[1].ItemId);
            Assert.AreEqual(50, sorted[1].Count);
            Assert.AreEqual(5, sorted[2].Count);
            Assert.IsTrue(sorted[3].IsTool, "les outils à la fin");
            Assert.IsNull(sorted[4]);
        }

        [Test]
        public void SortPutsTheBestToolFirst()
        {
            Inventory sorted = With(ItemStack.NewTool("axe_stone", 1), ItemStack.NewTool("axe_iron", 2), ItemStack.NewTool("axe_copper", 3)).Sort();
            CollectionAssert.AreEqual(new[] { "axe_iron", "axe_copper", "axe_stone" }, new[] { sorted[0].ItemId, sorted[1].ItemId, sorted[2].ItemId });
        }

        [Test]
        public void NothingChangedMeansTheSameState()
        {
            PlayerItems p = PlayerItems.Initial;
            p = p.Receive(p.NewTool("axe_stone")).Next.Select(0);
            Assert.AreSame(p, p.Equip(p.Equipped), "reprendre l'outil déjà en main ne change rien");
            Assert.AreSame(p, p.WithInventory(p.Inventory), "le même sac ne change rien");
            Assert.AreSame(p.Inventory, p.Inventory.Move(3, 4), "déplacer une case vide ne change rien");
        }

        [Test]
        public void FilterKeepsSlotPositions()
        {
            Inventory inv = With(ItemStack.Of("wood", 1), ItemStack.Of("herb", 1), ItemStack.Of("copper_ore", 1), ItemStack.Of("flower_rose", 1));
            CollectionAssert.AreEqual(new[] { 1, 3 }, inv.Matching(ItemCategory.Plant).ToArray());
            CollectionAssert.AreEqual(new[] { 0, 1, 2, 3 }, inv.Matching(null).ToArray());
        }

        [Test]
        public void NoOperationCreatesLosesOrDuplicatesItems()
        {
            string[] ids = { "wood", "stone", "fibre", "herb", "copper_ore" };
            Inventory inv = Inventory.Empty(12);
            var expected = new Dictionary<string, int>();
            var tools = new HashSet<long>();
            long nextTool = 1;
            for (int step = 0; step < 6000; step++)
            {
                uint h = Hash.Hash2(7, step, 0, 99);
                int op = (int)(h % 7), a = (int)((h >> 3) % 12), b = (int)((h >> 9) % 12), n = 1 + (int)((h >> 15) % 60);
                string id = ids[(h >> 21) % (uint)ids.Length];
                switch (op)
                {
                    case 0:
                    case 1:
                    {
                        AddResult r = inv.Add(ItemStack.Of(id, System.Math.Min(n, ItemCatalog.Get(id).MaxStack)), op == 0 ? AddMode.Partial : AddMode.AllOrNothing);
                        expected[id] = (expected.TryGetValue(id, out int c) ? c : 0) + r.Added;
                        inv = r.Next;
                        break;
                    }
                    case 2:
                    {
                        AddResult r = inv.Add(ItemStack.NewTool("pickaxe_copper", nextTool), AddMode.AllOrNothing);
                        if (r.Added == 1) tools.Add(nextTool);
                        nextTool++;
                        inv = r.Next;
                        break;
                    }
                    case 3: inv = inv.Move(a, b); break;
                    case 4: inv = inv.Split(a, b, n % 7); break;
                    case 5:
                    {
                        inv = inv.Remove(a, n % 9, out ItemStack removed);
                        if (removed == null) break;
                        if (removed.IsTool) tools.Remove(removed.ToolId);
                        else expected[removed.ItemId] -= removed.Count;
                        break;
                    }
                    default: inv = inv.Sort(); break;
                }
                foreach (string i in ids) Assert.AreEqual(expected.TryGetValue(i, out int e) ? e : 0, inv.CountOf(i), $"étape {step} : {i}");
                var seen = new HashSet<long>();
                for (int s = 0; s < inv.Size; s++)
                {
                    ItemStack st = inv[s];
                    if (st == null) continue;
                    Assert.Greater(st.Count, 0);
                    Assert.LessOrEqual(st.Count, ItemCatalog.Get(st.ItemId).MaxStack);
                    if (st.IsTool) Assert.IsTrue(seen.Add(st.ToolId), "outil dupliqué");
                }
                CollectionAssert.AreEquivalent(tools, seen, $"étape {step} : outils");
            }
        }

        [Test]
        public void HotbarReferencesWithoutCopying()
        {
            Hotbar bar = Hotbar.Empty.Assign(0, HotbarRef.Tool(5)).Assign(3, HotbarRef.Tool(5));
            Assert.IsTrue(bar[0].IsEmpty, "un même outil n'occupe qu'une case");
            Assert.AreEqual(5, bar[3].ToolId);
            Inventory inv = With(ItemStack.NewTool("axe_stone", 5));
            Assert.AreEqual(5, bar.Prune(inv)[3].ToolId);
            Assert.IsTrue(bar.Prune(inv.Remove(0, 1, out _))[3].IsEmpty, "un outil sorti de l'inventaire libère sa case");
        }

        [Test]
        public void NewToolsJoinTheHotbarAndEquipmentFollowsTheInventory()
        {
            PlayerItems p = PlayerItems.Initial;
            p = p.Receive(ItemStack.Of("wood", 3)).Next;
            Received axe = p.Receive(p.NewTool("axe_stone"));
            Assert.AreEqual(1, axe.Added);
            p = axe.Next;
            long axeId = p.Inventory[1].ToolId;
            Assert.AreEqual(axeId, p.Hotbar[0].ToolId, "un nouvel outil prend la première case libre de la barre");
            p = p.Select(0);
            Assert.AreEqual(axeId, p.Equipped);
            Assert.AreEqual("axe_stone", p.EquippedStack.ItemId);
            Assert.AreEqual(0, p.Select(0).Equipped, "réappuyer range l'outil : mains nues");
            PlayerItems sorted = p.WithInventory(p.Inventory.Sort());
            Assert.AreEqual(axeId, sorted.Equipped, "trier ne déséquipe pas");
            PlayerItems dropped = p.WithInventory(p.Inventory.Remove(p.Inventory.IndexOfTool(axeId), 1, out _));
            Assert.AreEqual(0, dropped.Equipped, "un outil déposé n'est plus en main");
            Assert.IsTrue(dropped.Hotbar[0].IsEmpty);
            Assert.AreNotEqual(p.NewTool("axe_stone").ToolId, axeId, "chaque outil reçoit un numéro neuf");
        }
    }
}
