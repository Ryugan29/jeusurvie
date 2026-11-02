// The Core meshes are ported from Babylon, where these triangles face up; Unity draws the other side of each triangle. A Core
// index list becomes a Unity one by swapping the last two corners of every triangle (the Core list itself is shared with the
// physics ground and stays untouched).
namespace JeuSurvie.World
{
    public static class UnityWinding
    {
        public static int[] FromCore(int[] indices)
        {
            var unity = new int[indices.Length];
            for (int t = 0; t + 2 < indices.Length; t += 3)
            {
                unity[t] = indices[t];
                unity[t + 1] = indices[t + 2];
                unity[t + 2] = indices[t + 1];
            }
            return unity;
        }
    }
}
