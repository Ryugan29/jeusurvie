// Sky of the hour (port of babylon/sky-dome SKY_FRAGMENT) as a URP SKYBOX: gradient zenith → horizon → haze (computed per pixel
// from the view height, formerly vertex colours), Mie halo (Henyey-Greenstein), clouds per profile (flat / layered / volumetric),
// sun disc with limb darkening (HDR → bloom), night: Milky Way, three star layers, shooting stars, cratered moon; giant planet
// and auroras on the celestial vault turning with the hour; low rain clouds; lightning. Driven by Atmosphere/SkyDome.cs.
Shader "JeuSurvie/Sky"
{
    Properties
    {
        [KeywordEnum(Flat, Layered, Volumetric)] _Clouds ("Clouds", Float) = 1
    }
    SubShader
    {
        Tags { "Queue" = "Background" "RenderType" = "Background" "PreviewType" = "Skybox" "RenderPipeline" = "UniversalPipeline" }
        Cull Off ZWrite Off
        Pass
        {
            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_local _CLOUDS_FLAT _CLOUDS_LAYERED _CLOUDS_VOLUMETRIC
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            float4 _SkyZenith, _SkyHorizon, _SkyHaze;   // linear rgb
            float4 _SunDirSky;     // xyz toward the body
            float4 _SunColorSky;
            float4 _CloudLight, _CloudShade;
            float4 _SkyParams;     // x: time (s), y: cloud mode, z: stars, w: glow
            float4 _SkyWeather;    // x: cloud cover, y: flash, z: sun disc HDR, w: rain
            float4 _SkyCosmos;     // x: vault rotation, y: aurora strength, z: fog (sky haze)

            struct Attributes { float4 positionOS : POSITION; };
            struct Varyings { float4 positionCS : SV_POSITION; float3 dir : TEXCOORD0; };

            Varyings vert(Attributes v)
            {
                Varyings o;
                o.positionCS = TransformObjectToHClip(v.positionOS.xyz);
                o.dir = v.positionOS.xyz;
                return o;
            }

            #define sunDir _SunDirSky.xyz
            #define sunColor _SunColorSky.rgb
            #define cloudLight _CloudLight.rgb
            #define cloudShade _CloudShade.rgb
            #define sky _SkyParams
            #define weather _SkyWeather
            #define cosmos _SkyCosmos

            float hash(float2 p) { p = frac(p * float2(123.34, 456.21)); p += dot(p, p + 45.32); return frac(p.x * p.y); }
            float hash3(float3 p) { p = frac(p * float3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yzx + 33.33); return frac((p.x + p.y) * p.z); }
            float noise(float2 p)
            {
                float2 i = floor(p), f = frac(p);
                f = f * f * (3.0 - 2.0 * f);
                return lerp(lerp(hash(i), hash(i + float2(1.0, 0.0)), f.x), lerp(hash(i + float2(0.0, 1.0)), hash(i + float2(1.0, 1.0)), f.x), f.y);
            }
            float fbm(float2 p) { float a = 0.5, s = 0.0; [unroll] for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + float2(17.1, 9.3); a *= 0.5; } return s; }
            float fbm3(float2 p) { float a = 0.5, s = 0.0; [unroll] for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 2.03 + float2(17.1, 9.3); a *= 0.5; } return s / 0.875; }
            float density(float2 p) { p += 0.7 * float2(noise(p * 0.8 + 3.1), noise(p * 0.8 + 8.7)); return fbm(p); }

            static const float3 CELESTIAL_POLE = float3(0.0, 0.342, -0.94);
            float3 toCelestial(float3 v)
            {
                float s = sin(-cosmos.x), c = cos(-cosmos.x);
                return v * c + cross(CELESTIAL_POLE, v) * s + CELESTIAL_POLE * dot(CELESTIAL_POLE, v) * (1.0 - c);
            }

            float3 starLayer(float3 c, float cells, float chance, float minBright, float maxBright, float halo, float sharp)
            {
                float3 p = c * cells;
                float3 id = floor(p);
                float h = hash3(id);
                if (h > chance) return float3(0, 0, 0);
                float3 center = id + 0.3 + 0.4 * float3(hash3(id + 1.31), hash3(id + 4.77), hash3(id + 8.13));
                float d = length(p - center);
                float bright = lerp(minBright, maxBright, pow(hash3(id + 2.9), 3.0));
                float twinkle = 0.75 + 0.25 * sin(sky.x * (1.5 + 4.0 * hash3(id + 6.6)) + h * 60.0);
                float t = hash3(id + 9.4);
                float3 tint = t < 0.3 ? float3(0.72, 0.82, 1.0) : (t < 0.85 ? float3(1.0, 0.97, 0.92) : float3(1.0, 0.8, 0.56));
                return tint * bright * twinkle * (exp(-d * d * sharp) + halo * 0.22 * exp(-d * 7.0) * smoothstep(0.3, 0.1, d));
            }

            float3 milkyWay(float3 c)
            {
                float3 n = normalize(float3(0.35, 0.55, 0.76));
                float b = dot(c, n);
                float band = exp(-b * b * 22.0);
                if (band < 0.01) return float3(0, 0, 0);
                float3 t1 = normalize(cross(n, float3(0.0, 1.0, 0.0)));
                float3 t2 = cross(n, t1);
                float2 q = float2(dot(c, t1), dot(c, t2)) * (3.0 + b * 6.0);
                float nebula = fbm3(q * 1.7);
                float dust = smoothstep(0.5, 0.75, fbm3(q * 3.1 + 11.0)) * exp(-b * b * 120.0);
                float3 tint = lerp(float3(0.45, 0.55, 1.0), float3(0.95, 0.6, 0.95), smoothstep(0.35, 0.75, nebula));
                tint = lerp(tint, float3(1.0, 0.85, 0.65), exp(-b * b * 90.0) * 0.6);
                return tint * band * smoothstep(0.25, 0.8, nebula) * (1.0 - dust * 0.85) * 0.22;
            }

            float shootingStar(float3 dir)
            {
                float slot = floor(sky.x / 5.0);
                if (hash(float2(slot, 3.7)) > 0.45) return 0.0;
                float prog = (sky.x - slot * 5.0 - hash(float2(slot, 8.1)) * 3.5) / 0.8;
                if (prog < 0.0 || prog > 1.0) return 0.0;
                float az = hash(float2(slot, 1.9)) * 6.2831;
                float el = 0.45 + 0.6 * hash(float2(slot, 5.3));
                float3 s = float3(cos(el) * sin(az), sin(el), cos(el) * cos(az));
                float3 down = normalize(float3(0.0, -1.0, 0.0) + s * s.y);
                float3 side = normalize(cross(s, down));
                float3 travel = normalize(down * 0.8 + side * (hash(float2(slot, 6.2)) - 0.5) * 2.0);
                float3 head = normalize(s + travel * prog * 0.35);
                float3 tail = normalize(s + travel * max(prog * 0.35 - 0.12, 0.0));
                float3 ab = head - tail;
                float along = clamp(dot(dir - tail, ab) / max(dot(ab, ab), 0.000001), 0.0, 1.0);
                float dist = length(dir - (tail + ab * along));
                return smoothstep(0.0025, 0.0, dist) * along * along * sin(prog * 3.1416) * 3.0;
            }

            static const float PLANET_RADIUS = 0.14;
            float4 planet(float3 c)
            {
                float3 p = normalize(float3(0.174, 0.337, -0.926));
                if (dot(c, p) < cos(PLANET_RADIUS * 1.35)) return float4(0, 0, 0, 0);
                float3 r1 = normalize(cross(p, float3(0.0, 0.0, 1.0)));
                float3 u1 = cross(r1, p);
                float3 sunC = normalize(r1 * 0.8 + u1 * 0.35 - p * 0.5);
                float2 q = float2(dot(c, r1), dot(c, u1)) / sin(PLANET_RADIUS);
                float r = length(q);
                float disc = smoothstep(1.0, 0.985, r);
                float3 n = normalize(q.x * r1 + q.y * u1 - sqrt(max(0.0, 1.0 - r * r)) * p);
                float lit = smoothstep(-0.12, 0.4, dot(n, sunC));
                float3 axis = normalize(u1 * 0.94 + r1 * 0.34);
                float lat = dot(n, axis);
                float lon = dot(n, cross(axis, p));
                float swirl = fbm3(float2(lat * 6.0, lon * 1.5));
                float bands = 0.5 + 0.5 * sin(lat * 10.0 + swirl * 3.0);
                float3 surface = lerp(float3(0.16, 0.52, 0.58), float3(0.5, 0.32, 0.72), bands);
                surface = lerp(surface, float3(0.95, 0.7, 0.42), smoothstep(0.62, 0.8, swirl) * 0.7);
                float limb = 1.0 - sqrt(max(0.0, 1.0 - r * r));
                float3 col = (surface * (0.035 + 1.25 * lit) + float3(0.35, 0.8, 1.0) * limb * limb * lit * 0.8) * disc;
                float2 outward = q / max(r, 0.0001);
                float halo = (1.0 - disc) * exp(-max(r - 1.0, 0.0) * 22.0) * smoothstep(-0.2, 0.5, dot(outward.x * r1 + outward.y * u1, sunC)) * 0.35;
                return float4(col + float3(0.3, 0.75, 1.0) * halo, disc);
            }

            float3 aurora(float3 dir, float up)
            {
                float a = atan2(dir.x, dir.z);
                float sector = smoothstep(1.7, 0.5, abs(a));
                if (sector <= 0.0 || up < 0.02 || up > 0.85) return float3(0, 0, 0);
                float t = sky.x * 0.04;
                float3 total = float3(0, 0, 0);
                [unroll] for (int i = 0; i < 2; i++)
                {
                    float fi = float(i);
                    float base = 0.16 + fi * 0.09 + 0.06 * sin(a * (2.1 + fi) + t * (3.0 - fi)) + 0.05 * noise(float2(a * 3.0 + fi * 7.0, t * 2.0));
                    float h = up - base;
                    float rays = noise(float2(a * (26.0 + fi * 9.0) + noise(float2(a * 4.0, t * 3.0)) * 3.0, t * 4.0 + fi));
                    float curtain = smoothstep(-0.015, 0.02, h) * exp(-max(h, 0.0) * (5.0 + fi * 2.0)) * (0.3 + 0.7 * rays);
                    float3 tint = lerp(float3(0.1, 1.0, 0.55), float3(0.55, 0.25, 1.0), smoothstep(0.0, 0.3, h));
                    total += tint * curtain * (1.0 - fi * 0.35);
                }
                return total * sector;
            }

            float hgPhase(float mu, float g)
            {
                float g2 = g * g;
                return (1.0 - g2) / (12.566371 * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
            }

        #if defined(_CLOUDS_VOLUMETRIC)
            static const float CLOUD_BASE = 1.0;
            static const float CLOUD_TOP = 1.55;
            #define CLOUD_STEPS 22
            #define CLOUD_LIGHT_STEPS 3
            float cloudDensity(float3 p)
            {
                float hf = clamp((p.y - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE), 0.0, 1.0);
                float profile = smoothstep(0.0, 0.12, hf) * smoothstep(1.0, 0.35, hf);
                float2 q = p.xz * 0.55 + float2(0.37, 0.11) * sky.x * 0.012;
                float base = fbm3(q + 0.6 * float2(noise(q * 0.7 + 3.1), noise(q * 0.7 + 8.7)));
                float threshold = lerp(0.62, 0.3, weather.x);
                float shape = (base - threshold) * 3.2 - (1.0 - profile) * 0.9;
                if (shape <= 0.0) return 0.0;
                float detail = noise(q * 5.3 + float2(hf * 2.7, sky.x * 0.01)) * 0.6 + noise(q * 11.0 - hf * 3.1) * 0.4;
                return clamp(shape - (detail - 0.35) * 0.45 * (1.0 - hf * 0.5), 0.0, 1.0);
            }
            float4 volumetricClouds(float3 dir, float up, float mu, float2 fragCoord, float3 gradient)
            {
                if (up < 0.012) return float4(0, 0, 0, 0);
                float t0 = CLOUD_BASE / up, t1 = CLOUD_TOP / up;
                t1 = min(t1, t0 + 6.0);
                float dt = (t1 - t0) / float(CLOUD_STEPS);
                float jitter = hash(fragCoord + frac(sky.x) * 17.0);
                float T = 1.0;
                float3 S = float3(0, 0, 0);
                float phase = lerp(hgPhase(mu, 0.6), hgPhase(mu, -0.2), 0.3) * 4.0;
                [loop] for (int i = 0; i < CLOUD_STEPS; i++)
                {
                    float3 p = dir * (t0 + (float(i) + jitter) * dt);
                    float d = cloudDensity(p);
                    if (d < 0.01) continue;
                    float od = 0.0;
                    [unroll] for (int j = 1; j <= CLOUD_LIGHT_STEPS; j++) od += cloudDensity(p + sunDir * (0.09 * float(j)));
                    float beer = exp(-od * 1.8);
                    float powder = 1.0 - exp(-d * 5.0);
                    float hf = clamp((p.y - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE), 0.0, 1.0);
                    float3 ambient = lerp(cloudShade, lerp(cloudShade, cloudLight, 0.55), hf);
                    float3 direct = lerp(cloudLight * 0.9, sunColor, 0.25) * beer * lerp(0.5, 1.0, powder) * (0.7 + 0.6 * phase) * sky.w;
                    float ext = d * 2.8 * dt * 4.0;
                    float absorbed = 1.0 - exp(-ext);
                    S += T * absorbed * (ambient * 0.85 + direct);
                    T *= 1.0 - absorbed;
                    if (T < 0.02) break;
                }
                float fade = smoothstep(0.012, 0.12, up);
                float3 lit = lerp(S, gradient * (1.0 - T), 0.35 * (1.0 - smoothstep(0.0, 0.3, up)));
                return float4(lit * fade, (1.0 - T) * fade);
            }
        #endif

            static const float MOON_RADIUS = 0.032;

            half4 frag(Varyings i) : SV_Target
            {
                float3 dir = normalize(i.dir);
                float up = dir.y;
                // Gradient (formerly vertex colours of the dome): horizon → zenith (√ height), haze at the horizon, fog climbing.
                float t = sqrt(saturate(up));
                float hazeW = 1.0 - smoothstep(0.0, 0.15, up);
                float fogged = cosmos.z * (1.0 - smoothstep(0.0, 0.7, max(0.0, up)));
                float w = max(hazeW, fogged);
                float3 gradient = lerp(_SkyHorizon.rgb * (1.0 - t) + _SkyZenith.rgb * t, _SkyHaze.rgb, w);
                float3 col = gradient;
                float cosSun = max(dot(dir, sunDir), 0.0);
                float night = sky.z;
                float clearSky = 1.0 - weather.x * 0.88;
                float mu = dot(dir, sunDir);
                float aerosol = 0.35 + 0.65 * pow(1.0 - clamp(up, 0.0, 1.0), 3.0);
                float3 glow = sunColor * (hgPhase(mu, 0.76) * 0.11 * aerosol + hgPhase(mu, 0.2) * 0.12 + pow(cosSun, 900.0) * 0.5);
                col += glow * sky.w * clearSky;
                float2 flatDir = normalize(dir.xz + float2(0.0001, 0.0001));
                float side = dot(flatDir, normalize(sunDir.xz + float2(0.0001, 0.0001))) * (1.0 - smoothstep(0.0, 0.45, up)) * sky.w;
                col *= 1.0 + side * float3(0.07, 0.035, -0.04) * clearSky;
                float3 cdir = toCelestial(dir);
                float clearNight = night * (1.0 - weather.x * 0.6) * smoothstep(0.0, 0.25, up);
                if (clearNight > 0.001)
                {
                    col += milkyWay(cdir) * clearNight;
                    col += (starLayer(cdir, 220.0, 0.55, 0.12, 0.55, 0.0, 40.0)
                          + starLayer(cdir + 0.37, 110.0, 0.2, 0.4, 1.3, 0.3, 90.0)
                          + starLayer(cdir + 0.71, 42.0, 0.1, 2.0, 7.0, 1.0, 300.0)) * clearNight;
                    col += float3(1.0, 0.95, 0.85) * shootingStar(dir) * clearNight;
                }
                float4 pl = planet(cdir);
                float planetSky = smoothstep(-0.02, 0.2, up) * (1.0 - weather.x * 0.85);
                col = lerp(col, col * (1.0 - night * 0.97), pl.a * planetSky);
                col += pl.rgb * planetSky * lerp(0.45, 1.0, night);
                if (night > 0.001 && cosmos.y > 0.0) col += aurora(dir, up) * cosmos.y * night * (1.0 - weather.x * 0.9) * 0.9;
                float visible = clearSky * step(-0.04, sunDir.y) * sky.w;
                float isMoon = smoothstep(0.15, 0.5, night);
                float sunDisc = smoothstep(0.99955, 0.9998, cosSun);
                float limb = sqrt(clamp((cosSun - 0.99955) / 0.00045, 0.0, 1.0));
                col += sunColor * sunDisc * (0.55 + 0.45 * limb) * weather.z * visible * (1.0 - isMoon);
                if (isMoon > 0.0)
                {
                    float3 mR = normalize(cross(sunDir, float3(0.0, 1.0, 0.0)) + float3(0.0001, 0.0, 0.0));
                    float3 mU = cross(mR, sunDir);
                    float2 mq = float2(dot(dir, mR), dot(dir, mU)) / MOON_RADIUS;
                    float mr = length(mq);
                    if (mr < 1.0 && dot(dir, sunDir) > 0.0)
                    {
                        float moonDisc = smoothstep(1.0, 0.93, mr);
                        float3 moon = float3(0.85, 0.88, 0.96) * (0.6 + 0.55 * smoothstep(0.3, 0.7, fbm(mq * 1.4 + 7.3)))
                                    * (0.7 + 0.3 * sqrt(max(0.0, 1.0 - mr * mr))) * 1.8;
                        col = lerp(col, moon, moonDisc * isMoon * min(1.0, visible * 2.2));
                    }
                }
                float cover = 0.0;
                float2 toSunFlat = normalize(sunDir.xz + float2(0.0001, 0.0001));
            #if defined(_CLOUDS_VOLUMETRIC)
                float4 vol = volumetricClouds(dir, up, mu, i.positionCS.xy, gradient);
                col = col * (1.0 - vol.a) + vol.rgb;
                cover = vol.a;
            #else
                {
                    float2 uv = dir.xz / (up + 0.2) * 2.2 + float2(0.37, 0.11) * sky.x * 0.02;
                #if defined(_CLOUDS_FLAT)
                    float d = fbm3(uv + 0.6 * float2(noise(uv * 0.8 + 3.1), noise(uv * 0.8 + 8.7)));
                    float dSun = fbm3(uv + toSunFlat * 0.16 + 0.6 * float2(noise(uv * 0.8 + 3.1), noise(uv * 0.8 + 8.7)));
                #else
                    float d = density(uv);
                    float dSun = density(uv + toSunFlat * 0.16);
                #endif
                    float threshold = lerp(0.6, 0.3, weather.x);
                    float thick = max(d - threshold, 0.0);
                    cover = (1.0 - exp(-thick * 18.0)) * smoothstep(0.02, 0.2, up);
                    float towardSun = max(dSun - threshold, 0.0);
                    float beer = exp(-towardSun * 7.0);
                    float powder = 1.0 - exp(-thick * 9.0);
                    float lit = clamp(beer * lerp(0.55, 1.0, powder), 0.0, 1.0);
                    float3 cloud = lerp(cloudShade, cloudLight, lit);
                    cloud += sunColor * hgPhase(mu, 0.55) * beer * (1.0 - powder * 0.5) * 0.5 * clearSky;
                    cloud = lerp(cloud, gradient, 0.3 * (1.0 - smoothstep(0.0, 0.35, up)));
                    col = lerp(col, cloud, cover * 0.97);
                }
            #endif
            #if !defined(_CLOUDS_FLAT)
                if (weather.w > 0.01)
                {
                    float2 uvLow = dir.xz / (up + 0.08) * 3.4 + float2(0.9, 0.35) * sky.x * 0.06 + 5.7;
                    float dl = density(uvLow);
                    float dlSun = density(uvLow + normalize(sunDir.xz + float2(0.0001, 0.0001)) * 0.12);
                    float low = smoothstep(0.4, 0.6, dl) * smoothstep(0.0, 0.1, up) * weather.w;
                    float lowLit = clamp(0.45 + (dl - dlSun) * 3.0, 0.0, 1.0);
                    float3 lowCol = lerp(cloudShade * 0.6, lerp(cloudShade, cloudLight, 0.35), lowLit);
                    lowCol = lerp(lowCol, gradient * 0.8, 0.3 * (1.0 - smoothstep(0.0, 0.25, up)));
                    col = lerp(col, lowCol, low * 0.92);
                    cover = max(cover, low);
                }
            #endif
                col += weather.y * float3(0.5, 0.55, 0.7) * (0.6 + 0.4 * cover);
                return half4(col, 1.0);
            }
            ENDHLSL
        }
    }
    FallBack Off
}
