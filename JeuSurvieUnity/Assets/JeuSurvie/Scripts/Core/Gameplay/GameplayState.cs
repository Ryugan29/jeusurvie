// Everything the gameplay remembers, in one immutable value: the player's items, the changes made to the world, the
// objects lying on the ground and the gesture in progress. The game keeps the latest value; a save is just a copy of it.
using System;
using System.Collections.Generic;
using System.Linq;
using JeuSurvie.Core.Items;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.Gameplay
{
    /// <summary>Something lying on the ground, waiting to be picked up (never disappears by itself).</summary>
    public sealed class LootDrop
    {
        public readonly long Id;
        public readonly ItemStack Stack;
        public readonly double X, Y, Z;
        public LootDrop(long id, ItemStack stack, double x, double y, double z) { Id = id; Stack = stack; X = x; Y = y; Z = z; }
        public LootDrop WithStack(ItemStack s) => new LootDrop(Id, s, X, Y, Z);
    }

    public sealed class LootList
    {
        private readonly LootDrop[] drops;
        private LootList(LootDrop[] drops) { this.drops = drops; }
        public static readonly LootList Empty = new LootList(Array.Empty<LootDrop>());
        public static LootList Of(IEnumerable<LootDrop> drops) => new LootList(drops.ToArray());

        public IReadOnlyList<LootDrop> All => drops;
        public LootDrop Get(long id) => Array.Find(drops, d => d.Id == id);

        public IEnumerable<LootDrop> Near(double x, double z, double radius) =>
            drops.Where(d => (d.X - x) * (d.X - x) + (d.Z - z) * (d.Z - z) <= radius * radius);

        public LootList Without(long id) => new LootList(drops.Where(d => d.Id != id).ToArray());
        public LootList Replace(LootDrop drop) => new LootList(drops.Select(d => d.Id == drop.Id ? drop : d).ToArray());
        public LootList With(LootDrop drop) => new LootList(drops.Concat(new[] { drop }).ToArray());
    }

    public enum ActionPhase { Idle, Windup, Recover }

    /// <summary>One gesture: what it works, with which tool, and whether its impact already happened (it happens once).</summary>
    public readonly struct Swing
    {
        public readonly long Id;
        public readonly Target Target;
        public readonly long ToolId;
        public readonly double DurationS, ImpactAt;
        public readonly bool Applied;

        public Swing(long id, Target target, long toolId, double durationS, double impactAt, bool applied)
        {
            Id = id; Target = target; ToolId = toolId; DurationS = durationS; ImpactAt = impactAt; Applied = applied;
        }

        public Swing AsApplied() => new Swing(Id, Target, ToolId, DurationS, ImpactAt, true);
    }

    public readonly struct ActionState
    {
        public readonly ActionPhase Phase;
        public readonly Swing Swing;
        public readonly double ElapsedS;
        /// <summary>The use button was seen released since world actions became possible (no unintended blow).</summary>
        public readonly bool Armed;

        public ActionState(ActionPhase phase, Swing swing, double elapsedS, bool armed) { Phase = phase; Swing = swing; ElapsedS = elapsedS; Armed = armed; }

        public static readonly ActionState Idle = new ActionState(ActionPhase.Idle, default, 0, false);
        /// <summary>Progress of the gesture, 0 to 1 (for the animation).</summary>
        public double Normalized => Phase == ActionPhase.Idle || Swing.DurationS <= 0 ? 0 : Math.Min(1, ElapsedS / Swing.DurationS);
    }

    public sealed class GameplayState
    {
        public readonly PlayerItems Items;
        public readonly WorldOverlay World;
        public readonly LootList Loot;
        public readonly ActionState Action;
        public readonly Target Target;
        public readonly long NextLootId, NextSwingId;

        public GameplayState(PlayerItems items, WorldOverlay world, LootList loot, ActionState action, Target target, long nextLootId, long nextSwingId)
        {
            Items = items; World = world; Loot = loot; Action = action; Target = target; NextLootId = nextLootId; NextSwingId = nextSwingId;
        }

        public GameplayState With(PlayerItems items = null, WorldOverlay world = null, LootList loot = null, ActionState? action = null,
            Target? target = null, long? nextLootId = null, long? nextSwingId = null) =>
            new GameplayState(items ?? Items, world ?? World, loot ?? Loot, action ?? Action, target ?? Target, nextLootId ?? NextLootId, nextSwingId ?? NextSwingId);

        /// <summary>A new game: empty bag, untouched world, the starter tools lying on the camp's bench.</summary>
        public static GameplayState Initial(CampSite camp, Func<double, double, double?> groundAt)
        {
            var state = new GameplayState(PlayerItems.Initial, WorldOverlay.Empty, LootList.Empty, ActionState.Idle, Target.None, 1, 1);
            if (camp == null) return state;
            PlayerItems items = state.Items;
            long nextTool = items.NextToolId;
            var loot = new List<LootDrop>();
            foreach (var (item, durability, along) in CampSite.StarterTools)
            {
                Vec2XZ at = camp.AlongBench(along);
                double y = (groundAt(at.X, at.Z) ?? 0) + CampSite.BenchTopM;
                loot.Add(new LootDrop(loot.Count + 1, ItemStack.NewTool(item, nextTool++, durability), at.X, y, at.Z));
            }
            return new GameplayState(PlayerItems.Restore(items.Inventory, items.Hotbar, 0, nextTool), WorldOverlay.Empty, LootList.Of(loot),
                ActionState.Idle, Target.None, loot.Count + 1, 1);
        }
    }

    public enum GameplayEventType
    {
        SwingStarted, SwingCancelled, Impact, Gained, SurplusDropped, StageCompleted, Felled, Depleted, Tilled, RegrowStarted, Regrown,
        ToolBroken, Refused, PickedUp, Dropped, Equipped, InventoryChanged, WorldChanged,
    }

    /// <summary>What happened, for the effects, the sounds and the messages (never needed to keep the state right).</summary>
    public sealed class GameplayEvent
    {
        public readonly GameplayEventType Type;
        public readonly NodeId Node;
        public readonly HarvestKind Kind;
        public readonly string ItemId;
        public readonly int Count;
        public readonly double X, Y, Z;
        /// <summary>Message for the player (refusals), or the tool type name for impacts.</summary>
        public readonly string Text;
        /// <summary>Direction (radians) a felled tree falls toward.</summary>
        public readonly double Heading;
        public readonly Gesture Gesture;

        public GameplayEvent(GameplayEventType type, NodeId node = default, HarvestKind kind = default, string itemId = null, int count = 0,
            double x = 0, double y = 0, double z = 0, string text = null, double heading = 0, Gesture gesture = default)
        {
            Type = type; Node = node; Kind = kind; ItemId = itemId; Count = count; X = x; Y = y; Z = z; Text = text; Heading = heading; Gesture = gesture;
        }
    }

    /// <summary>One frame of player intentions, already filtered by the input mode (no world action while the bag is open).</summary>
    public readonly struct GameplayInput
    {
        public readonly bool UseHeld, GatherPressed, Moving, WorldActionsAllowed;
        /// <summary>Hotbar key pressed this frame (0–7), or −1.</summary>
        public readonly int Hotbar;
        public readonly Vec3 Player;
        public readonly double CameraYaw;

        public GameplayInput(Vec3 player, double cameraYaw, bool useHeld, bool gatherPressed, bool moving, int hotbar, bool worldActionsAllowed)
        {
            Player = player; CameraYaw = cameraYaw; UseHeld = useHeld; GatherPressed = gatherPressed; Moving = moving; Hotbar = hotbar;
            WorldActionsAllowed = worldActionsAllowed;
        }
    }

    public enum InventoryCommandType { Move, Split, Sort, Drop, Equip, Unequip, AssignHotbar }

    /// <summary>What the inventory window asks (it never changes the state itself).</summary>
    public readonly struct InventoryCommand
    {
        public readonly InventoryCommandType Type;
        public readonly int From, To, Amount;

        public InventoryCommand(InventoryCommandType type, int from = -1, int to = -1, int amount = 0) { Type = type; From = from; To = to; Amount = amount; }

        public static InventoryCommand Move(int from, int to) => new InventoryCommand(InventoryCommandType.Move, from, to);
        /// <summary>Half of the stack (rounded down) into the empty slot `to`.</summary>
        public static InventoryCommand SplitHalf(int from, int to) => new InventoryCommand(InventoryCommandType.Split, from, to);
        public static InventoryCommand Sort() => new InventoryCommand(InventoryCommandType.Sort);
        public static InventoryCommand Drop(int slot) => new InventoryCommand(InventoryCommandType.Drop, slot);
        public static InventoryCommand Equip(int slot) => new InventoryCommand(InventoryCommandType.Equip, slot);
        public static InventoryCommand Unequip() => new InventoryCommand(InventoryCommandType.Unequip);
        public static InventoryCommand AssignHotbar(int slot, int cell) => new InventoryCommand(InventoryCommandType.AssignHotbar, slot, cell);
    }

    public readonly struct StepResult
    {
        public readonly GameplayState Next;
        public readonly IReadOnlyList<GameplayEvent> Events;
        public StepResult(GameplayState next, IReadOnlyList<GameplayEvent> events) { Next = next; Events = events; }
    }
}
