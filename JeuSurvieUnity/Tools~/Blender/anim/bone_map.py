# Source bone name → the game's skeleton bone name (UE-mannequin style: pelvis, spine_01, upperarm_l, ...).
# Mixamo bones carry a "mixamorig:" prefix (sometimes "mixamorig1:"); Quaternius UAL bones already use the game's names.
import re

_MIXAMO_BODY = {
    "Hips": "pelvis", "Spine": "spine_01", "Spine1": "spine_02", "Spine2": "spine_03", "Neck": "neck_01", "Head": "Head",
}
_MIXAMO_SIDE = {  # without the Left/Right prefix → without the _l/_r suffix
    "Shoulder": "clavicle", "Arm": "upperarm", "ForeArm": "lowerarm", "Hand": "hand",
    "UpLeg": "thigh", "Leg": "calf", "Foot": "foot", "ToeBase": "ball",
}
_FINGERS = {"Thumb": "thumb", "Index": "index", "Middle": "middle", "Ring": "ring", "Pinky": "pinky"}
_PREFIX = re.compile(r"^mixamorig\d*:")


def mixamo_to_game(name):
    """The game bone a Mixamo bone drives, or None (finger tips, head top end)."""
    base = _PREFIX.sub("", name)
    if base in _MIXAMO_BODY:
        return _MIXAMO_BODY[base]
    for side, suffix in (("Left", "_l"), ("Right", "_r")):
        if not base.startswith(side):
            continue
        rest = base[len(side):]
        if rest in _MIXAMO_SIDE:
            return _MIXAMO_SIDE[rest] + suffix
        m = re.fullmatch(r"Hand(Thumb|Index|Middle|Ring|Pinky)([123])", rest)
        if m:
            return f"{_FINGERS[m.group(1)]}_0{m.group(2)}{suffix}"
    return None


def mapping_for(source_bones, target_bones, mixamo):
    """{target bone: source bone} for every target bone some source bone drives (the root never: it stays put)."""
    out = {}
    for s in source_bones:
        t = mixamo_to_game(s) if mixamo else s
        if t and t in target_bones and t != "root" and "leaf" not in t:
            out[t] = s
    return out
