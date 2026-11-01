// Ports of babylon/rain-renderer and night-magic-renderer: rain streaks in a box around the camera (count from the profile,
// slanted by the wind, dimmed at night) and fireflies around the player at night (additive, blinking), plus the mushroom glow.
using JeuSurvie.Core.RenderData;
using JeuSurvie.Core.Shared;
using JeuSurvie.Rendering;
using UnityEngine;

namespace JeuSurvie.Atmosphere
{
    public sealed class RainRenderer
    {
        public const float RadiusM = 14, AboveM = 16, BelowM = 4, SpeedMps = 18, LifeS = 1.1f;
        public const float SlantX = 0.45f, SlantZ = 0.22f, WidthM = 0.025f, LengthM = 0.7f, Alpha = 0.4f;
        private static readonly Color Tint = new Color(0.78f, 0.82f, 0.9f);
        private readonly ParticleSystem system;
        private readonly int capacity;

        public RainRenderer(int capacity, Shader particleShader)
        {
            this.capacity = Mathf.Max(0, capacity);
            if (this.capacity == 0 || particleShader == null) return;
            var go = new GameObject("Pluie");
            system = go.AddComponent<ParticleSystem>();
            system.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = system.main;
            main.maxParticles = this.capacity;
            main.startLifetime = LifeS;
            main.startSpeed = 0;
            main.startSize = WidthM;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.playOnAwake = false;
            var shape = system.shape;
            shape.shapeType = ParticleSystemShapeType.Box;
            shape.scale = new Vector3(2 * RadiusM, AboveM + BelowM, 2 * RadiusM);
            shape.position = new Vector3(0, (AboveM - BelowM) / 2, 0);
            var emission = system.emission;
            emission.rateOverTime = 0;
            var velocity = system.velocityOverLifetime;
            velocity.enabled = true;
            velocity.space = ParticleSystemSimulationSpace.World;
            var renderer = go.GetComponent<ParticleSystemRenderer>();
            renderer.renderMode = ParticleSystemRenderMode.Stretch;
            renderer.lengthScale = 1;
            renderer.velocityScale = LengthM / SpeedMps;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            var material = new Material(particleShader) { name = "Gouttes" };
            material.SetTexture("_MainTex", StreakSprite(4, 32));
            material.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            material.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            renderer.material = material;
            system.Play();
        }

        /// <summary>White streak, opaque in the middle, faded at the sides and both ends (rainStreakSprite).</summary>
        public static Texture2D StreakSprite(int w, int h)
        {
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, name = "trait-de-pluie" };
            for (int y = 0; y < h; y++)
            {
                float along = Mathf.Sin(Mathf.PI * (y + 0.5f) / h);
                for (int x = 0; x < w; x++)
                {
                    float across = 1 - Mathf.Abs((x + 0.5f) / w - 0.5f) * 2;
                    tex.SetPixel(x, y, new Color(1, 1, 1, along * across));
                }
            }
            tex.Apply();
            return tex;
        }

        public void Update(double rain, double wind, double brightness, Vector3 cameraPosition)
        {
            if (system == null) return;
            system.transform.position = cameraPosition;
            var emission = system.emission;
            emission.rateOverTime = (float)(capacity * MathUtil.Clamp01(rain) / LifeS);
            float w = (float)MathUtil.Clamp01(wind);
            Vector3 fall = new Vector3(SlantX * w, -1, SlantZ * w).normalized * SpeedMps;
            var velocity = system.velocityOverLifetime;
            velocity.x = fall.x;
            velocity.y = fall.y;
            velocity.z = fall.z;
            float b = (float)MathUtil.Clamp01(brightness);
            var main = system.main;
            main.startColor = new Color(Tint.r * b, Tint.g * b, Tint.b * b, Alpha);
        }

        public void Dispose()
        {
            if (system != null) Object.Destroy(system.gameObject);
        }
    }

    public sealed class NightMagicRenderer
    {
        private const float LifeMinS = 4, LifeMaxS = 8;
        private readonly ParticleSystem fireflies;

        public NightMagicRenderer(Shader particleShader)
        {
            if (particleShader == null) return;
            var go = new GameObject("Lucioles");
            fireflies = go.AddComponent<ParticleSystem>();
            fireflies.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = fireflies.main;
            main.maxParticles = NightMagic.FireflyMax;
            main.startLifetime = new ParticleSystem.MinMaxCurve(LifeMinS, LifeMaxS);
            main.startSpeed = new ParticleSystem.MinMaxCurve(0.2f, 0.6f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.07f, 0.14f);
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.playOnAwake = false;
            var shape = fireflies.shape;
            shape.shapeType = ParticleSystemShapeType.Box;
            float r = (float)NightMagic.FireflyRadiusM, minY = (float)NightMagic.FireflyMinY, maxY = (float)NightMagic.FireflyMaxY;
            shape.scale = new Vector3(2 * r, maxY - minY, 2 * r);
            shape.position = new Vector3(0, (minY + maxY) / 2, 0);
            shape.randomDirectionAmount = 1;
            var emission = fireflies.emission;
            emission.rateOverTime = 0;
            Rgb c = NightMagic.FireflyColor;
            var col = fireflies.colorOverLifetime;
            col.enabled = true;
            var gradient = new Gradient();
            gradient.SetKeys(
                new[] { new GradientColorKey(new Color((float)c.R, (float)c.G, (float)c.B), 0), new GradientColorKey(new Color((float)c.R, (float)c.G, (float)c.B), 1) },
                new[] { new GradientAlphaKey(0, 0), new GradientAlphaKey(1, 0.15f), new GradientAlphaKey(0.25f, 0.45f), new GradientAlphaKey(1, 0.7f), new GradientAlphaKey(0, 1) });
            col.color = gradient;
            var renderer = go.GetComponent<ParticleSystemRenderer>();
            renderer.renderMode = ParticleSystemRenderMode.Billboard;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            var material = new Material(particleShader) { name = "Lucioles" };
            material.SetTexture("_MainTex", FireflySprite(32));
            material.SetFloat("_Intensity", 2f);
            material.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            material.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.One);
            renderer.material = material;
            fireflies.Play();
        }

        /// <summary>Soft luminous point: white core, fading halo (fireflySprite).</summary>
        public static Texture2D FireflySprite(int size)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Clamp, name = "luciole" };
            float c = (size - 1) / 2f;
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float d = Mathf.Sqrt((x - c) * (x - c) + (y - c) * (y - c)) / c;
                    float core = Mathf.Max(0, 1 - d);
                    float v = Mathf.Min(1, core * core * 1.6f);
                    tex.SetPixel(x, y, new Color(v, v, v, v));
                }
            tex.Apply();
            return tex;
        }

        /// <summary>Every frame: fireflies follow the player's feet and their number follows the hour; so does the mushroom glow.</summary>
        public void Update(Lighting l, Vector3 feet)
        {
            Shader.SetGlobalVector(ShaderGlobals.NightGlow, ShaderGlobals.V(NightMagic.MushroomGlow(l)));
            if (fireflies == null) return;
            fireflies.transform.position = feet;
            var emission = fireflies.emission;
            emission.rateOverTime = NightMagic.FireflyCount(l) / ((LifeMinS + LifeMaxS) / 2);
        }
    }
}
