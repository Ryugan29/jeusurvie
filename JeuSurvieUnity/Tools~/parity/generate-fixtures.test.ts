// Parity fixture generator: runs the ORIGINAL Babylon.js project code (src/) and dumps reference values that the C# port
// (JeuSurvieUnity/Assets/JeuSurvie/Scripts/Core) must reproduce. Run: npx vitest run --config JeuSurvieUnity/Tools~/parity/vitest.parity.config.ts
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { hash2 } from '../../../src/core/shared/hash';
import { erodedFbm2, fbm2, gradientNoise2, ridgedFbm2, ridgedMultifractal2 } from '../../../src/core/world/noise';
import { heightAt, terrainRegionsAt } from '../../../src/core/world/terrain';
import { biomeAt } from '../../../src/core/world/biome';
import { surfaceVariation } from '../../../src/core/world/surface';
import { pathAt } from '../../../src/core/world/paths';
import { forestFactorAt, resourcesInChunk } from '../../../src/core/world/placement';
import { generateChunk } from '../../../src/core/world/chunk';
import { groundCoverInChunk } from '../../../src/core/world/ground-cover';
import { modelKeyFor } from '../../../src/core/world/resource-models';
import { weatherAt, weatherKindAt } from '../../../src/core/world/weather';
import { findSummit } from '../../../src/core/world/summit';
import { timeOfDay } from '../../../src/core/survival/time-of-day';
import { colliderOf } from '../../../src/core/physics/colliders';
import { groundHeightIn } from '../../../src/core/physics/ground';
import { GameSession } from '../../../src/app/loop/game-session';
import { cameraPose, applyLook, applyZoom } from '../../../src/app/camera/camera-rig';
import { wishDirection } from '../../../src/app/input/intent';
import { planStreaming } from '../../../src/app/chunks/streamer';
import { ObstacleIndex } from '../../../src/app/world/obstacle-index';
import { buildChunkMesh, worldSamplers } from '../../../src/adapters/render-data/mesh-data';
import { vegetationInstances } from '../../../src/adapters/render-data/vegetation-instances';
import { groundCoverInstances, coverKept, shrinkInstances } from '../../../src/adapters/render-data/ground-cover-instances';
import { buildFarTerrain } from '../../../src/adapters/render-data/far-terrain';
import { lightingFor, shadowStrength } from '../../../src/adapters/render-data/lighting';
import { atmosphereFor, lightningFlash, sceneBrightness, weatherGrade, distanceFogDensity } from '../../../src/adapters/render-data/atmosphere';
import { gradeFor } from '../../../src/adapters/render-data/grade';
import { hazeColor, heightFogFor, distanceFogVisibilityFor, fogDensityFor } from '../../../src/adapters/render-data/fog';
import { iblIntensityFor } from '../../../src/adapters/render-data/environment-light';
import { cosmosFor } from '../../../src/adapters/render-data/cosmos';
import { fireflyCount, mushroomGlow } from '../../../src/adapters/render-data/night-magic';
import { lensRainTarget, stepLensWetness } from '../../../src/adapters/render-data/lens-drops';
import { tuftTint, treeTint, windOffset, valueNoise, hash01 } from '../../../src/adapters/render-data/foliage';
import { viewSectorFor, inSector } from '../../../src/adapters/render-data/view-sector';
import { describeQuality, resolveQuality } from '../../../src/adapters/render-data/quality';
import { parseGraphicsPreferences, serializeGraphicsPreferences } from '../../../src/adapters/storage/graphics-preferences';
import { WEATHER_PRESETS } from '../../../src/core/world/weather';

const SEEDS = [0, 1, 12345, 3735928559];
const POINTS: [number, number][] = [[0, 0], [10, 20], [-1234.5, 777.25], [5000, -6000], [-7999.75, 3.125], [3961, 2711], [500, -300], [-2500, 4100], [6000, 1200], [123.456, -789.012], [64, 64], [-64.5, 31.75]];

/** Order-sensitive checksum of a float sequence (same arithmetic in C#). */
function digest(values: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < values.length; i++) s = s * 1.000001 + values[i]! * ((i % 7) + 1);
  return s;
}

