// Port of babylon/ground-textures: the eight ground matter textures (four layers × colour and matter) generated ON THE GPU at
// startup and on each profile change (size from the profile: 256 px in LOW, 2048 px in ULTRA), tiled, mipmapped, anisotropic.
using JeuSurvie.Core.RenderData;
using UnityEngine;
using UnityEngine.Rendering;

namespace JeuSurvie.Rendering
{
    public sealed class GroundTextures
    {
        public static readonly SurfaceLayer[] Layers = { SurfaceLayer.Grass, SurfaceLayer.Soil, SurfaceLayer.Rock, SurfaceLayer.Snow };
        private static readonly string[] Names = { "Grass", "Soil", "Rock", "Snow" };
        private readonly RenderTexture[] color = new RenderTexture[4];
        private readonly RenderTexture[] matter = new RenderTexture[4];
        public int Size { get; private set; }

        public RenderTexture Color(int layer) => color[layer];
        public RenderTexture Matter(int layer) => matter[layer];

        public GroundTextures(Material generator, int size, int anisotropy)
        {
            Size = size;
            var cmd = new CommandBuffer { name = "Jeu Survie : matières du sol" };
            for (int l = 0; l < 4; l++)
            {
                color[l] = Make($"sol-{Names[l]}-couleur", size, anisotropy, false);
                matter[l] = Make($"sol-{Names[l]}-matiere", size, anisotropy, false);
                var block = new MaterialPropertyBlock();
                block.SetFloat("_Texel", 1f / size);
                block.SetFloat("_SlopeScale", (float)Surfaces.NormalSlopeScale(Layers[l], size));
                int colorPass = generator.FindPass(Names[l].ToLowerInvariant() + "_color");
                int matterPass = generator.FindPass(Names[l].ToLowerInvariant() + "_matter");
                cmd.SetRenderTarget(color[l]);
                cmd.DrawProcedural(Matrix4x4.identity, generator, colorPass, MeshTopology.Triangles, 3, 1, block);
                cmd.SetRenderTarget(matter[l]);
                cmd.DrawProcedural(Matrix4x4.identity, generator, matterPass, MeshTopology.Triangles, 3, 1, block);
            }
            Graphics.ExecuteCommandBuffer(cmd);
            cmd.Release();
            for (int l = 0; l < 4; l++)
            {
                color[l].GenerateMips();
                matter[l].GenerateMips();
            }
        }

        /// <summary>Data textures (factors, normals, roughness): linear, never sRGB-decoded.</summary>
        private static RenderTexture Make(string name, int size, int anisotropy, bool srgb)
        {
            var rt = new RenderTexture(size, size, 0, RenderTextureFormat.ARGB32, srgb ? RenderTextureReadWrite.sRGB : RenderTextureReadWrite.Linear)
            {
                name = name,
                useMipMap = true,
                autoGenerateMips = false,
                wrapMode = TextureWrapMode.Repeat,
                filterMode = FilterMode.Trilinear,
                anisoLevel = anisotropy,
            };
            rt.Create();
            return rt;
        }

        public void SetAnisotropy(int anisotropy)
        {
            for (int l = 0; l < 4; l++)
            {
                color[l].anisoLevel = anisotropy;
                matter[l].anisoLevel = anisotropy;
            }
        }

        public void Bind(Material terrain)
        {
            for (int l = 0; l < 4; l++)
            {
                terrain.SetTexture("_TsColor" + Names[l], color[l]);
                terrain.SetTexture("_TsMatter" + Names[l], matter[l]);
            }
        }

        public void Dispose()
        {
            for (int l = 0; l < 4; l++)
            {
                if (color[l] != null) color[l].Release();
                if (matter[l] != null) matter[l].Release();
                Object.Destroy(color[l]);
                Object.Destroy(matter[l]);
            }
        }
    }
}
