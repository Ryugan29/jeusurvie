// Port of adapters/input/dom-input-device (+ app/input/raw-input): keys by PHYSICAL position (WASD = ZQSD on AZERTY, like
// KeyboardEvent.code), captured mouse, wheel, and cursor capture events for the input-mode machine (pointer lock → cursor lock:
// Escape or losing the window focus releases it and pauses; a click on the game captures it again).
using System.Collections.Generic;
using JeuSurvie.Core.App;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM && JEUSURVIE_INPUTSYSTEM
using UnityEngine.InputSystem;
#endif

namespace JeuSurvie.InputDevices
{
    public enum GameKey { Forward, Back, Left, Right, Slow, Moment1, Moment2, Moment3, Moment4, CycleSpeed, Weather, TogglePanel, OpenSettings }

    public sealed class RawInputFrame
    {
        public readonly HashSet<GameKey> Down = new HashSet<GameKey>();
        public readonly List<GameKey> Pressed = new List<GameKey>();
        public double LookDx, LookDy, Wheel;
        public readonly List<ModeEvent> ModeEvents = new List<ModeEvent>();
        public bool ClickedGame;

        public void Clear()
        {
            Down.Clear();
            Pressed.Clear();
            ModeEvents.Clear();
            LookDx = LookDy = Wheel = 0;
            ClickedGame = false;
        }
    }

    public sealed class GameInput
    {
        /// <summary>Browser wheel units per notch (deltaMode pixels ≈ 100 per notch).</summary>
        private const double PixelsPerNotch = 100;
        private readonly RawInputFrame frame = new RawInputFrame();
        private bool captured;
        private bool focusLost;

        public bool Captured => captured;

        /// <summary>Mouse position in screen pixels (origin bottom-left).</summary>
        public Vector2 PointerPosition
        {
            get
            {
#if ENABLE_INPUT_SYSTEM && JEUSURVIE_INPUTSYSTEM
                return Mouse.current != null ? Mouse.current.position.ReadValue() : Vector2.zero;
#else
                return UnityEngine.Input.mousePosition;
#endif
            }
        }

        public void RequestCapture()
        {
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
            if (!captured) frame.ModeEvents.Add(Cursor.lockState == CursorLockMode.Locked ? ModeEvent.CaptureGained : ModeEvent.CaptureRefused);
            captured = Cursor.lockState == CursorLockMode.Locked;
        }

        public void ReleaseCapture()
        {
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
            if (captured) frame.ModeEvents.Add(ModeEvent.CaptureLost);
            captured = false;
        }

        public void OnFocusChanged(bool hasFocus)
        {
            if (!hasFocus && captured) focusLost = true;
        }

