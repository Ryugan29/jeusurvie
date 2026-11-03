# Both hands on the handle of a two-handed tool (axe, pickaxe, hoe), frame by frame, after the retarget: the sources swing
# with their right arm (a one-handed axe attack for the pickaxe) and their left hand goes its own way. Her left fist is put
# on the handle `along` metres up it from her right fist, the handle across her fist, and her forearm rolls with it (the
# wrist bends, it is not wrung). How the fist turns around the handle (a turn every ROLL_STEP degrees; index toward the
# head or the end, one way for the whole clip) and where the elbow goes (behind the fist, or on the source's side) are
# chosen over the whole clip at once: her forearm rolled as little away from the source's as can be, her wrist as
# straight, and fist, forearm and elbow moving little from one frame to the next. Where her left arm cannot reach, her
# right hand (the tool with it, turned as it was) comes toward her left shoulder just enough. The fist is the game's
# (Runtime/Characters/HarvestGestures.cs, Fist), where HandIk keeps it on the handle.
import math
from collections import namedtuple
from mathutils import Matrix, Quaternion, Vector
from .retarget import two_bone

REACH_SHARE = 0.97  # her arm at most this straight
PULL_SHARE = 0.80   # her right hand comes close enough for her left arm to reach at most this straight: room for the
                    # elbow, else a stretched arm leaves the fist no easy turn (forearm wrung)
PULLS = 3           # rounds of right hand toward her left shoulder (the right arm may not reach all the way at once)
ROLL_STEP = 10      # degrees between the turns of her left fist around the handle that are tried
STEADY = 1.0        # cost, per degree, of turning her upper arm, forearm or hand from one frame to the next (as one
                    # degree more of forearm roll or of wrist bend): no flicker
ELBOW_CM = 1.0      # ... and per centimetre her elbow moves
EASY_ROLL, EASY_BEND, STRAIN = 70, 60, 4.0  # beyond these (degrees) a forearm roll or a wrist bend costs STRAIN times more
SMOOTH = (1, 2, 3, 2, 1)  # the chosen hand turns and elbows averaged over neighbouring frames with these weights
LOOP_STARTS = 6     # a loop's steadiest path is looked for from this many of its first frame's cheapest options

Fist = namedtuple("Fist", "middle across forward palm")


def fk(arm, order, bases):
    """Armature-space matrices of the bones from their basis (rotation, location), parents first (as retarget._solve)."""
    poses = {}
    for name in order:
        b = arm.data.bones[name]
        rest_rel = b.parent.matrix_local.inverted() @ b.matrix_local if b.parent else b.matrix_local.copy()
        frame = (poses[b.parent.name] if b.parent else Matrix.Identity(4)) @ rest_rel
        q, loc = bases.get(name, (Quaternion(), Vector()))
        poses[name] = frame @ Matrix.Translation(loc) @ q.to_matrix().to_4x4()
    return poses


def fist(arm, side):
    """Her closed fist in its hand bone's space: its middle (under the knuckles, toward the palm: the thumb's side), the
    handle across it (pinky → index), where it points (along her middle finger) and where its palm faces."""
    b = arm.data.bones
    h0, idx, pky, mid, thb = (b[n + side].head_local for n in ("hand", "index_01", "pinky_01", "middle_01", "thumb_01"))
    across = (idx - pky).normalized()
    fwd = mid - h0
    fwd = (fwd - fwd.dot(across) * across).normalized()
    palm = thb - h0
    palm -= palm.dot(across) * across
    palm = (palm - palm.dot(fwd) * fwd).normalized()
    to_hand = b["hand" + side].matrix_local.inverted()
    turn = to_hand.to_3x3()
    middle = to_hand @ (h0 + (mid - h0) * 0.85 + palm * ((mid - h0).length * 0.3))
    return Fist(middle, (turn @ across).normalized(), (turn @ fwd).normalized(), (turn @ palm).normalized())


def grip_matrix(arm):
    """The tool's place in her right hand bone, as the game puts it (ToolInHand): the handle across her fist's middle
    (head on the index side), the edge where the fist points (tool X → edge, tool Z → handle, Blender axes)."""
    f = fist(arm, "_r")
    return Matrix.Translation(f.middle) @ Matrix((f.forward, f.across.cross(f.forward), f.across)).transposed().to_4x4()


def handle(poses, grip):
    """(point, direction) of the handle's axis, armature space: through her right fist, toward the tool's head."""
    tool = poses["hand_r"] @ grip
    return tool.translation, (tool.to_3x3() @ Vector((0, 0, 1))).normalized()


