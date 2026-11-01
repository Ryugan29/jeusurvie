// Port of adapters/worker (chunk.worker + worker-chunk-source + chunk-protocol): chunks are generated on background THREADS
// (the Web Workers of the original) — heights, render mesh buffers, vegetation and ground-cover instance matrices — and handed
// to the main thread by priority. Everything generated is pure Core code (thread-safe: no shared mutable state).
using System;
using System.Collections.Generic;
using System.Threading;
using JeuSurvie.Core.App;
using JeuSurvie.Core.RenderData;
using JeuSurvie.Core.World;
using UnityEngine;

namespace JeuSurvie.World
{
    /// <summary>What the renderer receives for a ready chunk (ChunkRenderData).</summary>
    public sealed class ChunkPayload
    {
        public ChunkMeshData Mesh;
        public Dictionary<string, float[]> Vegetation;
        public Dictionary<string, float[]> GroundCover;
    }

    public sealed class ChunkWorkerSource : IChunkSource<ChunkPayload>, IDisposable
    {
        private const int MaxAttempts = 3;
        private readonly uint seed;
        private readonly bool groundCover;
        private readonly object gate = new object();
        private readonly Dictionary<long, double> pending = new Dictionary<long, double>();
        private readonly HashSet<long> running = new HashSet<long>();
        private readonly HashSet<long> cancelled = new HashSet<long>();
        private readonly List<(double priority, ReadyChunk<ChunkPayload> chunk)> ready = new List<(double, ReadyChunk<ChunkPayload>)>();
        private readonly Dictionary<long, int> failures = new Dictionary<long, int>();
        private readonly Thread[] threads;
        private volatile bool disposed;

        public ChunkWorkerSource(uint seed, int workerCount, bool groundCover)
        {
            this.seed = seed;
            this.groundCover = groundCover;
            threads = new Thread[Math.Max(1, workerCount)];
            for (int i = 0; i < threads.Length; i++)
            {
                threads[i] = new Thread(Work) { IsBackground = true, Name = "Génération des chunks " + (i + 1), Priority = System.Threading.ThreadPriority.BelowNormal };
                threads[i].Start();
            }
        }

        private static long KeyOf(int cx, int cz) => ((long)cx << 32) ^ (uint)cz;
        private static int Cx(long key) => (int)(key >> 32);
        private static int Cz(long key) => (int)(uint)key;

        public void Request(int cx, int cz, double priority)
        {
            long key = KeyOf(cx, cz);
            lock (gate)
            {
                cancelled.Remove(key);
                if (running.Contains(key)) return;
                pending[key] = priority;
                Monitor.Pulse(gate);
            }
        }

        public void Cancel(int cx, int cz)
        {
            long key = KeyOf(cx, cz);
            lock (gate)
            {
                pending.Remove(key);
                if (running.Contains(key)) cancelled.Add(key);
                ready.RemoveAll(r => r.chunk.Data.Cx == cx && r.chunk.Data.Cz == cz);
            }
        }

        public IReadOnlyList<ReadyChunk<ChunkPayload>> DrainReady(int max)
        {
            lock (gate)
            {
                if (ready.Count == 0) return Array.Empty<ReadyChunk<ChunkPayload>>();
                ready.Sort((a, b) =>
                {
                    int p = a.priority.CompareTo(b.priority);
                    if (p != 0) return p;
                    int z = a.chunk.Data.Cz.CompareTo(b.chunk.Data.Cz);
                    return z != 0 ? z : a.chunk.Data.Cx.CompareTo(b.chunk.Data.Cx);
                });
                int n = Math.Min(max, ready.Count);
                var output = new ReadyChunk<ChunkPayload>[n];
                for (int i = 0; i < n; i++) output[i] = ready[i].chunk;
                ready.RemoveRange(0, n);
                return output;
            }
        }

        private void Work()
        {
            while (!disposed)
            {
                long key;
                double priority;
                lock (gate)
                {
                    while (!disposed && pending.Count == 0) Monitor.Wait(gate);
                    if (disposed) return;
                    key = 0;
                    priority = double.MaxValue;
                    foreach (var kv in pending)
                        if (kv.Value < priority) { priority = kv.Value; key = kv.Key; }
                    pending.Remove(key);
                    running.Add(key);
                }
                ReadyChunk<ChunkPayload>? result = null;
                try
                {
                    result = Generate(Cx(key), Cz(key));
                }
                catch (Exception e)
                {
                    lock (gate)
                    {
                        failures.TryGetValue(key, out int count);
                        failures[key] = ++count;
                        if (count < MaxAttempts && !cancelled.Contains(key)) pending[key] = priority;
                        else Debug.LogError($"Chunk {Cx(key)},{Cz(key)} abandonné après plusieurs échecs : {e}");
                    }
                }
                lock (gate)
                {
                    running.Remove(key);
                    bool wasCancelled = cancelled.Remove(key);
                    if (result != null && !wasCancelled) ready.Add((priority, result.Value));
                }
            }
        }

        /// <summary>runChunkJob: chunk + mesh + vegetation (+ ground cover) instance matrices.</summary>
        private ReadyChunk<ChunkPayload> Generate(int cx, int cz)
        {
            ChunkData chunk = Chunk.Generate(seed, cx, cz);
            var payload = new ChunkPayload
            {
                Mesh = MeshData.Build(chunk, new WorldSamplers(seed, cx, cz)),
                Vegetation = VegetationInstances.Build(Placement.InChunk(seed, cx, cz), chunk),
                GroundCover = groundCover ? GroundCoverInstances.Build(GroundCover.InChunk(seed, chunk), chunk) : new Dictionary<string, float[]>(),
            };
            return new ReadyChunk<ChunkPayload>(chunk, payload);
        }

        public void Dispose()
        {
            disposed = true;
            lock (gate) Monitor.PulseAll(gate);
        }
    }
}
