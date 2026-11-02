// glTFast material generator that never uses glTFast's own shaders: nothing references them, so a build leaves them out and
// glTFast then returns null materials (characters magenta, vegetation without parts). Each glTF material becomes a « source »
// material on the game's NaturePBR shader (always in builds) carrying the glTF name, base colour and base colour texture;
// ModelLibrary and CharacterLoader convert it exactly as before (TextureOf / ColorOf read these values back).
#if JEUSURVIE_GLTFAST
using GLTFast;
using GLTFast.Logging;
using GLTFast.Materials;
using GLTFast.Schema;
using UnityEngine;

namespace JeuSurvie.Vegetation
{
    public sealed class SourceMaterialGenerator : IMaterialGenerator
    {
        private readonly Shader shader;

        public SourceMaterialGenerator(Shader shader)
        {
            this.shader = shader;
        }

        public UnityEngine.Material GetDefaultMaterial(bool pointsSupport = false) => new UnityEngine.Material(shader) { name = "glTF par défaut" };

        public UnityEngine.Material GenerateMaterial(MaterialBase gltfMaterial, IGltfReadable gltf, bool pointsSupport = false)
        {
            var m = new UnityEngine.Material(shader) { name = gltfMaterial.name ?? "" };
            PbrMetallicRoughnessBase pbr = gltfMaterial.PbrMetallicRoughness;
            if (pbr == null) return m;
            m.SetColor("_BaseColor", pbr.BaseColor.gamma); // stored like glTFast does: ColorOf reads it back with .linear
            int texture = pbr.BaseColorTexture != null ? pbr.BaseColorTexture.index : -1;
            if (texture >= 0) m.SetTexture("_BaseMap", gltf.GetTexture(texture));
            return m;
        }

        public void SetLogger(ICodeLogger logger) { }
    }
}
#endif
