import path from "path";
import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

const csp = [
  "default-src 'self'",
  // unsafe-inline required: Next.js embeds hydration scripts inline
  "script-src 'self' 'unsafe-inline'",
  // unsafe-inline required: CSS Modules inject <style> tags in dev; extracted in prod but Next.js adds inline critical CSS
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // 'self' covers the gRPC-Web proxy rewrite at /ameliso.v1.AmelisoService/*
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // frame-ancestors supersedes X-Frame-Options in CSP-aware browsers
  "frame-ancestors 'none'",
]
  .join("; ")
  .trim();

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // X-Frame-Options kept for legacy browsers that don't parse CSP frame-ancestors
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Cross-origin isolation: Embedder + Opener policies together enable crossOriginIsolated
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  typedRoutes: true,
  output: "standalone",
  // Trace deps from monorepo root so standalone captures shared packages
  outputFileTracingRoot: path.resolve(__dirname, ".."),
  // Emit source maps in production so error reports include real file+line
  productionBrowserSourceMaps: true,
  experimental: {
    // Tree-shake barrel-exporting packages to reduce client bundle size
    optimizePackageImports: [
      "@bufbuild/protobuf",
      "@connectrpc/connect",
      "@connectrpc/connect-web",
    ],
  },
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      {
        source: "/ameliso.v1.AmelisoService/:path*",
        destination: `${process.env.API_URL ?? "http://localhost:50052"}/ameliso.v1.AmelisoService/:path*`,
      },
    ];
  },
} satisfies NextConfig;

export default withBundleAnalyzer(nextConfig);
