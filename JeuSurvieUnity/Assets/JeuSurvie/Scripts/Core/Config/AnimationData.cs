// The heroine's clips (made by Tools~/Blender/animations.py into models/characters/heroine/animations.gltf): which clip
// shows each harvest gesture, which gestures hold the tool with both hands, and where the left hand goes on each handle.
using JeuSurvie.Core.Gameplay;
using JeuSurvie.Core.Items;

namespace JeuSurvie.Core.Config
{
    public static class AnimationData
    {
        /// <summary>Locomotion loops, empty-handed then tool in hand, in gait order (idle, walk, run).</summary>
        public static readonly string[] Locomotion = { "Repos", "Marche", "Course", "Repos_Outil", "Marche_Outil", "Course_Outil" };

        /// <summary>Fists closed on a handle (played on the hand only): right hand holding a tool, left hand on the handle.</summary>
        public const string RightGrip = "Geste_Prise", LeftGrip = "Prise_Gauche";

        public static string ClipOf(Gesture g)
        {
            switch (g)
            {
                case Gesture.Chop: return "Geste_Hache";
                case Gesture.Overhead: return "Geste_Frappe";
                case Gesture.Sweep: return "Geste_Fauche";
                case Gesture.Gather: return "Geste_Cueillir";
                case Gesture.Pickup: return "Geste_Ramasser";
                case Gesture.Dig: return "Geste_Houe";
                case Gesture.Pull: return "Geste_Arracher";
                default: return null;
            }
        }

        /// <summary>The axe, pickaxe and hoe are swung with both hands: her left hand is put on the handle.</summary>
        public static bool TwoHanded(Gesture g) => g == Gesture.Chop || g == Gesture.Overhead || g == Gesture.Dig;

        /// <summary>Where the middle of the left fist holds the handle, up it from the right fist (tool +Y, metres): on the
        /// leather of the axe and the pickaxe (their handle ends 0.13 m below the right fist), well up the hoe's long shaft.
        /// The clips are made with the same places (animations.json « left_grip », Tools~/Blender/animations.py).</summary>
        public static double SecondGripAlongHandleM(ToolType t) => t == ToolType.Hoe ? 0.5 : t == ToolType.Sickle ? 0 : 0.1;
    }
}
