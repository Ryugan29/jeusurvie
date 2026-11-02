// The elf's leaf outfit moved by Unity Cloth (decision-2026-11-02-tenue-souple-et-lianes): each leaf piece (LeafCloth.Pieces)
// gets a Cloth held where the leaves are tied and free towards their tips (the leaves' UV v), spheres fitted on her skin
// around her limbs that the leaves slide on, and, every frame, the game's wind, gusts and rain turned into cloth settings by
// LeafCloth.For. A piece that cannot be set up stays simply skinned, as before, and the reason is kept in Problems.
using System.Collections.Generic;
using JeuSurvie.Core.RenderData;
using JeuSurvie.Core.Shared;
using UnityEngine;

namespace JeuSurvie.Characters
{
    public sealed class LeafOutfit
    {
        private const float StretchingStiffness = 1f; // a leaf bends but does not stretch

        private readonly LeafClothTuning tuning;
        private readonly Transform pivot;
        private Vector3 lastPivot;
        private readonly List<Cloth> cloths = new List<Cloth>();
        private readonly Dictionary<(string, string, double), SphereCollider> spheres = new Dictionary<(string, string, double), SphereCollider>();
        private Body body;

        public IReadOnlyList<Cloth> Cloths => cloths;
        public readonly List<string> Problems = new List<string>();

        private LeafOutfit(LeafClothTuning tuning, Transform pivot)
        {
            this.tuning = tuning;
            this.pivot = pivot;
            lastPivot = pivot.position;
        }

        /// <summary>Puts the cloth on the model's leaf pieces (none on a model without them), at rest: calm and dry.</summary>
        public static LeafOutfit Attach(AnimatedModel model, LeafClothTuning tuning)
        {
            var outfit = new LeafOutfit(tuning, model.Pivot);
            var found = new List<(LeafPiece piece, SkinnedMeshRenderer leaves)>();
            foreach (LeafPiece piece in LeafCloth.Pieces(tuning))
            {
                SkinnedMeshRenderer leaves = Find(model, piece.Mesh);
                if (leaves != null) found.Add((piece, leaves));
            }
            if (found.Count > 0) outfit.body = Body.Of(model, outfit.Problems);
            foreach (var (piece, leaves) in found) outfit.AttachPiece(model, leaves, piece);
            outfit.body = null; // its copy of her skin is only needed to fit the spheres
            outfit.Update(0, 0, 0);
            return outfit;
        }

        /// <summary>Every frame, once she is placed: the game's wind strength, the gust where she stands (Foliage.WindGust) and
        /// her wetness. A jump of the whole character since the last frame carries the leaves along.</summary>
        public void Update(double windStrength, double gust, double wetness)
        {
            LeafClothState s = LeafCloth.For(tuning, windStrength, gust, wetness);
            bool jumped = (pivot.position - lastPivot).magnitude > tuning.JumpM;
            lastPivot = pivot.position;
            foreach (Cloth cloth in cloths)
            {
                if (jumped) cloth.ClearTransformMotion();
                cloth.externalAcceleration = ToVector(s.Push);
                cloth.randomAcceleration = ToVector(s.Flutter);
                cloth.damping = (float)s.Damping;
                cloth.bendingStiffness = (float)s.BendingStiffness;
                cloth.worldVelocityScale = cloth.worldAccelerationScale = (float)s.MovementShare;
            }
        }

        private void AttachPiece(AnimatedModel model, SkinnedMeshRenderer leaves, LeafPiece piece)
        {
            Mesh mesh = leaves.sharedMesh;
            if (mesh == null || !mesh.isReadable) { Problems.Add($"{piece.Mesh} : maillage illisible, tenue figée"); return; }
            Vector3[] vertices = mesh.vertices;
            Vector2[] uv = mesh.uv;
            if (uv.Length != vertices.Length) { Problems.Add($"{piece.Mesh} : pas d'UV pour savoir où les feuilles sont attachées"); return; }

            var pairs = new List<ClothSphereColliderPair>();
            foreach (BoneCapsule c in piece.Capsules)
            {
                SphereCollider a = Sphere(c.A), b = Sphere(c.B);
                if (a != null && b != null) pairs.Add(new ClothSphereColliderPair(a, b));
            }

            var freedom = new double[uv.Length];
            for (int i = 0; i < uv.Length; i++) freedom[i] = uv[i].y; // 0 at the top of the leaf, 1 at its tip (tenue.py)
            Cloth cloth = leaves.gameObject.AddComponent<Cloth>();
            ClothSkinningCoefficient[] coefficients = cloth.coefficients;
            double[] particles = LeafCloth.ParticleFreedoms(freedom, coefficients.Length);
            if (particles == null)
            {
                Object.Destroy(cloth);
                Problems.Add($"{piece.Mesh} : {coefficients.Length} particules de tissu pour {vertices.Length} points, tenue figée");
                return;
            }
            float modelToWorld = model.Pivot.lossyScale.x; // the cloth works in world metres (its root bone's frame, unscaled)
            for (int i = 0; i < coefficients.Length; i++)
            {
                coefficients[i].maxDistance = (float)(LeafCloth.MaxDistance(piece.TipFreedomM, particles[i]) * modelToWorld);
                coefficients[i].collisionSphereDistance = (float)(tuning.SinkM * modelToWorld); // Unity's « surface penetration »
            }
            cloth.coefficients = coefficients;
            cloth.sphereColliders = pairs.ToArray();
            cloth.stretchingStiffness = StretchingStiffness;
            cloth.clothSolverFrequency = (float)tuning.SolverStepsPerSecond;
            cloth.useGravity = true;
            cloths.Add(cloth);
        }

