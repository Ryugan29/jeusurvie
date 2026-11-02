// GPU generation of the ground matters (port of babylon/ground-textures): for each layer, a « colour » texture (encoded albedo
// factor, height in A) and a « matter » texture (normal xy, roughness, cavity). All noise is periodic: tiles without seams.
// Drawn with a full-screen triangle (SV_VertexID) into RenderTextures by Rendering/GroundTextures.cs.
Shader "Hidden/JeuSurvie/GroundMatter"
{
    SubShader
    {
        Cull Off ZWrite Off ZTest Always
        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.core/ShaderLibrary/Common.hlsl"
        float _Texel;
        float _SlopeScale;
        struct Varyings { float4 positionCS : SV_POSITION; float2 uv : TEXCOORD0; };
        Varyings vert(uint id : SV_VertexID)
        {
            Varyings o;
            float2 uv = float2((id << 1) & 2, id & 2);
            o.positionCS = float4(uv * 2.0 - 1.0, 0.0, 1.0);
            o.uv = uv;
            #if UNITY_UV_STARTS_AT_TOP
            o.uv.y = 1.0 - o.uv.y;
            #endif
            return o;
        }

float mod1(float x, float y) { return x - y * floor(x / y); }
float2 mod2(float2 x, float y) { return x - y * floor(x / y); }
float h12(float2 p) { float3 p3 = frac(float3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return frac((p3.x + p3.y) * p3.z); }
float2 h22(float2 p) { float3 p3 = frac(float3(p.xyx) * float3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return frac((p3.xx + p3.yz) * p3.zy); }
float3 h32(float2 p) { float3 p3 = frac(float3(p.xyx) * float3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return frac((p3.xxy + p3.yzz) * p3.zyx); }
float gnoise(float2 uv, float P, float seed)
{
    float2 p = uv * P;
    float2 i = floor(p);
    float2 fr = p - i;
    float2 u = fr * fr * fr * (fr * (fr * 6.0 - 15.0) + 10.0);
    float2 s = float2(seed * 17.31, seed * 9.73);
    float2 g00 = h22(mod2(i, P) + s) * 2.0 - 1.0;
    float2 g10 = h22(mod2(i + float2(1.0, 0.0), P) + s) * 2.0 - 1.0;
    float2 g01 = h22(mod2(i + float2(0.0, 1.0), P) + s) * 2.0 - 1.0;
    float2 g11 = h22(mod2(i + float2(1.0, 1.0), P) + s) * 2.0 - 1.0;
    float n00 = dot(g00, fr), n10 = dot(g10, fr - float2(1.0, 0.0)), n01 = dot(g01, fr - float2(0.0, 1.0)), n11 = dot(g11, fr - float2(1.0, 1.0));
    return 1.6 * lerp(lerp(n00, n10, u.x), lerp(n01, n11, u.x), u.y);
}
float fbm4(float2 uv, float P, float seed) { float s = 0.0, a = 0.5; [unroll] for (int i = 0; i < 4; i++) { s += a * gnoise(uv, P, seed + float(i) * 3.7); P *= 2.0; a *= 0.5; } return s / 0.9375; }
float fbm6(float2 uv, float P, float seed) { float s = 0.0, a = 0.5; [unroll] for (int i = 0; i < 6; i++) { s += a * gnoise(uv, P, seed + float(i) * 3.7); P *= 2.0; a *= 0.5; } return s / 0.984375; }
float ridged5(float2 uv, float P, float seed) { float s = 0.0, a = 0.5; [unroll] for (int i = 0; i < 5; i++) { float n = 1.0 - abs(gnoise(uv, P, seed + float(i) * 5.1)); s += a * n * n; P *= 2.0; a *= 0.5; } return s / 0.96875; }
float3 voronoi(float2 uv, float P, float seed, float jitter, out float2 rel)
{
    float2 p = uv * P;
    float2 c = floor(p);
    float d1 = 9.0, d2 = 9.0, id = 0.0;
    rel = float2(0.0, 0.0);
    [unroll] for (int j = -1; j <= 1; j++)
    {
        [unroll] for (int i = -1; i <= 1; i++)
        {
            float2 cell = c + float2(float(i), float(j));
            float2 w = mod2(cell, P) + float2(seed * 7.13, seed * 3.31);
            float2 o = cell + 0.5 + (h22(w) - 0.5) * jitter;
            float2 d = o - p;
            float l = length(d);
            if (l < d1) { d2 = d1; d1 = l; id = h12(w + 0.5); rel = d; } else if (l < d2) { d2 = l; }
        }
    }
    return float3(d1, d2, id);
}
struct Matter { float3 albedo; float height; float rough; float ao; };

Matter layer_grass(float2 uv)
{
    float n1 = fbm4(uv, 4.0, 1.0), n2 = fbm4(uv, 24.0, 2.0);
    float3 col = lerp(float3(0.075, 0.056, 0.038), float3(0.15, 0.12, 0.065), smoothstep(-0.3, 0.5, n2));
    float h = 0.12 + 0.08 * n2;
    float rough = 0.95;
    float dryPatch = smoothstep(0.05, 0.55, n1);
    float P = 112.0;
    float2 p = uv * P;
    float2 ci = floor(p);
    [loop] for (int j = -1; j <= 1; j++)
    {
        [loop] for (int i = -1; i <= 1; i++)
        {
            float2 c = ci + float2(float(i), float(j));
            float2 cw = mod2(c, P);
            [loop] for (int k = 0; k < 3; k++)
            {
                float3 r = h32(cw * 1.37 + float(k) * 19.1 + 3.0);
                float3 r2 = h32(cw * 2.11 + float(k) * 7.3 + 11.0);
                float2 root = c + r.xy;
                float ang = r.z * 6.2831853;
                float2 dir = float2(cos(ang), sin(ang));
                float len = 1.3 + 1.6 * r2.x;
                float wid = 0.09 + 0.07 * r2.y;
                float2 d = p - root;
                float t = dot(d, dir);
                if (t < 0.0 || t > len) continue;
                float s = abs(dot(d, float2(-dir.y, dir.x)));
                float tt = t / len;
                float w = wid * (1.0 - 0.85 * tt * tt);
                if (s > w) continue;
                float a = 1.0 - smoothstep(w * 0.55, w, s);
                float bladeH = 0.3 + 0.6 * r2.z + 0.08 * (1.0 - s / w);
                if (bladeH <= h) continue;
                float dry = step(0.8 - 0.35 * dryPatch, h12(cw + float(k) * 3.1 + 41.0));
                float3 green = lerp(float3(0.05, 0.085, 0.022), float3(0.085, 0.13, 0.034), r2.x);
                float3 straw = lerp(float3(0.19, 0.16, 0.075), float3(0.27, 0.23, 0.12), r2.y);
                float3 bc = lerp(green, straw, dry) * (0.78 + 0.34 * tt);
                col = lerp(col, bc, a);
                h = lerp(h, bladeH, a);
                rough = lerp(rough, lerp(0.62, 0.8, dry), a);
            }
        }
    }
    col *= 0.9 + 0.2 * smoothstep(-0.6, 0.6, n1);
    Matter m;
    m.albedo = col;
    m.height = saturate(h);
    m.rough = rough;
    m.ao = lerp(0.5, 1.0, smoothstep(0.08, 0.6, h));
    return m;
}

float pebbles(float2 uv, float P, float seed, float chance, float rMin, float rMax, inout float3 col, inout float h, inout float rough, inout float ao)
{
    float2 rel;
    float3 v = voronoi(uv, P, seed, 0.7, rel);
    if (v.z > chance) return 0.0;
    float3 r = h32(float2(v.z * 91.7, seed));
    float radius = lerp(rMin, rMax, r.x);
    float ang = atan2(rel.y, rel.x);
    float d = v.x / (radius * (1.0 + 0.14 * sin(3.0 * ang + r.y * 6.28) + 0.07 * sin(5.0 * ang + r.z * 6.28)));
    if (d >= 1.25) return 0.0;
    ao *= lerp(0.6, 1.0, smoothstep(0.95, 1.25, d));
    if (d >= 1.0) return 0.0;
    float dome = sqrt(max(0.0, 1.0 - d * d));
    float3 stone = lerp(float3(0.16, 0.15, 0.135), float3(0.3, 0.27, 0.22), r.y) * (0.85 + 0.3 * r.z);
    stone *= 0.85 + 0.25 * gnoise(uv, P * 8.0, seed + 2.0);
    float a = smoothstep(1.0, 0.9, d);
    col = lerp(col, stone, a);
    h = lerp(h, 0.55 + 0.4 * dome * lerp(0.6, 1.0, r.x), a);
    rough = lerp(rough, 0.6 + 0.15 * r.z, a);
    return a;
}
Matter layer_soil(float2 uv)
{
    float n1 = fbm4(uv, 3.0, 5.0), n2 = fbm4(uv, 16.0, 6.0), n3 = gnoise(uv, 160.0, 7.0);
    float3 col = float3(0.13, 0.098, 0.07) * (0.86 + 0.22 * n1 + 0.14 * n2 + 0.07 * n3);
    float damp = smoothstep(0.05, 0.6, n1);
    col *= 1.0 - 0.28 * damp;
    float h = 0.32 + 0.12 * n2 + 0.05 * n3;
    float rough = lerp(0.93, 0.8, damp);
    float ao = 1.0;
    float2 rel;
    float3 cr = voronoi(uv + 0.02 * float2(n2, n1), 9.0, 8.0, 0.9, rel);
    float crack = (1.0 - smoothstep(0.0, 0.045, cr.y - cr.x)) * smoothstep(0.0, 0.35, -n1);
    h -= 0.16 * crack;
    col *= 1.0 - 0.5 * crack;
    ao *= 1.0 - 0.45 * crack;
    pebbles(uv, 18.0, 10.0, 0.42, 0.2, 0.42, col, h, rough, ao);
    pebbles(uv, 56.0, 12.0, 0.32, 0.18, 0.34, col, h, rough, ao);
    pebbles(uv, 150.0, 14.0, 0.25, 0.2, 0.4, col, h, rough, ao);
    Matter m;
    m.albedo = col;
    m.height = saturate(h);
    m.rough = rough;
    m.ao = ao * lerp(0.75, 1.0, smoothstep(0.15, 0.5, h));
    return m;
}

Matter layer_rock(float2 uv)
{
    float2 warp = float2(fbm4(uv, 3.0, 20.0), fbm4(uv, 3.0, 21.0));
    float2 q = uv + 0.035 * warp;
    float ridge = ridged5(q, 5.0, 22.0);
    float detail = fbm4(q, 40.0, 26.0);
    float2 relBig, relFine;
    float3 v = voronoi(q, 4.0, 23.0, 0.85, relBig);
    float crack = 1.0 - smoothstep(0.0, 0.04, v.y - v.x);
    float3 vf = voronoi(q, 14.0, 27.0, 0.9, relFine);
    float fine = 1.0 - smoothstep(0.0, 0.025, vf.y - vf.x);
    float3 tilt = h32(float2(v.z * 37.1, 4.0)) - 0.5;
    float facet = dot(relBig, tilt.xy) * 0.35;
    float strata = sin((q.y * 18.0 + 0.6 * fbm4(q, 4.0, 24.0)) * 6.2831853);
    float h = 0.42 + 0.28 * ridge + 0.05 * strata + facet + 0.06 * detail - 0.32 * crack - 0.08 * fine;
    float tone = fbm4(q, 6.0, 28.0);
    float3 col = lerp(float3(0.15, 0.145, 0.14), float3(0.25, 0.235, 0.215), smoothstep(-0.5, 0.6, tone));
    col *= 0.88 + 0.22 * ridge + 0.06 * detail;
    float iron = smoothstep(0.25, 0.7, fbm4(q, 5.0, 29.0)) * 0.6;
    col = lerp(col, float3(0.24, 0.16, 0.1), iron * 0.5);
    float lichenMask = smoothstep(0.32, 0.55, fbm6(uv, 6.0, 25.0)) * smoothstep(0.35, 0.6, h) * (1.0 - crack);
    float lichenKind = step(0.0, gnoise(uv, 3.0, 31.0));
    float3 lichen = lerp(float3(0.2, 0.2, 0.085), float3(0.36, 0.36, 0.32), lichenKind) * (0.85 + 0.3 * gnoise(uv, 90.0, 32.0));
    col = lerp(col, lichen, lichenMask * 0.85);
    col *= 1.0 - 0.6 * crack - 0.25 * fine;
    Matter m;
    m.albedo = col;
    m.height = saturate(h);
    m.rough = lerp(0.78 + 0.1 * detail, 0.95, lichenMask);
    m.ao = (1.0 - 0.55 * crack - 0.2 * fine) * lerp(0.6, 1.0, smoothstep(0.15, 0.6, h));
    return m;
}

Matter layer_snow(float2 uv)
{
    float n1 = fbm4(uv, 3.0, 40.0), n2 = fbm4(uv, 20.0, 41.0);
    float ripple = sin((uv.x * 4.0 + uv.y * 9.0 + 0.45 * fbm4(uv, 4.0, 42.0)) * 6.2831853);
    float h = 0.5 + 0.2 * n1 + 0.07 * ripple + 0.04 * n2;
    float3 col = lerp(float3(0.72, 0.77, 0.86), float3(0.83, 0.85, 0.88), smoothstep(0.25, 0.75, h));
    col *= 0.97 + 0.04 * n2;
    float sparkle = step(0.9965, h12(floor(uv * 1400.0) + 3.0));
    Matter m;
    m.albedo = col;
    m.height = saturate(h);
    m.rough = lerp(0.58, 0.18, sparkle);
    m.ao = lerp(0.82, 1.0, smoothstep(0.3, 0.7, h));
    return m;
}
        ENDHLSL
        Pass
        {
            Name "grass_color"
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            float4 frag(Varyings i) : SV_Target
            {
                float2 uv = i.uv;
    Matter m = layer_grass(uv);
    float3 factor = m.albedo / float3(0.072, 0.088, 0.04);
    return float4(sqrt(saturate(factor / 3.0)), m.height);
            }
            ENDHLSL
        }
        Pass
        {
            Name "grass_matter"
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            float4 frag(Varyings i) : SV_Target
            {
                float2 uv = i.uv;
    Matter m = layer_grass(uv);
    float hx = layer_grass(uv + float2(_Texel, 0.0)).height;
    float hy = layer_grass(uv + float2(0.0, _Texel)).height;
    float3 n = normalize(float3(-(hx - m.height) * _SlopeScale, -(hy - m.height) * _SlopeScale, 1.0));
    return float4(n.xy * 0.5 + 0.5, m.rough, m.ao);
            }
            ENDHLSL
        }
        Pass
        {
            Name "soil_color"
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            float4 frag(Varyings i) : SV_Target
            {
                float2 uv = i.uv;
    Matter m = layer_soil(uv);
    float3 factor = m.albedo / float3(0.125, 0.098, 0.074);
    return float4(sqrt(saturate(factor / 3.0)), m.height);
            }
            ENDHLSL
        }
        Pass
        {
            Name "soil_matter"
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            float4 frag(Varyings i) : SV_Target
            {
                float2 uv = i.uv;
    Matter m = layer_soil(uv);
    float hx = layer_soil(uv + float2(_Texel, 0.0)).height;
    float hy = layer_soil(uv + float2(0.0, _Texel)).height;
    float3 n = normalize(float3(-(hx - m.height) * _SlopeScale, -(hy - m.height) * _SlopeScale, 1.0));
    return float4(n.xy * 0.5 + 0.5, m.rough, m.ao);
            }
            ENDHLSL
        }
        Pass
        {
            Name "rock_color"
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            float4 frag(Varyings i) : SV_Target
            {
                float2 uv = i.uv;
    Matter m = layer_rock(uv);
    float3 factor = m.albedo / float3(0.19, 0.18, 0.165);
    return float4(sqrt(saturate(factor / 3.0)), m.height);
            }
            ENDHLSL
        }
        Pass
        {
            Name "rock_matter"
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            float4 frag(Varyings i) : SV_Target
            {
                float2 uv = i.uv;
    Matter m = layer_rock(uv);
    float hx = layer_rock(uv + float2(_Texel, 0.0)).height;
    float hy = layer_rock(uv + float2(0.0, _Texel)).height;
    float3 n = normalize(float3(-(hx - m.height) * _SlopeScale, -(hy - m.height) * _SlopeScale, 1.0));
    return float4(n.xy * 0.5 + 0.5, m.rough, m.ao);
            }
            ENDHLSL
        }
        Pass
        {
            Name "snow_color"
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            float4 frag(Varyings i) : SV_Target
            {
                float2 uv = i.uv;
    Matter m = layer_snow(uv);
    float3 factor = m.albedo / float3(0.78, 0.81, 0.86);
    return float4(sqrt(saturate(factor / 3.0)), m.height);
            }
            ENDHLSL
        }
        Pass
        {
            Name "snow_matter"
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            float4 frag(Varyings i) : SV_Target
            {
                float2 uv = i.uv;
    Matter m = layer_snow(uv);
    float hx = layer_snow(uv + float2(_Texel, 0.0)).height;
    float hy = layer_snow(uv + float2(0.0, _Texel)).height;
    float3 n = normalize(float3(-(hx - m.height) * _SlopeScale, -(hy - m.height) * _SlopeScale, 1.0));
    return float4(n.xy * 0.5 + 0.5, m.rough, m.ao);
            }
            ENDHLSL
        }
    }
}
