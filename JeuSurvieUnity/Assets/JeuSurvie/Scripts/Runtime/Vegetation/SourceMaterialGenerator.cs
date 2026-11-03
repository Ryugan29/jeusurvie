// glTFast material generator that never uses glTFast's own shaders: nothing references them, so a build leaves them out and
// glTFast then returns null materials (characters magenta, vegetation without parts). Each glTF material becomes a « source »
// material on the game's NaturePBR shader (always in builds) carrying the glTF name, base colour and base colour texture,
// plus the PBR maps a character may bring (normal, roughness, emissive = night glow) and its alpha/double-sided settings;
// ModelLibrary and CharacterLoader convert it exactly as before (TextureOf / ColorOf read these values back).
#if JEUSURVIE_GLTFAST
using GLTFast;
using GLTFast.Logging;
using GLTFast.Materials;
using GLTFast.Schema;
using UnityEngine;
using UnityEngine.Rendering;

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
            var alphaMode = gltfMaterial.GetAlphaMode();
            float cutoff = alphaMode == MaterialBase.AlphaMode.Mask ? gltfMaterial.alphaCutoff : alphaMode == MaterialBase.AlphaMode.Blend ? 0.5f : 0f;
            m.SetFloat("_Cutoff", cutoff);
            // Double-sided drawing only for cut-out cards (leaves, hair): closed meshes flagged doubleSided (demon, hero) keep
            // back-face culling, as before, for their shadows and their fill rate.
            m.SetFloat("_Cull", gltfMaterial.doubleSided && cutoff > 0f ? (float)CullMode.Off : (float)CullMode.Back);
            NormalTextureInfoBase normal = gltfMaterial.NormalTexture;
            Texture2D normalMap = normal != null && normal.index >= 0 ? gltf.GetTexture(normal.index) : null;
            if (normalMap != null)
            {
                m.SetTexture("_BumpMap", normalMap);
                m.SetFloat("_BumpScale", normal.scale);
            }
            TextureInfoBase emissive = gltfMaterial.EmissiveTexture;
            Texture2D glowMap = emissive != null && emissive.index >= 0 ? gltf.GetTexture(emissive.index) : null;
            if (glowMap != null)
            {
                m.SetTexture("_GlowMap", glowMap);
                m.SetFloat("_UseGlowMap", 1);
                m.SetFloat("_Glow", 1); // full night glow: the glTF emissive factor only describes the daytime look in Blender
            }
            PbrMetallicRoughnessBase pbr = gltfMaterial.PbrMetallicRoughness;
            if (pbr == null) return m;
            m.SetColor("_BaseColor", pbr.BaseColor.gamma); // stored like glTFast does: ColorOf reads it back with .linear
            int texture = pbr.BaseColorTexture != null ? pbr.BaseColorTexture.index : -1;
            if (texture >= 0) m.SetTexture("_BaseMap", gltf.GetTexture(texture));
            TextureInfoBase roughness = pbr.MetallicRoughnessTexture;
            Texture2D roughnessMap = roughness != null && roughness.index >= 0 ? gltf.GetTexture(roughness.index) : null;
            if (roughnessMap != null)
            {
                m.SetTexture("_RoughnessMap", roughnessMap);
                m.SetFloat("_UseRoughnessMap", 1);
                if (pbr.metallicFactor > 0) // metal from the same map's blue channel (the copper and iron tools)
                {
                    m.SetFloat("_Metallic", pbr.metallicFactor);
                    m.SetFloat("_UseMetallicMap", 1);
                }
            }
            return m;
        }

        public void SetLogger(ICodeLogger logger) { }
    }
}
#endif
