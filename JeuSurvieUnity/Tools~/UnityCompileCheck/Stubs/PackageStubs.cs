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
    public interface IDownloadProvider { }
    public interface IDeferAgent { }
    public interface IGltfReadable
    {
        Texture2D GetTexture(int index = 0);
    }
    public class GltfImport
    {
        public GltfImport(IDownloadProvider downloadProvider = null, IDeferAgent deferAgent = null, Materials.IMaterialGenerator materialGenerator = null, Logging.ICodeLogger logger = null) { }
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
            public string name;
            public float alphaCutoff;
            public bool doubleSided;
            public AlphaMode GetAlphaMode() => AlphaMode.Opaque;
            public PbrMetallicRoughnessBase PbrMetallicRoughness => null;
        }
        public class TextureInfoBase
        {
            public int index = -1;
        }
        public class PbrMetallicRoughnessBase
        {
            public Color BaseColor => Color.white;
            public TextureInfoBase BaseColorTexture => null;
        }
    }
    namespace Logging
    {
        public interface ICodeLogger { }
        public class ConsoleLogger : ICodeLogger { }
    }
    namespace Materials
    {
        public interface IMaterialGenerator
        {
            Material GetDefaultMaterial(bool pointsSupport = false);
            Material GenerateMaterial(Schema.MaterialBase gltfMaterial, IGltfReadable gltf, bool pointsSupport = false);
            void SetLogger(Logging.ICodeLogger logger);
        }
    }
}