def turn_between(a, b):
    """The angle (radians, 0–π) of the turn from rotation a to rotation b."""
    angle = a.rotation_difference(b).angle
    return min(angle, 2 * math.pi - angle)


def _frame(x, y):
    """Rotation whose columns are x, y (made perpendicular to x) and x × y."""
    y = (y - y.dot(x) * x).normalized()
    return Matrix((x, y, x.cross(y))).transposed()


class Arm:
    def __init__(self, arm, side):
        self.up, self.low, self.hand = "upperarm" + side, "lowerarm" + side, "hand" + side
        b = arm.data.bones
        assert b[self.hand].parent.name == self.low and b[self.low].parent.name == self.up, "bras " + side + " : chaîne inattendue"
        self.upper = (b[self.low].head_local - b[self.up].head_local).length
        self.lower = (b[self.hand].head_local - b[self.low].head_local).length
        self.hand_rest = (b[self.low].matrix_local.inverted() @ b[self.hand].matrix_local).to_quaternion()
        self.low_rest = (b[self.up].matrix_local.inverted() @ b[self.low].matrix_local).to_quaternion()
        self.hinge = None  # the elbow's hinge in the upper arm bone's space, once seen on a bent elbow (learn_hinge)

    def learn_hinge(self, frames_poses, least=math.radians(20)):
        """The elbow's hinge, from the frame where it is bent most (at least `least`): the arm's plane seen from the upper
        arm. Left None when the elbow never bends enough to tell."""
        for p in frames_poses:
            s, e, w = (p[n].translation for n in (self.up, self.low, self.hand))
            if (e - s).angle(w - e) > least:
                least = (e - s).angle(w - e)
                axis = p[self.up].to_quaternion().inverted() @ (e - s).cross(w - e)
                axis.y = 0  # across the bone
                self.hinge = axis.normalized()

    def reach(self):
        return REACH_SHARE * (self.upper + self.lower)

    def roll(self, up_rot, low_rot):
        """How far (degrees, −180…180) the forearm is rolled about itself from its rest turn on the upper arm."""
        return twist_degrees((up_rot @ self.low_rest).inverted() @ low_rot, Vector((0, 1, 0)))


def _twist(turn, axis):
    """The part of `turn` around `axis` (swing–twist split); none when the turn is a half-turn across the axis."""
    v = axis * Vector((turn.x, turn.y, turn.z)).dot(axis)
    q = Quaternion((turn.w, v.x, v.y, v.z))
    return q.normalized() if q.magnitude > 1e-6 else Quaternion()


def twist_degrees(turn, axis):
    """The signed angle (degrees, −180…180) of the part of `turn` around `axis`."""
    t = _twist(turn, axis)
    return wrap(math.degrees(2 * math.atan2(Vector((t.x, t.y, t.z)).dot(axis), t.w)))


def wrap(degrees):
    return (degrees + 180) % 360 - 180


def _bent(limb, poses, elbow, wrist, hand_rot, roll):
    """Armature-space turns (upper arm, forearm, hand) of `limb` with its elbow and wrist there and its hand turned
    `hand_rot`; `roll`: the forearm rolls with the hand (its twist taken off the wrist). With its hinge known, the upper
    arm turns so the hinge lies across the arm's plane and the forearm bends about it (a raised arm never flips about
    itself); else both swing the shortest way from where they were."""
    shoulder, elbow0, wrist0 = (poses[n].translation for n in (limb.up, limb.low, limb.hand))
    plane = (elbow - shoulder).cross(wrist - elbow)
    if limb.hinge is not None and plane.length > 1e-6:
        y = Vector((0, 1, 0))
        up = (_frame((elbow - shoulder).normalized(), plane.normalized()) @ _frame(y, limb.hinge).transposed()).to_quaternion()
        straight = up @ limb.low_rest
        low = (straight @ y).rotation_difference(wrist - elbow) @ straight
    else:
        turn_up = (elbow0 - shoulder).rotation_difference(elbow - shoulder)
        turn_low = (turn_up @ (wrist0 - elbow0)).rotation_difference(wrist - elbow)
        up, low = turn_up @ poses[limb.up].to_quaternion(), turn_low @ turn_up @ poses[limb.low].to_quaternion()
    if roll:
        low = _twist(hand_rot @ (low @ limb.hand_rest).inverted(), (wrist - elbow).normalized()) @ low
    return up, low, hand_rot