it('generates parity fixtures', () => {
  const out: Record<string, unknown> = {};
  out.hash = [] as number[][];
  for (const seed of SEEDS) for (const [x, z, s] of [[0, 0, 0], [1, -1, 5], [-77, 123456, 0x77e4], [2147483647, -2147483648, 99]]) (out.hash as number[][]).push([seed, x!, z!, s!, hash2(seed, x!, z!, s!)]);
  const fbmP = { octaves: 5, lacunarity: 2, gain: 0.5 };
  out.noise = SEEDS.flatMap((seed) => POINTS.map(([x, z]) => {
    const u = x / 97.3, v = z / 97.3;
    return [seed, u, v, gradientNoise2(seed, u, v, 3), fbm2(seed, u, v, fbmP, 7), ridgedFbm2(seed, u, v, fbmP, 8), ridgedMultifractal2(seed, u, v, fbmP, 9), erodedFbm2(seed, u, v, fbmP, 10)];
  }));
  out.world = SEEDS.flatMap((seed) => POINTS.map(([x, z]) => {
    const r = terrainRegionsAt(seed, x, z), b = biomeAt(seed, x, z), s = surfaceVariation(seed, x, z);
    return [seed, x, z, heightAt(seed, x, z), r.hills, r.mountains, b.cold, b.humidity, s.patch, s.snowJitter, pathAt(seed, x, z), forestFactorAt(seed, x, z)];
  }));
  // Dense path sampling (paths are thin: random points rarely hit one).
  out.paths = [] as number[][];
  for (let i = 0; i < 400; i++) { const x = -100 + i * 0.73, z = 40 + i * 0.31; (out.paths as number[][]).push([x, z, pathAt(12345, x, z)]); }
  const CHUNKS: [number, number, number][] = [[12345, 0, 0], [12345, 3, -2], [0, -5, 7], [3735928559, 1, 1], [1, 61, 42]];
  out.chunks = CHUNKS.map(([seed, cx, cz]) => {
    const chunk = generateChunk(seed, cx, cz);
    const resources = resourcesInChunk(seed, cx, cz);
    const cover = groundCoverInChunk(seed, chunk);
    const mesh = buildChunkMesh(chunk, worldSamplers(seed, cx, cz));
    const veg = vegetationInstances(resources, chunk);
    const coverInst = groundCoverInstances(cover, chunk);
    return {
      seed, cx, cz,
      heights: Array.from(chunk.heights),
      resources: resources.map((r) => [r.id, r.kind, r.variant, r.x, r.z, r.rotation, r.scale, modelKeyFor(r)]),
      colliders: resources.map((r) => { const c = colliderOf(r); return c ? [c.x, c.z, c.r, c.height!] : null; }),
      cover: { count: cover.length, models: digest(cover.map((c) => c.model.length + c.model.charCodeAt(c.model.length - 1))), x: digest(cover.map((c) => c.x)), z: digest(cover.map((c) => c.z)), rotation: digest(cover.map((c) => c.rotation)), scale: digest(cover.map((c) => c.scale)), first: cover.slice(0, 40).map((c) => [c.kind, c.model, c.x, c.z, c.rotation, c.scale]), last: cover.slice(-20).map((c) => [c.kind, c.model, c.x, c.z, c.rotation, c.scale]) },
      mesh: { positions: digest(mesh.positions), normals: digest(mesh.normals), colors: digest(mesh.colors), layers: digest(mesh.layers), indices: digest(mesh.indices), sample: [0, 100, 544, 1000, 1088].map((i) => [mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.colors[i * 4], mesh.colors[i * 4 + 1], mesh.colors[i * 4 + 2], mesh.layers[i * 3], mesh.layers[i * 3 + 1], mesh.layers[i * 3 + 2]]) },
      vegetation: Object.entries(veg).map(([k, m]) => [k, m.length, digest(m)]),
      coverInstances: Object.entries(coverInst).map(([k, m]) => [k, m.length, digest(m)]),
    };
  });
  out.weather = [12345, 7].flatMap((seed) => [0, 1, 150, 299, 300, 330, 599, 1234.5, 5000, 20000, 77777].map((t) => {
    const w = weatherAt(seed, t);
    return [seed, t, weatherKindAt(seed, t), w.cloudCover, w.rain, w.storm, w.fog, w.wind, w.wetness];
  }));
  out.summit = (() => { const s = findSummit(12345, { radiusM: 1500, gridStepM: 250 }); return [s.x, s.z, s.height]; })();
  const FRACTIONS = [0, 0.04, 0.06, 0.1, 0.3, 0.5, 0.58, 0.64, 0.69, 0.7, 0.75, 0.85, 0.95, 0.99];
  out.lighting = FRACTIONS.map((f) => {
    const t = timeOfDay(f * 1200 + 1200 * 3);
    const l = lightingFor(t);
    return { f, day: t.day, phase: t.phase, dayFraction: t.dayFraction, l, shadow: shadowStrength(l), haze: hazeColor(l), heightFog: heightFogFor(t), vis: distanceFogVisibilityFor(t), ibl: iblIntensityFor(l), grade: gradeFor(l), cosmos: cosmosFor(t), fireflies: fireflyCount(l), glow: mushroomGlow(l) };
  });
  out.atmosphere = [] as unknown[];
  for (const f of [0.1, 0.3, 0.64, 0.85]) {
    const l = lightingFor(timeOfDay(f * 1200));
    for (const kind of Object.keys(WEATHER_PRESETS) as (keyof typeof WEATHER_PRESETS)[]) {
      const p = WEATHER_PRESETS[kind];
      for (const flash of [0, 0.7]) {
        const a = atmosphereFor(l, { ...p, wetness: p.rain }, flash);
        (out.atmosphere as unknown[]).push({ f, kind, flash, a, brightness: sceneBrightness(a.light), grade: weatherGrade(gradeFor(a.light), a), density: distanceFogDensity(a, fogDensityFor(512, 0.3)), ibl: iblIntensityFor(a.light) });
      }
    }
  }
  out.lightning = [0, 0.5, 1, 2.2, 3.1, 4.4, 10.05, 31.6, 100.2, 777.7].flatMap((t) => [[t, 1, lightningFlash(12345, t, 1)], [t, 0.5, lightningFlash(99, t, 0.5)]]);
  out.lens = [[0, 0.3], [0.5, -0.35], [1, 0.7], [0.75, 0.2]].map(([r, p]) => [r, p, lensRainTarget(r!, p!), stepLensWetness(0.2, lensRainTarget(r!, p!), 0.016)]);
  out.foliage = POINTS.map(([x, z]) => { const a = tuftTint(x, z), b = treeTint(x, z), w = windOffset(x, z, 0.7, 12.5, 0.28, 1.3); return [x, z, hash01(x, z), valueNoise(x / 9, z / 9), a.target, a.amount, a.brightness, b.target, b.amount, b.brightness, w.dx, w.dz]; });
  const sector = viewSectorFor(0.6, 1.0, 16 / 9);
  out.sector = { s: sector, tests: POINTS.map(([x, z]) => [x / 10, z / 10, inSector(sector, 1, 2, x / 10, z / 10, 0), inSector(sector, 1, 2, x / 10, z / 10, 3)]) };
  out.coverKept = POINTS.map(([x, z]) => [x, z, coverKept(x, z, 0.5), coverKept(x + 0.3, z - 0.7, 0.75)]);
  out.quality = (['low', 'medium', 'high', 'ultra'] as const).map((l) => [l, describeQuality(resolveQuality(l)), describeQuality(resolveQuality(l, { shadows: false, ao: false, msaa: false }))]);
  out.prefs = ['{"level":"ultra","overrides":{"ao":false,"rain":true}}', 'nope', '{"level":"basse"}', '[1]', null, '{"level":"low","overrides":{"motionBlur":false,"dof":false}}'].map((t) => {
    const p = parseGraphicsPreferences(t);
    return [t, serializeGraphicsPreferences(p)];
  });

  // Integration: a real session on real chunks with real obstacles, walking for 20 s through a forest.
  const seed = 12345;
  const chunks = new Map<string, ReturnType<typeof generateChunk>>();
  for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) chunks.set(`${cx},${cz}`, generateChunk(seed, cx, cz));
  const obstacles = new ObstacleIndex(seed);
  const ground = (x: number, z: number) => groundHeightIn(chunks, x, z);
  const session = new GameSession({ spawn: { x: 0, z: 0 }, ground, obstacles: (x, z) => obstacles.near(x, z) });
  session.setTimeOfDay(0.06);
  let rig = { yaw: 0.6, pitch: 0.35, distance: 7 };
  const trace: number[][] = [];
  for (let frame = 0; frame < 1200; frame++) {
    rig = applyZoom(applyLook(rig, frame % 50 === 0 ? 37 : 0, frame % 90 === 0 ? -11 : 0, 0.0025), frame % 200 === 0 ? 120 : 0);
    const keys = { forward: frame % 400 < 300, back: false, left: frame % 300 > 250, right: frame % 500 > 450 };
    const dir = wishDirection(keys, rig.yaw);
    const alpha = session.frame(16.6667, true, dir);
    if (frame % 60 === 0) {
      const shown = session.interpolated(alpha);
      const pose = cameraPose(rig, { x: shown.x, y: shown.y + 1.5, z: shown.z }, ground, (ax, az, bx, bz) => obstacles.along(ax, az, bx, bz));
      trace.push([frame, session.current.x, session.current.y, session.current.z, session.worldTicks, pose.position.x, pose.position.y, pose.position.z]);
    }
  }
  out.session = trace;
  out.streaming = planStreaming(100, -50, new Map(), { viewRadiusM: 512, unloadMarginM: 64, maxChunks: 520 }).wanted.slice(0, 60).map((c) => [c.cx, c.cz]);
  const far = buildFarTerrain(12345, 500, -500, { halfSizeM: 400, stepM: 40 });
  out.far = [digest(far.positions), digest(far.normals), digest(far.colors), digest(far.indices)];
  const src = vegetationInstances(resourcesInChunk(12345, 0, 0), generateChunk(12345, 0, 0));
  const flat = Object.values(src)[0]!;
  const dst = new Float32Array(flat.length);
  out.shrink = [shrinkInstances(flat, 20, 20, 0, 40, 25, dst, 0.7, { sector, x: 15, z: 10 }), digest(dst)];
  writeFileSync(new URL('../../Assets/JeuSurvie/Tests/EditMode/Fixtures/parity.json', import.meta.url), JSON.stringify(out));
}, 120000);
