// Port of babylon/lighting (SceneLighting) + sky-dome update: applies an atmosphere (hour + weather + lightning) to the scene —
// sky material (skybox), distance fog and height fog, sun/moon directional light, hemispheric ambient (trilight SH), and the air
// state for the aerial-perspective pass. No allocation per frame.
using System;
using JeuSurvie.Core.RenderData;
using JeuSurvie.Core.Shared;
using JeuSurvie.Core.Survival;
using JeuSurvie.Rendering;
using UnityEngine;
using UnityEngine.Rendering;

namespace JeuSurvie.Atmosphere
{
    public sealed class SceneLighting
    {
        public const double AerialSunScatter = 0.09;
        public const double AerialHeightFogShare = 0.5;
        public const float SunDiscHdr = 12f;
        private const double SkyTimeWrapS = 7200;

        public readonly Light Sun;
        private readonly Material sky;
        private readonly double heightFogBaseY;
        private double fogDistanceM;
        private double elapsedS;
        private bool aerial;
        private CloudQuality clouds = CloudQuality.Layered;

        public AerialState Air;

        private static readonly int SkyZenith = Shader.PropertyToID("_SkyZenith"), SkyHorizon = Shader.PropertyToID("_SkyHorizon"), SkyHaze = Shader.PropertyToID("_SkyHaze");
        private static readonly int SunDirSky = Shader.PropertyToID("_SunDirSky"), SunColorSky = Shader.PropertyToID("_SunColorSky");
        private static readonly int CloudLight = Shader.PropertyToID("_CloudLight"), CloudShade = Shader.PropertyToID("_CloudShade");
        private static readonly int SkyParams = Shader.PropertyToID("_SkyParams"), SkyWeather = Shader.PropertyToID("_SkyWeather"), SkyCosmos = Shader.PropertyToID("_SkyCosmos");

        public SceneLighting(Shader skyShader, double fogDistanceM, double heightFogBaseY, CloudQuality clouds)
        {
            this.fogDistanceM = fogDistanceM;
            this.heightFogBaseY = heightFogBaseY;
            var go = new GameObject("Soleil / Lune");
            Sun = go.AddComponent<Light>();
            Sun.type = LightType.Directional;
            Sun.shadows = LightShadows.Soft;
            Sun.shadowBias = 0.05f;
            Sun.shadowNormalBias = 0.4f;
            RenderSettings.sun = Sun;
            if (skyShader != null)
            {
                sky = new Material(skyShader) { name = "Ciel" };
                RenderSettings.skybox = sky;
            }
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.fogMode = FogMode.Exponential;
            SetCloudQuality(clouds);
        }

        public bool AerialPerspective => aerial;

        /// <summary>Aerial perspective in an image pass (MEDIUM and up): the material fog is then switched off.</summary>
        public void SetAerialPerspective(bool enabled) => aerial = enabled;

        public void SetFogDistance(double fogDistanceM) => this.fogDistanceM = fogDistanceM;

        public void SetCloudQuality(CloudQuality q)
        {
            clouds = q;
            if (sky == null) return;
            sky.DisableKeyword("_CLOUDS_FLAT");
            sky.DisableKeyword("_CLOUDS_LAYERED");
            sky.DisableKeyword("_CLOUDS_VOLUMETRIC");
            sky.EnableKeyword(q == CloudQuality.Flat ? "_CLOUDS_FLAT" : q == CloudQuality.Layered ? "_CLOUDS_LAYERED" : "_CLOUDS_VOLUMETRIC");
        }

