// Port of src/app/ports.ts (ChunkSource) and src/app/chunks/chunk-loading.ts — tracks requested / loaded / unloaded chunks.
using System.Collections.Generic;
using JeuSurvie.Core.World;

namespace JeuSurvie.Core.App
{
    public readonly struct ReadyChunk<TRender>
    {
        public readonly ChunkData Data;
        public readonly TRender Render;
        public ReadyChunk(ChunkData data, TRender render) { Data = data; Render = render; }
    }

    /// <summary>Chunk source (e.g. generated on worker threads). Priority: smaller = more urgent.</summary>
    public interface IChunkSource<TRender>
    {
        void Request(int cx, int cz, double priority);
        void Cancel(int cx, int cz);
        /// <summary>At most `max` ready chunks, by priority then (cz, cx), forgotten once returned.</summary>
        IReadOnlyList<ReadyChunk<TRender>> DrainReady(int max);
    }

    public readonly struct LoadedChunk<TRender>
    {
        public readonly string Key;
        public readonly ChunkData Data;
        public readonly TRender Render;
        public LoadedChunk(string key, ChunkData data, TRender render) { Key = key; Data = data; Render = render; }
    }

    public readonly struct UnloadedChunk
    {
        public readonly string Key;
        public readonly int Cx, Cz;
        public UnloadedChunk(string key, int cx, int cz) { Key = key; Cx = cx; Cz = cz; }
    }

    public sealed class ChunkLoading<TRender>
    {
        private readonly IChunkSource<TRender> source;
        private readonly int maxPerFrame;
        private readonly Dictionary<string, ChunkCoord> requested = new Dictionary<string, ChunkCoord>();
        private readonly Dictionary<string, ChunkCoord> loadedCoords = new Dictionary<string, ChunkCoord>();
        private readonly Dictionary<string, ChunkData> chunkData = new Dictionary<string, ChunkData>();

        public ChunkLoading(IChunkSource<TRender> source, int maxPerFrame)
        {
            this.source = source;
            this.maxPerFrame = maxPerFrame;
        }

        public IReadOnlyDictionary<string, ChunkData> Chunks => chunkData;
        public IReadOnlyDictionary<string, ChunkCoord> Loaded => loadedCoords;
        public int PendingCount => requested.Count;

        public List<UnloadedChunk> ApplyPlan(StreamPlan plan, double x, double z)
        {
            var wanted = new HashSet<string>();
            foreach (ChunkCoord c in plan.Wanted) wanted.Add(Chunk.Key(c.Cx, c.Cz));
            var stale = new List<string>();
            foreach (var kv in requested) if (!wanted.Contains(kv.Key)) stale.Add(kv.Key);
            foreach (string key in stale)
            {
                ChunkCoord c = requested[key];
                source.Cancel(c.Cx, c.Cz);
                requested.Remove(key);
            }
            foreach (ChunkCoord c in plan.ToLoad)
            {
                string key = Chunk.Key(c.Cx, c.Cz);
                if (requested.ContainsKey(key) || loadedCoords.ContainsKey(key)) continue;
                double dx = (c.Cx + 0.5) * Chunk.Size - x, dz = (c.Cz + 0.5) * Chunk.Size - z;
                source.Request(c.Cx, c.Cz, dx * dx + dz * dz);
                requested[key] = c;
            }
            var unloaded = new List<UnloadedChunk>();
            foreach (string key in plan.ToUnload)
            {
                if (!loadedCoords.TryGetValue(key, out ChunkCoord c)) continue;
                loadedCoords.Remove(key);
                chunkData.Remove(key);
                unloaded.Add(new UnloadedChunk(key, c.Cx, c.Cz));
            }
            return unloaded;
        }

        public List<LoadedChunk<TRender>> Collect()
        {
            var loaded = new List<LoadedChunk<TRender>>();
            foreach (ReadyChunk<TRender> ready in source.DrainReady(maxPerFrame))
            {
                string key = Chunk.Key(ready.Data.Cx, ready.Data.Cz);
                if (!requested.TryGetValue(key, out ChunkCoord coord)) continue;
                requested.Remove(key);
                loadedCoords[key] = coord;
                chunkData[key] = ready.Data;
                loaded.Add(new LoadedChunk<TRender>(key, ready.Data, ready.Render));
            }
            return loaded;
        }
    }
}