        /// <summary>Inputs accumulated since the last sample. `uiBlocking`: a window (settings) eats the clicks.</summary>
        public RawInputFrame Sample(bool uiBlocking)
        {
            var events = new List<ModeEvent>(frame.ModeEvents);
            frame.Clear();
            frame.ModeEvents.AddRange(events);
            if (focusLost)
            {
                focusLost = false;
                ReleaseCapture();
            }
            // The editor (or the OS) may have released the cursor by itself: it is a capture loss.
            if (captured && Cursor.lockState != CursorLockMode.Locked)
            {
                captured = false;
                frame.ModeEvents.Add(ModeEvent.CaptureLost);
            }
#if ENABLE_INPUT_SYSTEM && JEUSURVIE_INPUTSYSTEM
            Keyboard k = Keyboard.current;
            Mouse m = Mouse.current;
            if (k != null)
            {
                if (k.wKey.isPressed) frame.Down.Add(GameKey.Forward);
                if (k.sKey.isPressed) frame.Down.Add(GameKey.Back);
                if (k.aKey.isPressed) frame.Down.Add(GameKey.Left);
                if (k.dKey.isPressed) frame.Down.Add(GameKey.Right);
                if (k.leftShiftKey.isPressed || k.rightShiftKey.isPressed) frame.Down.Add(GameKey.Slow);
                if (k.digit1Key.wasPressedThisFrame) frame.Pressed.Add(GameKey.Moment1);
                if (k.digit2Key.wasPressedThisFrame) frame.Pressed.Add(GameKey.Moment2);
                if (k.digit3Key.wasPressedThisFrame) frame.Pressed.Add(GameKey.Moment3);
                if (k.digit4Key.wasPressedThisFrame) frame.Pressed.Add(GameKey.Moment4);
                if (k.digit5Key.wasPressedThisFrame) frame.Pressed.Add(GameKey.CycleSpeed);
                if (k.digit6Key.wasPressedThisFrame) frame.Pressed.Add(GameKey.Weather);
                if (k.fKey.wasPressedThisFrame) frame.Pressed.Add(GameKey.TogglePanel);
                if (k.oKey.wasPressedThisFrame) frame.Pressed.Add(GameKey.OpenSettings);
                if (k.escapeKey.wasPressedThisFrame && captured) ReleaseCapture();
            }
            if (m != null)
            {
                Vector2 d = m.delta.ReadValue();
                if (captured)
                {
                    frame.LookDx = RawInputRules.ClampLookDelta(d.x);
                    frame.LookDy = RawInputRules.ClampLookDelta(-d.y);
                }
                float scroll = m.scroll.ReadValue().y;
                if (scroll != 0) frame.Wheel = RawInputRules.NormalizeWheel(-(Mathf.Abs(scroll) <= 10 ? scroll * PixelsPerNotch : scroll * PixelsPerNotch / 120), 0);
                if (m.leftButton.wasPressedThisFrame && !uiBlocking) frame.ClickedGame = true;
            }
#else
            if (UnityEngine.Input.GetKey(KeyCode.W)) frame.Down.Add(GameKey.Forward);
            if (UnityEngine.Input.GetKey(KeyCode.S)) frame.Down.Add(GameKey.Back);
            if (UnityEngine.Input.GetKey(KeyCode.A)) frame.Down.Add(GameKey.Left);
            if (UnityEngine.Input.GetKey(KeyCode.D)) frame.Down.Add(GameKey.Right);
            if (UnityEngine.Input.GetKey(KeyCode.LeftShift) || UnityEngine.Input.GetKey(KeyCode.RightShift)) frame.Down.Add(GameKey.Slow);
            if (UnityEngine.Input.GetKeyDown(KeyCode.Alpha1)) frame.Pressed.Add(GameKey.Moment1);
            if (UnityEngine.Input.GetKeyDown(KeyCode.Alpha2)) frame.Pressed.Add(GameKey.Moment2);
            if (UnityEngine.Input.GetKeyDown(KeyCode.Alpha3)) frame.Pressed.Add(GameKey.Moment3);
            if (UnityEngine.Input.GetKeyDown(KeyCode.Alpha4)) frame.Pressed.Add(GameKey.Moment4);
            if (UnityEngine.Input.GetKeyDown(KeyCode.Alpha5)) frame.Pressed.Add(GameKey.CycleSpeed);
            if (UnityEngine.Input.GetKeyDown(KeyCode.Alpha6)) frame.Pressed.Add(GameKey.Weather);
            if (UnityEngine.Input.GetKeyDown(KeyCode.F)) frame.Pressed.Add(GameKey.TogglePanel);
            if (UnityEngine.Input.GetKeyDown(KeyCode.O)) frame.Pressed.Add(GameKey.OpenSettings);
            if (UnityEngine.Input.GetKeyDown(KeyCode.Escape) && captured) ReleaseCapture();
            if (captured)
            {
                // Legacy axes are in « mouse units »: about 1/20 of a pixel-delta at default settings.
                frame.LookDx = RawInputRules.ClampLookDelta(UnityEngine.Input.GetAxisRaw("Mouse X") * 20);
                frame.LookDy = RawInputRules.ClampLookDelta(-UnityEngine.Input.GetAxisRaw("Mouse Y") * 20);
            }
            float scroll = UnityEngine.Input.mouseScrollDelta.y;
            if (scroll != 0) frame.Wheel = RawInputRules.NormalizeWheel(-scroll * PixelsPerNotch, 0);
            if (UnityEngine.Input.GetMouseButtonDown(0) && !uiBlocking) frame.ClickedGame = true;
#endif
            return frame;
        }
    }
}