        public void Apply(Core.RenderData.Atmosphere a, TimeOfDay time, double frameS, Camera camera)
        {
            Lighting l = a.Light;
            elapsedS += frameS;
            Rgb haze = Fog.HazeColor(l);
            camera.backgroundColor = ShaderGlobals.ForUnityColor(haze);
            double fogDensity = Atmospheres.DistanceFogDensity(a, Fog.DensityFor(fogDistanceM, Fog.DistanceFogVisibilityFor(time)));
            RenderSettings.fog = !aerial;
            RenderSettings.fogDensity = (float)fogDensity;
            RenderSettings.fogColor = ShaderGlobals.ForUnityColor(haze);
            HeightFog heightFog = Fog.HeightFogFor(time);
            Shader.SetGlobalVector(ShaderGlobals.HeightFog, new Vector4(aerial ? 0f : (float)heightFog.Density, 1f / (float)heightFog.Thickness, (float)heightFogBaseY, 0));
            Shader.SetGlobalVector(ShaderGlobals.Haze, ShaderGlobals.V(haze));
            Air = new AerialState
            {
                DistanceDensity = fogDensity,
                HeightDensity = heightFog.Density * AerialHeightFogShare,
                HeightThicknessM = heightFog.Thickness,
                HeightBaseY = heightFogBaseY,
                Haze = haze,
                SunDirection = l.SunDirection,
                SunScatter = l.SunColor.Scale(l.SunIntensity * AerialSunScatter),
            };

            // Hemispheric ambient (Babylon HemisphericLight): sky above, grass bounce below, their mean at the horizon.
            Rgb up = l.AmbientColor.Scale(l.AmbientIntensity), down = l.AmbientGroundColor.Scale(l.AmbientIntensity);
            RenderSettings.ambientSkyColor = ShaderGlobals.ForUnityColor(up);
            RenderSettings.ambientEquatorColor = ShaderGlobals.ForUnityColor(Rgb.Mix(up, down, 0.5));
            RenderSettings.ambientGroundColor = ShaderGlobals.ForUnityColor(down);

            Sun.color = ShaderGlobals.ForUnityColor(l.SunColor);
            Sun.intensity = (float)l.SunIntensity;
            var dir = new Vector3((float)l.SunDirection.X, (float)l.SunDirection.Y, (float)l.SunDirection.Z);
            Sun.transform.rotation = Quaternion.LookRotation(dir, Mathf.Abs(dir.y) > 0.99f ? Vector3.forward : Vector3.up);

            Shader.SetGlobalVector(ShaderGlobals.SunToward, new Vector4(-dir.x, -dir.y, -dir.z, 0));
            Shader.SetGlobalVector(ShaderGlobals.SunColor, ShaderGlobals.V(l.SunColor));
            UpdateSky(l, haze, a, Cosmos.For(time));
        }

        private void UpdateSky(Lighting l, Rgb haze, Core.RenderData.Atmosphere a, Cosmos cosmos)
        {
            if (sky == null) return;
            sky.SetVector(SkyZenith, ShaderGlobals.V(l.SkyZenith));
            sky.SetVector(SkyHorizon, ShaderGlobals.V(l.SkyHorizon));
            sky.SetVector(SkyHaze, ShaderGlobals.V(haze));
            sky.SetVector(SunDirSky, new Vector4((float)-l.SunDirection.X, (float)-l.SunDirection.Y, (float)-l.SunDirection.Z, 0));
            sky.SetVector(SunColorSky, ShaderGlobals.V(l.SunColor));
            sky.SetVector(CloudLight, ShaderGlobals.V(l.CloudLight));
            sky.SetVector(CloudShade, ShaderGlobals.V(l.CloudShade));
            float mode = clouds == CloudQuality.Flat ? 0 : clouds == CloudQuality.Layered ? 1 : 2;
            sky.SetVector(SkyParams, new Vector4((float)(elapsedS % SkyTimeWrapS), mode, (float)l.StarVisibility, (float)l.SunGlow));
            sky.SetVector(SkyWeather, new Vector4((float)a.CloudCover, (float)a.Flash, SunDiscHdr, (float)a.Rain));
            sky.SetVector(SkyCosmos, new Vector4((float)cosmos.Rotation, (float)cosmos.Aurora, (float)a.Fog, 0));
        }
    }

    /// <summary>
    /// Port of babylon/sky-environment: image-based lighting from the sky of the hour. A realtime reflection probe that sees
    /// only the skybox, refreshed every refreshS seconds at the camera; its strength follows the real light (IblIntensityFor).
    /// </summary>
    public sealed class SkyEnvironment
    {
        private readonly ReflectionProbe probe;
        private readonly double refreshS;
        private double sinceRefreshS = double.PositiveInfinity;

        public SkyEnvironment(int size, double refreshS)
        {
            this.refreshS = refreshS;
            UnityEngine.QualitySettings.realtimeReflectionProbes = true;
            var go = new GameObject("Sonde du ciel (IBL)");
            probe = go.AddComponent<ReflectionProbe>();
            probe.mode = ReflectionProbeMode.Realtime;
            probe.refreshMode = ReflectionProbeRefreshMode.ViaScripting;
            probe.timeSlicingMode = ReflectionProbeTimeSlicingMode.AllFacesAtOnce;
            probe.resolution = Mathf.ClosestPowerOfTwo(Mathf.Clamp(size, 16, 2048));
            probe.cullingMask = 0; // the sky only
            probe.clearFlags = ReflectionProbeClearFlags.Skybox;
            probe.size = new Vector3(100000, 100000, 100000);
            probe.hdr = false;
            probe.boxProjection = false;
            probe.importance = 100;
        }

        public void SetIntensity(double intensity) => probe.intensity = (float)MathUtil.Clamp01(intensity);

        public void Update(double frameS, Vector3 cameraPosition)
        {
            probe.transform.position = cameraPosition;
            sinceRefreshS += frameS;
            if (sinceRefreshS < refreshS) return;
            sinceRefreshS = 0;
            probe.RenderProbe();
        }

        public void Dispose() => UnityEngine.Object.Destroy(probe.gameObject);
    }
}
