// The hotbar (keys 1 to 8) only REFERS to tools of the inventory by their number: it never holds a copy, so a tool can
// neither be duplicated nor survive in the bar once it has left the bag. PlayerItems ties bag, bar and hand together and
// keeps them consistent after every change (a tool no longer in the bag is neither in the bar nor in hand).
using System;

namespace JeuSurvie.Core.Items
{
    public readonly struct HotbarRef
    {
        public readonly long ToolId;
        private HotbarRef(long toolId) { ToolId = toolId; }
        public static HotbarRef Tool(long toolId) => new HotbarRef(toolId);
        public static readonly HotbarRef None = default;
        public bool IsEmpty => ToolId == 0;
    }

    public sealed class Hotbar
    {
        public const int Size = 8;
        private readonly HotbarRef[] cells;

        private Hotbar(HotbarRef[] cells) { this.cells = cells; }

        public static readonly Hotbar Empty = new Hotbar(new HotbarRef[Size]);

        public static Hotbar FromRefs(HotbarRef[] refs)
        {
            var c = new HotbarRef[Size];
            for (int i = 0; i < Size && i < refs.Length; i++) c[i] = refs[i];
            return new Hotbar(c);
        }

        public HotbarRef this[int i] => cells[i];

        public int CellOf(long toolId) => toolId == 0 ? -1 : Array.FindIndex(cells, r => r.ToolId == toolId);

        public int FirstFree() => Array.FindIndex(cells, r => r.IsEmpty);

        /// <summary>Puts the reference in `cell`; the same tool leaves any other cell.</summary>
        public Hotbar Assign(int cell, HotbarRef r)
        {
            if (cell < 0 || cell >= Size) return this;
            var next = (HotbarRef[])cells.Clone();
            for (int i = 0; i < Size; i++) if (!r.IsEmpty && next[i].ToolId == r.ToolId) next[i] = HotbarRef.None;
            next[cell] = r;
            return new Hotbar(next);
        }

        /// <summary>Clears the cells whose tool is no longer in the inventory.</summary>
        public Hotbar Prune(Inventory inventory)
        {
            HotbarRef[] next = null;
            for (int i = 0; i < Size; i++)
            {
                if (cells[i].IsEmpty || inventory.IndexOfTool(cells[i].ToolId) >= 0) continue;
                next = next ?? (HotbarRef[])cells.Clone();
                next[i] = HotbarRef.None;
            }
            return next == null ? this : new Hotbar(next);
        }
    }

    public readonly struct Received
    {
        public readonly PlayerItems Next;
        public readonly int Added, Remaining;
        public Received(PlayerItems next, int added, int remaining) { Next = next; Added = added; Remaining = remaining; }
    }

    public sealed class PlayerItems
    {
        public readonly Inventory Inventory;
        public readonly Hotbar Hotbar;
        /// <summary>Tool in hand (0 = bare hands).</summary>
        public readonly long Equipped;
        /// <summary>Number the next new tool receives (never reused, saved).</summary>
        public readonly long NextToolId;

        private PlayerItems(Inventory inventory, Hotbar hotbar, long equipped, long nextToolId)
        {
            Inventory = inventory; Hotbar = hotbar; Equipped = equipped; NextToolId = nextToolId;
        }

        public static readonly PlayerItems Initial = new PlayerItems(Inventory.Empty(), Hotbar.Empty, 0, 1);

        /// <summary>From a save: made consistent (bar and hand only refer to tools of the bag, numbers never reused).</summary>
        public static PlayerItems Restore(Inventory inventory, Hotbar hotbar, long equipped, long nextToolId) =>
            Normalized(inventory, hotbar, equipped, nextToolId);

        public ItemStack EquippedStack => Inventory.Tool(Equipped);

        /// <summary>A brand new tool, numbered with NextToolId (it only becomes the player's once Received).</summary>
        public ItemStack NewTool(string itemId, int? durability = null) => ItemStack.NewTool(itemId, NextToolId, durability);

        /// <summary>Adds what fits (partial); a new tool also takes the first free hotbar cell.</summary>
        public Received Receive(ItemStack stack)
        {
            AddResult r = Inventory.Add(stack, AddMode.Partial);
            if (r.Added == 0) return new Received(this, 0, r.Remaining);
            Hotbar bar = Hotbar;
            if (stack.IsTool && bar.CellOf(stack.ToolId) < 0 && bar.FirstFree() >= 0) bar = bar.Assign(bar.FirstFree(), HotbarRef.Tool(stack.ToolId));
            return new Received(Normalized(r.Next, bar, Equipped, Math.Max(NextToolId, stack.ToolId + 1)), r.Added, r.Remaining);
        }

        /// <summary>Hotbar key: takes the cell's tool in hand, or puts it away if it already is.</summary>
        public PlayerItems Select(int cell)
        {
            if (cell < 0 || cell >= Hotbar.Size) return this;
            long id = Hotbar[cell].ToolId;
            if (id == 0) return Equip(0);
            return Equip(Equipped == id ? 0 : id);
        }

        public PlayerItems Equip(long toolId) =>
            toolId == Equipped || toolId != 0 && Inventory.IndexOfTool(toolId) < 0 ? this : new PlayerItems(Inventory, Hotbar, toolId, NextToolId);

        public PlayerItems WithInventory(Inventory inventory) => inventory == Inventory ? this : Normalized(inventory, Hotbar, Equipped, NextToolId);

        public PlayerItems WithHotbar(Hotbar hotbar) => hotbar == Hotbar ? this : Normalized(Inventory, hotbar, Equipped, NextToolId);

        private static PlayerItems Normalized(Inventory inventory, Hotbar hotbar, long equipped, long nextToolId)
        {
            long maxId = 0;
            foreach (ItemStack s in inventory.Stacks) maxId = Math.Max(maxId, s.ToolId);
            return new PlayerItems(inventory, hotbar.Prune(inventory), inventory.IndexOfTool(equipped) >= 0 ? equipped : 0, Math.Max(nextToolId, maxId + 1));
        }
    }
}