def _write(arm, order, bases, poses, limb, turns):
    """Puts the armature-space `turns` (upper arm, forearm, hand) on `limb` (bases updated in place); the new poses."""
    for name, want in zip((limb.up, limb.low, limb.hand), turns):
        b = arm.data.bones[name]
        frame = poses[b.parent.name] @ b.parent.matrix_local.inverted() @ b.matrix_local
        loc = bases[name][1] if name in bases else Vector()
        bases[name] = (frame.to_quaternion().inverted() @ want, loc)
        poses = fk(arm, order, bases)
    return poses


class _LeftAim:
    """Her left arm at one frame with the middle of her fist at `point`, the hand turned `rot` (armature space), the elbow
    on the side of `hint`."""

    def __init__(self, limb, fist_l, poses, point, rot, hint):
        self.rot = rot
        self.wrist_aim = point - rot @ fist_l.middle
        self.shoulder = poses[limb.up].translation
        self.elbow, wrist = two_bone(self.shoulder, hint, self.wrist_aim, limb.upper, limb.lower)
        self.short = (self.wrist_aim - self.shoulder).length - limb.reach()  # > 0: out of reach by that much
        self.turns = _bent(limb, poses, self.elbow, wrist, rot, roll=True)
        self.roll = limb.roll(self.turns[0], self.turns[1])
        self.bend = math.degrees(turn_between(self.turns[1] @ limb.hand_rest, rot))


def _aim(limb, fist_l, fist_r, poses, grip, along, sign, turn, behind):
    """Her left fist on the handle turned `turn` degrees around it from where its index points toward the tool's head
    (sign +1) or its end (−1) and its palm faces away from her right palm; the elbow behind the fist in line with it
    (`behind`) or on the side the source had it."""
    o, u = handle(poses, grip)
    palm_r = poses["hand_r"].to_quaternion() @ fist_r.palm
    held = (_frame(u * sign, -palm_r) @ _frame(fist_l.across, fist_l.palm).transposed()).to_quaternion()
    rot = Quaternion(u, math.radians(turn)) @ held
    point = o + u * along
    hint = point - rot @ fist_l.middle - (rot @ fist_l.forward) * limb.lower if behind else poses[limb.low].translation
    return _LeftAim(limb, fist_l, poses, point, rot, hint)


def _pull(arm, order, bases, poses, grip, along, sign, left, right, fist_l, fist_r):
    """Her right hand (the tool with it, turned as it was) toward her left shoulder until her left fist, turned around the
    handle the way that brings her wrist nearest, reaches it with her arm at most PULL_SHARE straight (bases updated in
    place); the new poses."""
    room = PULL_SHARE * (left.upper + left.lower)
    for _ in range(PULLS):
        nearest = min((_aim(left, fist_l, fist_r, poses, grip, along, sign, t, True) for t in range(-180, 180, ROLL_STEP)),
                      key=lambda a: a.short)
        far = (nearest.wrist_aim - nearest.shoulder).length - room
        if far <= 0:
            break
        shift = (nearest.shoulder - nearest.wrist_aim).normalized() * (far + 0.005)
        e, w = two_bone(poses[right.up].translation, poses[right.low].translation, poses[right.hand].translation + shift,
                        right.upper, right.lower)
        poses = _write(arm, order, bases, poses, right, _bent(right, poses, e, w, poses[right.hand].to_quaternion(), roll=False))
    return poses


def _options(left, fist_l, fist_r, poses, grip, along, sign, source_roll):
    """Every fist turn and elbow side at one frame where her fist reaches the handle (all of them if none does), with its
    cost: forearm roll away from the source's and wrist bend, much dearer beyond what an arm does easily."""
    out = []
    for turn in range(-180, 180, ROLL_STEP):
        for behind in (True, False):
            aim = _aim(left, fist_l, fist_r, poses, grip, along, sign, turn, behind)
            roll = abs(wrap(aim.roll - source_roll))
            strain = max(0.0, roll - EASY_ROLL) + max(0.0, aim.bend - EASY_BEND)
            out.append((roll + aim.bend + STRAIN * strain, aim))
    reached = [o for o in out if o[1].short <= 0]
    return reached or out


def _change(a, b):
    """Cost of going from option `a` to option `b` at the next frame: how far her upper arm, forearm and hand turn (the
    swing's own motion included) and her elbow moves."""
    turned = sum(math.degrees(turn_between(p, q)) for p, q in zip(a.turns, b.turns))
    return STEADY * (turned + ELBOW_CM * (b.elbow - a.elbow).length * 100)


