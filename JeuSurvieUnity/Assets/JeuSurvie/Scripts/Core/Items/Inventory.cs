// The player's bag: a fixed grid of slots holding stacks of identical items or single tools (each with its own wear).
// Immutable: every operation returns a new inventory and leaves the old one untouched, so an operation either happens
// completely or not at all — nothing is ever lost or duplicated on the way (InventoryTests checks it over 6 000 random steps).
using System;
using System.Collections.Generic;
using System.Linq;

namespace JeuSurvie.Core.Items
{
    /// <summary>One slot's content: `Count` identical items, or one tool (`ToolId` ≠ 0) with its `Durability`.</summary>
    public sealed class ItemStack
    {
        public readonly string ItemId;
        public readonly int Count;
        /// <summary>Unique number of a tool (0 for stackable items).</summary>
        public readonly long ToolId;
        /// <summary>Valid blows left (tools only); 0 = broken.</summary>
        public readonly int Durability;

        private ItemStack(string itemId, int count, long toolId, int durability)
        {
            ItemId = itemId; Count = count; ToolId = toolId; Durability = durability;
        }

        public static ItemStack Of(string itemId, int count)
        {
            ItemDef def = ItemCatalog.Get(itemId);
            if (def.IsTool) throw new ArgumentException("un outil se crée avec NewTool : " + itemId);
            if (count < 1 || count > def.MaxStack) throw new ArgumentOutOfRangeException(nameof(count), $"{itemId} × {count}");
            return new ItemStack(itemId, count, 0, 0);
        }

        public static ItemStack NewTool(string itemId, long toolId, int? durability = null)
        {
            ItemDef def = ItemCatalog.Get(itemId);
            if (!def.IsTool) throw new ArgumentException("pas un outil : " + itemId);
            if (toolId <= 0) throw new ArgumentOutOfRangeException(nameof(toolId));
            int d = durability ?? def.Tool.MaxDurability;
            return new ItemStack(itemId, 1, toolId, Math.Max(0, Math.Min(def.Tool.MaxDurability, d)));
        }

        public ItemDef Def => ItemCatalog.Get(ItemId);
        public bool IsTool => ToolId != 0;
        public bool IsBroken => IsTool && Durability <= 0;

        public ItemStack WithCount(int count)
        {
            if (IsTool) throw new InvalidOperationException("un outil ne se compte pas");
            return Of(ItemId, count);
        }

        public ItemStack WithDurability(int durability)
        {
            if (!IsTool) throw new InvalidOperationException("pas un outil");
            return new ItemStack(ItemId, 1, ToolId, Math.Max(0, Math.Min(Def.Tool.MaxDurability, durability)));
        }

        public bool StacksWith(ItemStack other) => other != null && !IsTool && !other.IsTool && ItemId == other.ItemId;
    }

    public enum AddMode { AllOrNothing, Partial }

    public readonly struct AddResult
    {
        public readonly Inventory Next;
        public readonly int Added, Remaining;
        public AddResult(Inventory next, int added, int remaining) { Next = next; Added = added; Remaining = remaining; }
    }

    public sealed class Inventory
    {
        public const int DefaultSize = 24;
        private readonly ItemStack[] slots;

        private Inventory(ItemStack[] slots) { this.slots = slots; }

        public static Inventory Empty(int size = DefaultSize)
        {
            if (size < 1) throw new ArgumentOutOfRangeException(nameof(size));
            return new Inventory(new ItemStack[size]);
        }

        /// <summary>From saved slots (null = empty). The caller has validated ids, counts and tool numbers.</summary>
        public static Inventory FromSlots(IReadOnlyList<ItemStack> content)
        {
            var copy = new ItemStack[content.Count];
            for (int i = 0; i < copy.Length; i++) copy[i] = content[i];
            return new Inventory(copy);
        }

        public int Size => slots.Length;
        public ItemStack this[int i] => slots[i];
        public IEnumerable<ItemStack> Stacks => slots.Where(s => s != null);

        public int CountOf(string itemId) => slots.Where(s => s != null && s.ItemId == itemId).Sum(s => s.Count);

        public int IndexOfTool(long toolId)
        {
            if (toolId == 0) return -1;
            for (int i = 0; i < slots.Length; i++) if (slots[i] != null && slots[i].ToolId == toolId) return i;
            return -1;
        }

        public ItemStack Tool(long toolId)
        {
            int i = IndexOfTool(toolId);
            return i < 0 ? null : slots[i];
        }

        /// <summary>How many of this item could still be added (tools: one per empty slot).</summary>
        public int RoomFor(string itemId)
        {
            ItemDef def = ItemCatalog.Get(itemId);
            int room = 0;
            foreach (ItemStack s in slots)
            {
                if (s == null) room += def.MaxStack;
                else if (!def.IsTool && s.ItemId == itemId) room += def.MaxStack - s.Count;
            }
            return room;
        }

