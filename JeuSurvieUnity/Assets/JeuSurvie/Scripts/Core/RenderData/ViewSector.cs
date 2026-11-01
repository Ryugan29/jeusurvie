// Port of src/adapters/render-data/view-sector.ts — horizontal view-sector culling of vegetation and ground cover.
using System;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.RenderData
{
    public readonly struct ViewSector
    {
        public readonly double DirX, DirZ, CosHalf, NearM;
        public ViewSector(double dirX, double dirZ, double cosHalf, double nearM) { DirX = dirX; DirZ = dirZ; CosHalf = cosHalf; NearM = nearM; }
    }

    /// <summary>What the camera sees: its horizontal sector and its position (apex of the sector).</summary>
    public readonly struct ViewCull
    {
        public readonly ViewSector Sector;
        public readonly double X, Z;
        public ViewCull(ViewSector sector, double x, double z) { Sector = sector; X = x; Z = z; }
    }

    public static class ViewSectors
    {
        public const double StepRad = Math.PI / 12;
        public const double MarginRad = StepRad + Math.PI / 18;
        public const double NearM = 14;

        public static double QuantizedYaw(double yaw) => MathUtil.JsRound(yaw / StepRad) * StepRad;

        public static ViewSector For(double yaw, double fovY, double aspect, double nearM = NearM)
        {
            double q = QuantizedYaw(yaw);
            double halfH = Math.Atan(Math.Tan(fovY / 2) * Math.Max(aspect, 0.1));
            double half = halfH + MarginRad;
            return new ViewSector(Math.Sin(q), Math.Cos(q), half >= Math.PI ? -1 : Math.Cos(Math.Min(Math.PI, half)), nearM);
        }

        public static bool InSector(ViewSector s, double px, double pz, double x, double z, double radiusM = 0)
        {
            double dx = x - px, dz = z - pz;
            double d = MathUtil.Hypot(dx, dz);
            if (d <= s.NearM + radiusM) return true;
            double cos = (dx * s.DirX + dz * s.DirZ) / d;
            if (cos >= s.CosHalf) return true;
            if (radiusM <= 0) return false;
            double widen = Math.Asin(Math.Min(1, radiusM / d));
            double half = Math.Acos(Math.Max(-1, Math.Min(1, s.CosHalf)));
            return cos >= Math.Cos(Math.Min(Math.PI, half + widen));
        }

        public static bool Same(ViewSector? a, ViewSector? b)
        {
            if (a == null || b == null) return a == null && b == null;
            ViewSector x = a.Value, y = b.Value;
            return x.DirX == y.DirX && x.DirZ == y.DirZ && x.CosHalf == y.CosHalf && x.NearM == y.NearM;
        }
    }
}
