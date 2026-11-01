#ifndef MOCK_DEPTH
#define MOCK_DEPTH
Texture2D _CameraDepthTexture; SamplerState sampler_CameraDepthTexture;
float SampleSceneDepth(float2 uv) { return _CameraDepthTexture.Sample(sampler_CameraDepthTexture, uv).r; }
float3 ComputeWorldSpacePosition(float2 uv, float d, float4x4 m) { float4 p = mul(m, float4(uv * 2 - 1, d, 1)); return p.xyz / p.w; }
float LinearEyeDepth(float d, float4 zb) { return 1.0 / (zb.z * d + zb.w); }
#endif
