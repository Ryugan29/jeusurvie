// COMPILE-CHECK STUBS ONLY: Input System, glTFast (6.20 API as documented), UnityEditor members used by the editor scripts.
#pragma warning disable
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace UnityEngine.InputSystem
{
    namespace Controls
    {
        public class ButtonControl { public bool isPressed => false; public bool wasPressedThisFrame => false; }
        public class Vector2Control { public Vector2 ReadValue() => default; }
    }
    public class Keyboard
    {
        public static Keyboard current => null;
        public Controls.ButtonControl wKey, aKey, sKey, dKey, leftShiftKey, rightShiftKey, digit1Key, digit2Key, digit3Key, digit4Key, digit5Key, digit6Key, fKey, oKey, escapeKey;
    }
    public class Mouse
    {
        public static Mouse current => null;
        public Controls.Vector2Control delta, scroll;
        public Controls.ButtonControl leftButton;
    }
}

namespace GLTFast
{
    public enum AnimationMethod { None, Legacy, Mecanim }
    public class ImportSettings
    {
        public AnimationMethod AnimationMethod { get; set; }
        public bool GenerateMipMaps { get; set; }
        public int AnisotropicFilterLevel { get; set; }
    }
    public class GltfImport
    {
        public Task<bool> Load(string url, ImportSettings importSettings = null, CancellationToken cancellationToken = default) => null;
        public Task<bool> InstantiateMainSceneAsync(Transform parent, CancellationToken cancellationToken = default) => null;
        public int MaterialCount => 0;
        public Material GetMaterial(int index = 0) => null;
        public Schema.MaterialBase GetSourceMaterial(int index = 0) => null;
    }
    namespace Schema
    {
        public class MaterialBase
        {
            public enum AlphaMode { Opaque, Mask, Blend }
            public float alphaCutoff;
            public bool doubleSided;
            public AlphaMode GetAlphaMode() => AlphaMode.Opaque;
        }
    }
}
