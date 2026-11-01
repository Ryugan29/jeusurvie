#ifndef MOCK_NORMALS
#define MOCK_NORMALS
Texture2D _CameraNormalsTexture; SamplerState sampler_CameraNormalsTexture;
float3 SampleSceneNormals(float2 uv) { return _CameraNormalsTexture.Sample(sampler_CameraNormalsTexture, uv).xyz; }
#endif