        /// <summary>The collider of a sphere on her limb, shared by every capsule and piece that uses it.</summary>
        private SphereCollider Sphere(BoneSphere s)
        {
            var key = (s.Bone, s.Toward, s.T);
            if (!spheres.TryGetValue(key, out SphereCollider sphere)) spheres[key] = sphere = body?.Fit(s, Problems);
            return sphere;
        }

        private static SkinnedMeshRenderer Find(AnimatedModel model, string name)
        {
            foreach (Renderer r in model.Renderers)
                if (r is SkinnedMeshRenderer skinned && r.name == name) return skinned;
            return null;
        }

        private static Vector3 ToVector(Vec3 v) => new Vector3((float)v.X, (float)v.Y, (float)v.Z);

        private static Vec3 ToVec3(Vector3 v) => new Vec3(v.x, v.y, v.z);

        /// <summary>Her skin at rest (her largest readable skinned mesh), in its mesh space, to fit the spheres on her limbs.</summary>
        private sealed class Body
        {
            private const float LimbShare = 0.3f; // the skin points that follow a bone at least this much make its limb
            private const int IgnoreRaycastLayer = 2; // Unity's built-in layer

            private readonly Transform[] bones;
            private readonly Vector3[] vertices;
            private readonly BoneWeight[] weights;
            private readonly Matrix4x4[] bindposes;

            private Body(SkinnedMeshRenderer skin)
            {
                bones = skin.bones;
                vertices = skin.sharedMesh.vertices;
                weights = skin.sharedMesh.boneWeights;
                bindposes = skin.sharedMesh.bindposes;
            }

            public static Body Of(AnimatedModel model, List<string> problems)
            {
                SkinnedMeshRenderer best = null;
                foreach (Renderer r in model.Renderers)
                    if (r is SkinnedMeshRenderer s && s.sharedMesh != null && s.sharedMesh.isReadable && s.sharedMesh.boneWeights.Length == s.sharedMesh.vertexCount
                        && (best == null || s.sharedMesh.vertexCount > best.sharedMesh.vertexCount)) best = s;
                if (best != null) return new Body(best);
                problems.Add("pas de peau lisible pour y caler les obstacles des feuilles");
                return null;
            }

            /// <summary>A sphere around T of the way from the bone to its child, fitted on the skin points that follow the
            /// bone, carried by it. Null, and why, when the bones or the skin are missing.</summary>
            public SphereCollider Fit(BoneSphere s, List<string> problems)
            {
                int bone = IndexOf(s.Bone), toward = IndexOf(s.Toward);
                if (bone < 0 || toward < 0) { problems.Add($"os absent pour la tenue : {s.Bone} ou {s.Toward}"); return null; }
                var limb = new List<Vec3>();
                for (int i = 0; i < vertices.Length; i++)
                    if (Share(weights[i], bone) >= LimbShare) limb.Add(ToVec3(vertices[i]));
                Vector3 from = bindposes[bone].inverse.MultiplyPoint3x4(Vector3.zero), to = bindposes[toward].inverse.MultiplyPoint3x4(Vector3.zero);
                if (!LeafCloth.FitSphere(limb, ToVec3(from), ToVec3(to), s.T, out Vec3 centre, out double radius))
                {
                    problems.Add($"pas de peau autour de {s.Bone} pour y caler la tenue");
                    return null;
                }
                var holder = new GameObject($"tenue {s.Bone} {s.T:0.##}") { layer = IgnoreRaycastLayer }.transform; // for the cloth only
                holder.SetParent(bones[bone], false);
                holder.localPosition = bindposes[bone].MultiplyPoint3x4(ToVector(centre));
                var sphere = holder.gameObject.AddComponent<SphereCollider>();
                sphere.radius = bindposes[bone].MultiplyVector(new Vector3((float)radius, 0, 0)).magnitude;
                return sphere;
            }

            private int IndexOf(string name)
            {
                for (int i = 0; i < bones.Length; i++)
                    if (bones[i] != null && bones[i].name == name) return i;
                return -1;
            }

            private static float Share(BoneWeight w, int bone) =>
                (w.boneIndex0 == bone ? w.weight0 : 0) + (w.boneIndex1 == bone ? w.weight1 : 0) +
                (w.boneIndex2 == bone ? w.weight2 : 0) + (w.boneIndex3 == bone ? w.weight3 : 0);
        }
    }
}
