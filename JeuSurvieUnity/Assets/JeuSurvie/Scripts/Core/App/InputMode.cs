// Port of src/app/modes/input-mode.ts and src/app/input/raw-input.ts (pure input rules).
using System;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.App
{
    /// <summary>Menu: the bag is open — the game goes on, the mouse is for the interface (no look, no action in the world).</summary>
    public enum InputMode { Playing, Paused, ResumePrompt, Menu }
    public enum ModeEvent { CaptureLost, CaptureGained, CaptureRefused }

    public static class InputModes
    {
        public const InputMode Initial = InputMode.ResumePrompt;

        public static InputMode Next(InputMode mode, ModeEvent e)
        {
            switch (e)
            {
                case ModeEvent.CaptureGained: return InputMode.Playing;
                case ModeEvent.CaptureLost: return mode == InputMode.Playing ? InputMode.Paused : mode;
                default: return mode == InputMode.Paused ? InputMode.ResumePrompt : mode;
            }
        }

        /// <summary>The bag key: from the game it opens the menu (the cursor is then released on purpose, which is not a pause).</summary>
        public static InputMode OpenMenu(InputMode mode) => mode == InputMode.Playing ? InputMode.Menu : mode;

        public static bool SimulationRuns(InputMode mode) => mode == InputMode.Playing || mode == InputMode.Menu;
        public static bool IsInGame(InputMode mode) => mode == InputMode.Playing;
        /// <summary>Turning the camera and acting in the world (strikes, harvest) only with the cursor captured.</summary>
        public static bool WorldActionsAllowed(InputMode mode) => mode == InputMode.Playing;
    }

    public static class RawInputRules
    {
        public const double MaxLookDeltaPx = 200;
        private const double LinePx = 16, PagePx = 800, MaxWheelPx = 1000;

        /// <summary>Mouse wheel → pixels, whatever the source mode (0 pixels, 1 lines, 2 pages).</summary>
        public static double NormalizeWheel(double deltaY, int deltaMode)
        {
            if (!MathUtil.IsFinite(deltaY)) return 0;
            double scale = deltaMode == 0 ? 1 : deltaMode == 1 ? LinePx : deltaMode == 2 ? PagePx : 0;
            return Math.Max(-MaxWheelPx, Math.Min(MaxWheelPx, deltaY * scale)) + 0.0;
        }

        public static double ClampLookDelta(double px)
        {
            if (!MathUtil.IsFinite(px)) return 0;
            return Math.Max(-MaxLookDeltaPx, Math.Min(MaxLookDeltaPx, px));
        }
    }
}
