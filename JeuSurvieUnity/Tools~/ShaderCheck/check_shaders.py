#!/usr/bin/env python3
"""Syntax/type check of the Jeu Survie .shader files with glslang (HLSL front end) and mock URP includes.
Each pass is extracted (HLSLINCLUDE + HLSLPROGRAM), its #pragma vertex/fragment entry points compiled with every
shader_feature/multi_compile keyword OFF and then ON. Usage: python3 check_shaders.py <Shaders folder>"""
import os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
MOCK = {
    'Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl': 'core.hlsl',
    'Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl': 'core.hlsl',
    'Packages/com.unity.render-pipelines.core/ShaderLibrary/Common.hlsl': 'core.hlsl',
    'Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl': 'blit.hlsl',
    'Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl': 'depth.hlsl',
    'Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareNormalsTexture.hlsl': 'normals.hlsl',
}

def resolve(code, shader_dir, seen=None):
    """Inlines every #include (mocked URP files, real project files), each file once."""
    seen = set() if seen is None else seen
    def repl(m):
        inc = m.group(1)
        path = os.path.join(HERE, 'mock', MOCK[inc]) if inc in MOCK else os.path.join(shader_dir, inc)
        if path in seen: return ''
        seen.add(path)
        return resolve(open(path).read(), shader_dir, seen)
    return re.sub(r'#include\s+"([^"]+)"', repl, code)

def blocks(text, tag):
    return re.findall(r'%s(.*?)ENDHLSL' % tag, text, re.S)

def main(folder):
    failures, checked = 0, 0
    for name in sorted(os.listdir(folder)):
        if not name.endswith('.shader'): continue
        text = open(os.path.join(folder, name)).read()
        include = ''.join(blocks(text, 'HLSLINCLUDE'))
        for i, prog in enumerate(blocks(text, 'HLSLPROGRAM')):
            keywords = set()
            for m in re.finditer(r'#pragma\s+(?:shader_feature\w*|multi_compile\w*)[ \t]+(.*)', prog):
                keywords.update(k for k in m.group(1).split() if k != '_' and not k.startswith('_CASTING'))
            for variant in ('off', 'on'):
                defines = ''
                if variant == 'on':
                    exclusive = [k for k in keywords if k.startswith('_CLOUDS_') or k.startswith('_RAYS_') or k.startswith('_MAIN_LIGHT_SHADOWS') or k.startswith('_SHADOWS_SOFT')]
                    chosen = [k for k in keywords if k not in exclusive] + sorted(exclusive)[-1:]
                    defines = ''.join('#define %s 1\n' % k for k in chosen)
                src = resolve(defines + include + prog, folder)
                for stage, pragma in (('vert', 'vertex'), ('frag', 'fragment')):
                    m = re.search(r'#pragma\s+%s\s+(\w+)' % pragma, prog)
                    if not m: continue
                    with tempfile.NamedTemporaryFile('w', suffix='.hlsl', delete=False) as f:
                        f.write(src)
                    r = subprocess.run(['glslangValidator', '-D', '-V', '-S', stage, '-e', m.group(1), '--auto-map-bindings', '--auto-map-locations', '-o', os.devnull, f.name], capture_output=True, text=True)
                    os.unlink(f.name)
                    checked += 1
                    if r.returncode != 0:
                        failures += 1
                        out = '\n'.join(l for l in r.stdout.splitlines() if 'ERROR' in l)[:1500]
                        print('FAIL %s pass %d %s %s (%s)\n%s' % (name, i, stage, m.group(1), variant, out))
    print('%d entry points checked, %d failures' % (checked, failures))
    return 1 if failures else 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