def _forward(options, start):
    """Least cost of reaching each option of the last frame, from the first frame's option `start` (None: any), changes
    counted; and the links back to the option each one came from, frame after frame."""
    total = [cost if start in (None, i) else math.inf for i, (cost, _) in enumerate(options[0])]
    links = []
    for prev, cur in zip(options, options[1:]):
        step, back = [], []
        for cost, aim in cur:
            j = min(range(len(prev)), key=lambda i: total[i] + _change(prev[i][1], aim))
            step.append(total[j] + _change(prev[j][1], aim) + cost)
            back.append(j)
        total = step
        links.append(back)
    return total, links


def _steadiest(options, loop):
    """The option at each frame that costs least over the whole clip, changes counted (shortest path through the frames);
    a loop also counts going from its last frame back to its first (its path tried from the first frame's LOOP_STARTS
    cheapest options). Returns (cost, chosen indices)."""
    starts = sorted(range(len(options[0])), key=lambda i: options[0][i][0])[:LOOP_STARTS] if loop else [None]
    best = None
    for start in starts:
        total, links = _forward(options, start)
        if loop:
            total = [t + _change(options[-1][i][1], options[0][start][1]) for i, t in enumerate(total)]
        i = min(range(len(total)), key=total.__getitem__)
        if best is None or total[i] < best[0]:
            best = (total[i], i, links)
    cost, i, links = best
    path = [i]
    for back in reversed(links):
        i = back[i]
        path.append(i)
    return cost, path[::-1]


def _smoothed(left, fist_l, frames, chosen, grip, along, loop):
    """The chosen aims with her hand's turn and her elbow averaged over neighbouring frames (SMOOTH weights; a loop's
    last frames are the neighbours of its first ones), the fist put back across the handle, the arm reached again."""
    half, n = len(SMOOTH) // 2, len(chosen)
    out = []
    for i, (_frame_bases, poses) in enumerate(frames):
        near = [(w, chosen[(i + k - half) % n]) for k, w in enumerate(SMOOTH) if loop or 0 <= i + k - half < n]
        weight = sum(w for w, _ in near)
        first = chosen[i].rot
        mean = Quaternion((0, 0, 0, 0))
        for w, a in near:  # quaternions on the same side as this frame's, then averaged
            q = a.rot if first.dot(a.rot) >= 0 else -a.rot
            mean = Quaternion([m + w * c for m, c in zip(mean, q)])
        rot = mean.normalized()
        elbow = sum((a.elbow * w for w, a in near), Vector()) / weight
        o, u = handle(poses, grip)
        across = rot @ fist_l.across
        rot = across.rotation_difference(u if across.dot(u) >= 0 else -u) @ rot
        out.append(_LeftAim(left, fist_l, poses, o + u * along, rot, elbow))
    return out


def hands_on_handle(arm, order, frames_bases, grip, along, loop=False):
    """The clip (per frame {bone: (rotation, location)}) with her left fist on the handle `along` metres up it from her
    right fist; `grip` places the tool in her right hand bone (grip_matrix); `loop`: its last frame leads back to its
    first. Returns new per-frame bases (the given ones are left as they are)."""
    left, right = Arm(arm, "_l"), Arm(arm, "_r")
    fist_l, fist_r = fist(arm, "_l"), fist(arm, "_r")
    left.learn_hinge([fk(arm, order, b) for b in frames_bases])
    best = None
    for sign in (1, -1):
        frames, options = [], []
        for b in frames_bases:
            frame = {n: (q.copy(), loc.copy()) for n, (q, loc) in b.items()}
            poses = fk(arm, order, frame)
            source_roll = left.roll(poses[left.up].to_quaternion(), poses[left.low].to_quaternion())
            poses = _pull(arm, order, frame, poses, grip, along, sign, left, right, fist_l, fist_r)
            frames.append((frame, poses))
            options.append(_options(left, fist_l, fist_r, poses, grip, along, sign, source_roll))
        total, path = _steadiest(options, loop)
        if best is None or total < best[0]:
            best = (total, frames, [opts[i][1] for opts, i in zip(options, path)])
    _, frames, chosen = best
    for (frame, poses), aim in zip(frames, _smoothed(left, fist_l, frames, chosen, grip, along, loop)):
        _write(arm, order, frame, poses, left, aim.turns)
    out = [frame for frame, _ in frames]
    for prev, cur in zip(out, out[1:]):  # no flips between frames when the clip is interpolated
        for name, (q, _loc) in cur.items():
            if name in prev:
                q.make_compatible(prev[name][0])
    return out
