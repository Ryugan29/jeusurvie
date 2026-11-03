// Small, sober particles that give weight to the blows: wood chips from trunks, stone and ore fragments, dust from the
// soil, cut stems and leaves from plants, petals from flowers; a puff of dust and leaves where a felled tree lands.
// One pooled particle system, particles emitted with explicit colours (the game's own particle shader, dimmed at night).
using JeuSurvie.Core.Gameplay;
using UnityEngine;

namespace JeuSurvie.Gameplay
{
    public sealed class HarvestFx
    {
        private readonly ParticleSystem system;
        private readonly Material material;

        private struct Look
        {
            public Color A, B;
            public float Size, Speed, Life;
            public int Count;
            public float Gravity;
            public Look(Color a, Color b, float size, float speed, float life, int count, float gravity) { A = a; B = b; Size = size; Speed = speed; Life = life; Count = count; Gravity = gravity; }
        }

        private static readonly Look Chips = new Look(new Color(0.78f, 0.58f, 0.34f), new Color(0.45f, 0.28f, 0.14f), 0.05f, 3.2f, 0.9f, 14, 1);
        private static readonly Look Shards = new Look(new Color(0.62f, 0.63f, 0.66f), new Color(0.38f, 0.38f, 0.42f), 0.05f, 3.6f, 0.8f, 12, 1);
        private static readonly Look Copper = new Look(new Color(0.92f, 0.55f, 0.25f), new Color(0.35f, 0.62f, 0.5f), 0.045f, 3.4f, 0.8f, 10, 1);
        private static readonly Look Iron = new Look(new Color(0.7f, 0.35f, 0.2f), new Color(0.45f, 0.45f, 0.5f), 0.045f, 3.4f, 0.8f, 10, 1);
        private static readonly Look Soil = new Look(new Color(0.32f, 0.21f, 0.12f), new Color(0.2f, 0.13f, 0.08f), 0.06f, 2.2f, 0.9f, 16, 1);
        private static readonly Look Leaves = new Look(new Color(0.42f, 0.6f, 0.22f), new Color(0.6f, 0.68f, 0.3f), 0.05f, 1.6f, 1.3f, 10, 0.35f);
        private static readonly Look Petals = new Look(new Color(0.95f, 0.62f, 0.68f), new Color(0.98f, 0.85f, 0.4f), 0.045f, 1.3f, 1.6f, 9, 0.25f);
        private static readonly Look Dust = new Look(new Color(0.55f, 0.48f, 0.38f, 0.5f), new Color(0.45f, 0.4f, 0.32f, 0.35f), 0.35f, 1.0f, 1.6f, 1, 0.05f);

        public HarvestFx(Shader particleShader)
        {
            if (particleShader == null) return;
            var go = new GameObject("Effets de récolte");
            system = go.AddComponent<ParticleSystem>();
            system.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = system.main;
            main.loop = false;
            main.playOnAwake = false;
            main.maxParticles = 600;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            var emission = system.emission;
            emission.enabled = false;
            var shape = system.shape;
            shape.enabled = false;
            var rotation = system.rotationOverLifetime;
            rotation.enabled = true;
            rotation.z = new ParticleSystem.MinMaxCurve(-6f, 6f);
            var fade = system.colorOverLifetime;
            fade.enabled = true;
            var gradient = new Gradient();
            gradient.SetKeys(new[] { new GradientColorKey(Color.white, 0), new GradientColorKey(Color.white, 1) },
                new[] { new GradientAlphaKey(1, 0), new GradientAlphaKey(1, 0.7f), new GradientAlphaKey(0, 1) });
            fade.color = gradient;
            material = new Material(particleShader) { name = "Éclats" };
            material.SetTexture("_MainTex", Flake(32));
            material.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            material.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            go.GetComponent<ParticleSystemRenderer>().sharedMaterial = material;
        }

        /// <summary>Night and storms dim the particles like the scene (the particle shader is not lit).</summary>
        public void SetBrightness(double b) => material?.SetFloat("_Intensity", Mathf.Clamp((float)b, 0.15f, 1.2f));

        private static Look LookOf(HarvestKind k)
        {
            switch (k)
            {
                case HarvestKind.Tree:
                case HarvestKind.Pine:
                case HarvestKind.DeadTree:
                case HarvestKind.Stump:
                case HarvestKind.Branch: return Chips;
                case HarvestKind.Rock: return Shards;
                case HarvestKind.CopperOre: return Copper;
                case HarvestKind.IronOre: return Iron;
                case HarvestKind.Soil: return Soil;
                case HarvestKind.FlowerRose:
                case HarvestKind.FlowerGold: return Petals;
                default: return Leaves;
            }
        }

        /// <summary>The blow: particles thrown back toward the player and up, from the struck point.</summary>
        public void Impact(HarvestKind kind, Vector3 at, Vector3 player)
        {
            Look l = LookOf(kind);
            Vector3 back = (player - at);
            back.y = 0;
            back = back.sqrMagnitude > 1e-4f ? back.normalized : Vector3.back;
            Emit(l, at, back * 0.8f + Vector3.up * 0.9f, 0.7f);
            if (kind == HarvestKind.Rock || kind == HarvestKind.Soil || kind == HarvestKind.CopperOre || kind == HarvestKind.IronOre) Emit(Dust, at, Vector3.up, 0.3f);
        }

        /// <summary>The end of a thing (depleted, tilled): a softer burst on the spot.</summary>
        public void Burst(HarvestKind kind, Vector3 at) => Emit(LookOf(kind), at, Vector3.up, 1f);

        /// <summary>A felled tree hits the ground: dust and leaves along its length.</summary>
        public void Landing(Vector3 foot, Vector3 dir, float length)
        {
            for (float t = 0.3f; t <= 1f; t += 0.14f)
            {
                Vector3 p = foot + dir * (length * t) + Vector3.up * 0.2f;
                Emit(Dust, p, Vector3.up, 0.6f);
                Emit(Leaves, p + Vector3.up * 0.6f, Vector3.up, 0.8f);
            }
        }

        private void Emit(Look l, Vector3 at, Vector3 direction, float spread)
        {
            if (system == null) return;
            for (int i = 0; i < l.Count; i++)
            {
                Vector3 v = (direction + Random.insideUnitSphere * spread).normalized * l.Speed * Random.Range(0.5f, 1.1f);
                var p = new ParticleSystem.EmitParams
                {
                    position = at + Random.insideUnitSphere * 0.08f,
                    velocity = v,
                    startSize = l.Size * Random.Range(0.6f, 1.4f),
                    startLifetime = l.Life * Random.Range(0.7f, 1.2f),
                    startColor = Color.Lerp(l.A, l.B, Random.value),
                    rotation = Random.Range(0f, 360f),
                };
                system.Emit(p, 1);
            }
            var main = system.main;
            main.gravityModifier = 1; // per-look gravity is approximated by the speed; heavy bits fall, leaves drift
            if (!system.isPlaying) system.Play();
        }

        /// <summary>A soft-edged rounded flake.</summary>
        private static Texture2D Flake(int size)
        {
            var t = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float dx = (x + 0.5f) / size * 2 - 1, dy = (y + 0.5f) / size * 2 - 1;
                    float d = Mathf.Sqrt(dx * dx + dy * dy * 1.6f);
                    t.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01((1 - d) * 3)));
                }
            t.Apply();
            return t;
        }
    }
}
