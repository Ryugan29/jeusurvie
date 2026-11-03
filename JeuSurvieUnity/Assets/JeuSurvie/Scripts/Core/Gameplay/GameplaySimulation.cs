// The harvest, frame by frame. A gesture starts only if the target can really be worked (right tool, room in the bag);
// it can be interrupted before its impact (moving, changing tool, opening the bag), and then gives nothing; its impact
// happens once, at the moment the animation strikes, and applies everything together: work, yield into the bag (what
// does not fit is left on the ground, never lost), tool wear, new state of the thing. Yields come from a hash of the
// world seed and of the thing's id and blows, so they are the same before and after loading a save.
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Items;
using JeuSurvie.Core.RenderData;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.Gameplay
{
    public static class GameplaySimulation
    {
        private const double DropAheadM = 0.9;

        public static StepResult Step(GameplayState s, GameplayInput input, IWorldQuery world, long now, double dtS)
        {
            var events = new List<GameplayEvent>();
            ActionState a = s.Action;
            if (input.Hotbar >= 0)
            {
                if (a.Phase == ActionPhase.Windup) a = Cancel(a, events);
                PlayerItems selected = s.Items.Select(input.Hotbar);
                if (selected != s.Items) events.Add(new GameplayEvent(GameplayEventType.Equipped, itemId: selected.EquippedStack?.ItemId));
                s = s.With(items: selected);
            }
            bool armed = input.WorldActionsAllowed && (a.Armed || !input.UseHeld);
            Target target = input.WorldActionsAllowed ? Targeting.Pick(input.Player, input.CameraYaw, s.Items, s.World, s.Loot, world, now, s.Target) : Target.None;
            if (input.WorldActionsAllowed && input.UseHeld)
            {
                Target kept = KeepWorking(a, input.Player, s, world, now);
                if (!kept.IsNone) target = kept;
            }
            s = s.With(target: target);

            if (a.Phase == ActionPhase.Windup)
            {
                if (input.Moving || !input.WorldActionsAllowed || a.Swing.ToolId != s.Items.Equipped) a = Cancel(a, events);
                else
                {
                    double t = a.ElapsedS + dtS;
                    if (t >= a.Swing.DurationS * a.Swing.ImpactAt)
                    {
                        s = Impact(s, a.Swing, input.Player, world, now, events);
                        a = new ActionState(ActionPhase.Recover, a.Swing.AsApplied(), t, armed);
                    }
                    else a = new ActionState(ActionPhase.Windup, a.Swing, t, armed);
                }
            }
            else if (a.Phase == ActionPhase.Recover)
            {
                double t = a.ElapsedS + dtS;
                a = input.Moving || t >= a.Swing.DurationS ? new ActionState(ActionPhase.Idle, default, 0, armed) : new ActionState(ActionPhase.Recover, a.Swing, t, armed);
            }
            else a = new ActionState(ActionPhase.Idle, default, 0, armed);

            if (a.Phase == ActionPhase.Idle && input.WorldActionsAllowed && !input.Moving && !target.IsNone)
            {
                bool use = input.UseHeld && a.Armed && target.Input == TargetInput.Use;
                bool gather = input.GatherPressed && target.Input == TargetInput.Gather;
                if (use || gather)
                {
                    if (target.Status == TargetStatus.Ok)
                    {
                        GestureTiming g = HarvestData.Gestures[target.Gesture];
                        var swing = new Swing(s.NextSwingId, target, s.Items.Equipped, g.DurationS, g.ImpactAt, false);
                        a = new ActionState(ActionPhase.Windup, swing, 0, a.Armed);
                        s = s.With(nextSwingId: s.NextSwingId + 1);
                        events.Add(new GameplayEvent(GameplayEventType.SwingStarted, target.Node, target.Kind, x: target.X, y: target.Y, z: target.Z,
                            heading: Math.Atan2(target.X - input.Player.X, target.Z - input.Player.Z), gesture: target.Gesture));
                    }
                    else
                    {
                        events.Add(new GameplayEvent(GameplayEventType.Refused, target.Node, target.Kind, text: PromptText.Refusal(target, s.Items)));
                        if (use) a = new ActionState(ActionPhase.Idle, default, 0, false); // holding the button does not repeat the message
                    }
                }
            }
            return new StepResult(s.With(action: a), events);
        }

        /// <summary>While the button stays held, the work goes on where it began, wherever the camera looks: the thing being
        /// worked, if it is still there, still the same kind and still workable from here (in reach, the right tool).
        /// Target.None otherwise (then what the camera aims at is worked, as before).</summary>
        private static Target KeepWorking(ActionState a, Vec3 player, GameplayState s, IWorldQuery world, long now)
        {
            if (a.Phase == ActionPhase.Idle) return Target.None;
            Target t = a.Swing.Target;
            if (t.Type != TargetType.Node || t.Input != TargetInput.Use || !world.TryGet(t.Node, out Harvestable h)) return Target.None;
            NodeView v = NodeViews.Of(h, s.World[h.Id], now);
            if (!v.Shown || v.Kind != t.Kind) return Target.None; // felled, broken: what comes next is aimed at again
            Target again = Targeting.Evaluate(player, h, v, s.Items, s.World, world, now);
            return again.Status == TargetStatus.Ok && again.Input == TargetInput.Use ? again : Target.None;
        }

        private static ActionState Cancel(ActionState a, List<GameplayEvent> events)
        {
            events.Add(new GameplayEvent(GameplayEventType.SwingCancelled, a.Swing.Target.Node, a.Swing.Target.Kind));
            return new ActionState(ActionPhase.Idle, default, 0, a.Armed);
        }

        /// <summary>The impact of a gesture: everything it changes, computed first and applied together.</summary>
        private static GameplayState Impact(GameplayState s, Swing swing, Vec3 player, IWorldQuery world, long now, List<GameplayEvent> events)
        {
            if (swing.Applied) return s;
            return swing.Target.Type == TargetType.Loot ? PickUp(s, swing.Target, events) : Work(s, swing, player, world, now, events);
        }

        private static GameplayState PickUp(GameplayState s, Target target, List<GameplayEvent> events)
        {
            LootDrop drop = s.Loot.Get(target.LootId);
            if (drop == null) return s;
            Received r = s.Items.Receive(drop.Stack);
            if (r.Added == 0)
            {
                events.Add(new GameplayEvent(GameplayEventType.Refused, text: PromptText.Full));
                return s;
            }
            PlayerItems items = r.Next;
            if (drop.Stack.IsTool && items.Equipped == 0) items = items.Equip(drop.Stack.ToolId); // the first tool goes straight to the hand
            LootList loot = r.Remaining > 0 ? s.Loot.Replace(drop.WithStack(drop.Stack.WithCount(r.Remaining))) : s.Loot.Without(drop.Id);
            events.Add(new GameplayEvent(GameplayEventType.PickedUp, itemId: drop.Stack.ItemId, count: r.Added, x: drop.X, y: drop.Y, z: drop.Z));
            if (r.Remaining > 0) events.Add(new GameplayEvent(GameplayEventType.Refused, text: PromptText.Full));
            return s.With(items: items, loot: loot);
        }

        private static GameplayState Work(GameplayState s, Swing swing, Vec3 player, IWorldQuery world, long now, List<GameplayEvent> events)
        {
            if (!world.TryGet(swing.Target.Node, out Harvestable h)) return s;
            NodeState st = s.World[h.Id];
            NodeView v = NodeViews.Of(h, st, now);
            if (!v.Shown || v.Kind != swing.Target.Kind) return s; // already gone (it cannot be harvested twice)
            Target now_ = Targeting.Evaluate(player, h, v, s.Items, s.World, world, now);
            if (now_.Status != TargetStatus.Ok)
            {
                events.Add(new GameplayEvent(GameplayEventType.Refused, h.Id, v.Kind.Value, text: PromptText.Refusal(now_, s.Items)));
                return s;
            }
            HarvestRule rule = HarvestData.Rules[v.Kind.Value];
            ItemStack tool = s.Items.EquippedStack;
            bool usesTool = !rule.ByHand || now_.WithAltTool;
            int work = st.Work + (usesTool ? tool.Def.Tool.WorkPerHit : 100);
            int stage = st.Stage, hits = st.Hits + 1;
            int gained = 0;
            if (work >= rule.WorkPerStage * 100)
            {
                gained = YieldRoll(world.Seed, h.Id, st.Generation, hits, rule.PerStage) + (now_.WithAltTool ? rule.BonusWithAlt : 0);
                stage++;
                work = 0;
            }
            events.Add(new GameplayEvent(GameplayEventType.Impact, h.Id, v.Kind.Value, x: now_.X, y: now_.Y, z: now_.Z,
                text: usesTool ? tool.Def.Tool.Type.ToString() : null, gesture: swing.Target.Gesture));

            // The bag first (what does not fit stays on the ground), then the tool, then the world.
            PlayerItems items = s.Items;
            LootList loot = s.Loot;
            long nextLoot = s.NextLootId;
            if (gained > 0)
            {
                Received r = items.Receive(ItemStack.Of(rule.PerStage.ItemId, gained));
                items = r.Next;
                if (r.Added > 0) events.Add(new GameplayEvent(GameplayEventType.Gained, h.Id, v.Kind.Value, rule.PerStage.ItemId, r.Added, now_.X, now_.Y, now_.Z));
                if (r.Remaining > 0)
                {
                    loot = Drop(loot, ref nextLoot, ItemStack.Of(rule.PerStage.ItemId, r.Remaining), now_.X, (world.GroundAt(now_.X, now_.Z) ?? now_.Y) + 0.05, now_.Z);
                    events.Add(new GameplayEvent(GameplayEventType.SurplusDropped, h.Id, v.Kind.Value, rule.PerStage.ItemId, r.Remaining, now_.X, now_.Y, now_.Z,
                        PromptText.Full + " : " + PromptText.Quantity(rule.PerStage.ItemId, r.Remaining) + " laissé au sol"));
                }
            }
            if (usesTool)
            {
                ItemStack worn = tool.WithDurability(tool.Durability - 1);
                items = items.WithInventory(items.Inventory.ReplaceTool(worn));
                if (worn.IsBroken) events.Add(new GameplayEvent(GameplayEventType.ToolBroken, itemId: worn.ItemId, text: PromptText.Broken(worn)));
            }
            NodeState next = NextState(h, v.Kind.Value, rule, st, stage, work, hits, now, player, events);
            return s.With(items: items, world: s.World.With(h.Id, next), loot: loot, nextLootId: nextLoot);
        }

        private static NodeState NextState(Harvestable h, HarvestKind kind, HarvestRule rule, NodeState st, int stage, int work, int hits, long now,
            Vec3 player, List<GameplayEvent> events)
        {
            long respawn = rule.RespawnS > 0 ? now + (long)Math.Round(rule.RespawnS * Balance.SimHz) : 0;
            if (stage > st.Stage && stage < rule.Stages) events.Add(new GameplayEvent(GameplayEventType.StageCompleted, h.Id, kind, count: stage));
            if (stage < rule.Stages) // still standing: a stump stays a stump, anything else is now damaged
                return new NodeState(st.Phase == NodePhase.Stump ? NodePhase.Stump : NodePhase.Damaged, stage, work, hits, st.Generation, st.RespawnAt, st.Since);
            events.Add(new GameplayEvent(GameplayEventType.WorldChanged, h.Id, kind, x: h.X, z: h.Z));
            if (st.Phase == NodePhase.Stump) // a felled tree's stump: it grows back with its tree
            {
                events.Add(new GameplayEvent(GameplayEventType.Depleted, h.Id, kind, x: h.X, z: h.Z));
                return new NodeState(NodePhase.Depleted, 0, 0, 0, st.Generation + 1, st.RespawnAt > 0 ? st.RespawnAt : respawn, now);
            }
            switch (rule.After)
            {
                case AfterHarvest.Stump:
                    events.Add(new GameplayEvent(GameplayEventType.Felled, h.Id, kind, x: h.X, z: h.Z, heading: Math.Atan2(h.X - player.X, h.Z - player.Z)));
                    return new NodeState(NodePhase.Stump, 0, 0, 0, st.Generation + 1, respawn, now);
                case AfterHarvest.Till:
                    events.Add(new GameplayEvent(GameplayEventType.Tilled, h.Id, kind, x: h.X, z: h.Z));
                    return new NodeState(NodePhase.Tilled, 0, 0, 0, st.Generation + 1, 0, now);
                default:
                    events.Add(new GameplayEvent(GameplayEventType.Depleted, h.Id, kind, x: h.X, z: h.Z));
                    return new NodeState(NodePhase.Depleted, 0, 0, 0, st.Generation + 1, respawn, now);
            }
        }

        /// <summary>How many items a completed stage gives: from the seed, the thing, its generation and the blow (no hidden randomness).</summary>
        public static int YieldRoll(uint seed, NodeId id, int generation, int hits, Yield y)
        {
            uint h = Hash.Hash2(seed, id.A, id.B, 2000 + 16 * (int)id.Layer);
            h = Hash.Hash2(h, generation, hits, 2100);
            return y.Min + (int)(h % (uint)(y.Max - y.Min + 1));
        }

        private static LootList Drop(LootList loot, ref long nextId, ItemStack stack, double x, double y, double z)
        {
            if (!stack.IsTool)
                foreach (LootDrop d in loot.Near(x, z, HarvestData.LootMergeM))
                {
                    if (!d.Stack.StacksWith(stack) || d.Stack.Count >= stack.Def.MaxStack) continue;
                    int put = Math.Min(stack.Count, stack.Def.MaxStack - d.Stack.Count);
                    loot = loot.Replace(d.WithStack(d.Stack.WithCount(d.Stack.Count + put)));
                    if (put == stack.Count) return loot;
                    stack = stack.WithCount(stack.Count - put);
                }
            return loot.With(new LootDrop(nextId++, stack, x, y, z));
        }

        /// <summary>A command of the inventory window (only applied between frames).</summary>
        public static StepResult Apply(GameplayState s, InventoryCommand c, IWorldQuery world, Vec3 player, double heading)
        {
            var events = new List<GameplayEvent>();
            PlayerItems items = s.Items;
            Inventory inv = items.Inventory;
            switch (c.Type)
            {
                case InventoryCommandType.Move: items = items.WithInventory(inv.Move(c.From, c.To)); break;
                case InventoryCommandType.Split:
                {
                    ItemStack st = c.From >= 0 && c.From < inv.Size ? inv[c.From] : null;
                    if (st != null && !st.IsTool) items = items.WithInventory(inv.Split(c.From, c.To, c.Amount > 0 ? c.Amount : st.Count / 2));
                    break;
                }
                case InventoryCommandType.Sort: items = items.WithInventory(inv.Sort()); break;
                case InventoryCommandType.Equip:
                    if (c.From >= 0 && c.From < inv.Size && inv[c.From] != null && inv[c.From].IsTool) items = items.Equip(inv[c.From].ToolId);
                    break;
                case InventoryCommandType.Unequip: items = items.Equip(0); break;
                case InventoryCommandType.AssignHotbar:
                    if (c.From >= 0 && c.From < inv.Size && inv[c.From] != null && inv[c.From].IsTool)
                        items = items.WithHotbar(items.Hotbar.Assign(c.To, HotbarRef.Tool(inv[c.From].ToolId)));
                    break;
                case InventoryCommandType.Drop:
                {
                    Inventory after = inv.Remove(c.From, int.MaxValue, out ItemStack removed);
                    if (removed == null) break;
                    double x = player.X + Math.Sin(heading) * DropAheadM, z = player.Z + Math.Cos(heading) * DropAheadM;
                    long next = s.NextLootId;
                    LootList loot = Drop(s.Loot, ref next, removed, x, (world.GroundAt(x, z) ?? player.Y) + 0.05, z);
                    events.Add(new GameplayEvent(GameplayEventType.Dropped, itemId: removed.ItemId, count: removed.Count, x: x, z: z));
                    s = s.With(loot: loot, nextLootId: next);
                    items = items.WithInventory(after);
                    break;
                }
            }
            if (items != s.Items) events.Add(new GameplayEvent(GameplayEventType.InventoryChanged));
            return new StepResult(s.With(items: items), events);
        }

        /// <summary>Once a second: what is due grows back where the player cannot see it appear; what grew back is forgotten.</summary>
        public static StepResult Regrow(GameplayState s, IWorldQuery world, long now, double playerX, double playerZ, ViewCull? view)
        {
            var events = new List<GameplayEvent>();
            WorldOverlay overlay = s.World;
            foreach (var kv in s.World.Entries)
            {
                NodeState st = kv.Value;
                bool loaded = world.TryGet(kv.Key, out Harvestable h) && world.Loaded(h.X, h.Z);
                if (st.Phase == NodePhase.Regrowing)
                {
                    if (!loaded || now - st.Since >= NodeViews.RegrowTicks(h.Kind))
                    {
                        overlay = overlay.With(kv.Key, NodeState.Fresh);
                        events.Add(new GameplayEvent(GameplayEventType.Regrown, kv.Key, loaded ? h.Kind : default, x: loaded ? h.X : 0, z: loaded ? h.Z : 0));
                    }
                    continue;
                }
                if ((st.Phase != NodePhase.Depleted && st.Phase != NodePhase.Stump) || st.RespawnAt <= 0 || now < st.RespawnAt) continue;
                if (!loaded)
                {
                    overlay = overlay.With(kv.Key, NodeState.Fresh);
                    continue;
                }
                if (Respawn.CanAppear(h.X, h.Z, playerX, playerZ, view, true))
                {
                    overlay = overlay.With(kv.Key, new NodeState(NodePhase.Regrowing, 0, 0, 0, st.Generation, 0, now));
                    events.Add(new GameplayEvent(GameplayEventType.RegrowStarted, kv.Key, h.Kind, x: h.X, z: h.Z));
                }
                else overlay = overlay.With(kv.Key, new NodeState(st.Phase, st.Stage, st.Work, st.Hits, st.Generation,
                    now + (long)(HarvestData.RespawnRetryS * Balance.SimHz), st.Since));
            }
            return new StepResult(overlay == s.World ? s : s.With(world: overlay), events);
        }
    }
}
