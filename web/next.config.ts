import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  async rewrites() {
    return [
      {
        source: "/ameliso.v1.AmelisoService/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:50052"}/ameliso.v1.AmelisoService/:path*`,
      },
    ];
  },
};

export default nextConfig;
