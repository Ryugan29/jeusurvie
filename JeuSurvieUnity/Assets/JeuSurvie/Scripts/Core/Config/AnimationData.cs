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

        /// <summary>Where the left hand holds the handle, along it from the right hand (tool +Y, metres): just below it for
        /// the short handles, well up the shaft for the hoe.</summary>
        public static double SecondGripAlongHandleM(ToolType t) => t == ToolType.Hoe ? 0.42 : t == ToolType.Sickle ? 0 : -0.1;
    }
}
