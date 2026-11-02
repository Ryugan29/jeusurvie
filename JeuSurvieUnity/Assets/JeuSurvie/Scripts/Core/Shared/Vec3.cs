namespace JeuSurvie.Core.Shared
{
    /// <summary>Point or vector in metres, Y up (port of core/shared/vec.ts). Double precision like the TS numbers.</summary>
    public readonly struct Vec3
    {
        public readonly double X, Y, Z;
        public Vec3(double x, double y, double z) { X = x; Y = y; Z = z; }
        public override string ToString() => $"({X}, {Y}, {Z})";
    }

    /// <summary>Horizontal 2D vector (x, z).</summary>
    public readonly struct Vec2XZ
    {
        public readonly double X, Z;
        public Vec2XZ(double x, double z) { X = x; Z = z; }
    }

    /// <summary>Linear RGB triple (render data colours), port of render-data/palette Rgb.</summary>
    public readonly struct Rgb
    {
        public readonly double R, G, B;
        public Rgb(double r, double g, double b) { R = r; G = g; B = b; }
        public double this[int i] => i == 0 ? R : i == 1 ? G : B;
        public static Rgb Mix(Rgb a, Rgb b, double t) => new Rgb(a.R + (b.R - a.R) * t, a.G + (b.G - a.G) * t, a.B + (b.B - a.B) * t);
        public Rgb Scale(double k) => new Rgb(R * k, G * k, B * k);
        public override string ToString() => $"[{R}, {G}, {B}]";
    }
}