        /// <summary>Tops up the existing stacks of the item first (lowest slot first), then fills empty slots.</summary>
        public AddResult Add(ItemStack stack, AddMode mode)
        {
            if (stack == null) throw new ArgumentNullException(nameof(stack));
            if (stack.IsTool)
            {
                int free = Array.IndexOf(slots, null);
                if (free < 0 || IndexOfTool(stack.ToolId) >= 0) return new AddResult(this, 0, 1);
                return new AddResult(With(free, stack), 1, 0);
            }
            int wanted = stack.Count;
            if (mode == AddMode.AllOrNothing && RoomFor(stack.ItemId) < wanted) return new AddResult(this, 0, wanted);
            int max = stack.Def.MaxStack, left = wanted;
            var next = (ItemStack[])slots.Clone();
            for (int i = 0; i < next.Length && left > 0; i++)
            {
                if (next[i] == null || !next[i].StacksWith(stack) || next[i].Count >= max) continue;
                int put = Math.Min(left, max - next[i].Count);
                next[i] = next[i].WithCount(next[i].Count + put);
                left -= put;
            }
            for (int i = 0; i < next.Length && left > 0; i++)
            {
                if (next[i] != null) continue;
                int put = Math.Min(left, max);
                next[i] = ItemStack.Of(stack.ItemId, put);
                left -= put;
            }
            return left == wanted ? new AddResult(this, 0, wanted) : new AddResult(new Inventory(next), wanted - left, left);
        }

        /// <summary>Drag of a whole slot onto another: into an empty slot, merged into the same item (the overflow stays), else swapped.</summary>
        public Inventory Move(int from, int to)
        {
            if (!Valid(from) || !Valid(to) || from == to || slots[from] == null) return this;
            ItemStack a = slots[from], b = slots[to];
            if (b == null) return With(from, null).With(to, a);
            if (a.StacksWith(b))
            {
                int max = a.Def.MaxStack;
                if (b.Count >= max) return this; // already full: everything stays where it was
                int put = Math.Min(a.Count, max - b.Count);
                return With(to, b.WithCount(b.Count + put)).With(from, a.Count - put > 0 ? a.WithCount(a.Count - put) : null);
            }
            return With(from, b).With(to, a);
        }

        /// <summary>Moves `amount` of a stack into an EMPTY slot, leaving at least one behind; otherwise nothing changes.</summary>
        public Inventory Split(int from, int to, int amount)
        {
            if (!Valid(from) || !Valid(to) || from == to) return this;
            ItemStack a = slots[from];
            if (a == null || a.IsTool || slots[to] != null || amount < 1 || amount >= a.Count) return this;
            return With(from, a.WithCount(a.Count - amount)).With(to, a.WithCount(amount));
        }

        /// <summary>Takes up to `amount` from a slot; `removed` is exactly what left the inventory (null if nothing did).</summary>
        public Inventory Remove(int slot, int amount, out ItemStack removed)
        {
            removed = null;
            if (!Valid(slot) || slots[slot] == null || amount < 1) return this;
            ItemStack s = slots[slot];
            if (s.IsTool || amount >= s.Count)
            {
                removed = s;
                return With(slot, null);
            }
            removed = s.WithCount(amount);
            return With(slot, s.WithCount(s.Count - amount));
        }

        /// <summary>Merges identical stacks, then orders: category, name, best tool first, least worn first. Empty slots at the end.</summary>
        public Inventory Sort()
        {
            var packed = Empty(Size);
            foreach (ItemStack s in Stacks.Where(s => !s.IsTool))
                packed = packed.Add(s, AddMode.Partial).Next; // the same items in at most as many slots as before: always fits
            var ordered = packed.Stacks.Concat(Stacks.Where(s => s.IsTool))
                .OrderBy(s => (int)s.Def.Category)
                .ThenBy(s => s.IsTool ? ItemCatalog.ToolLabel(s.Def.Tool.Type) : s.Def.Name, StringComparer.InvariantCulture) // accents with their letter
                .ThenByDescending(s => s.IsTool ? s.Def.Tool.Tier : 0) // the best tool of a kind first
                .ThenByDescending(s => s.IsTool ? s.Durability : s.Count)
                .ToList();
            var next = new ItemStack[Size];
            for (int i = 0; i < ordered.Count; i++) next[i] = ordered[i];
            return new Inventory(next);
        }

        /// <summary>Slots shown by a category filter (null = all), positions kept.</summary>
        public IEnumerable<int> Matching(ItemCategory? category)
        {
            for (int i = 0; i < slots.Length; i++)
                if (slots[i] != null && (category == null || slots[i].Def.Category == category)) yield return i;
        }

        /// <summary>The same inventory with one tool replaced (wear changed). Unknown tool: unchanged.</summary>
        public Inventory ReplaceTool(ItemStack tool)
        {
            int i = IndexOfTool(tool.ToolId);
            return i < 0 ? this : With(i, tool);
        }

        private bool Valid(int i) => i >= 0 && i < slots.Length;

        private Inventory With(int i, ItemStack s)
        {
            var next = (ItemStack[])slots.Clone();
            next[i] = s;
            return new Inventory(next);
        }
    }
}
