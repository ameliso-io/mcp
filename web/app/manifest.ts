import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Ameliso",
    short_name: "Ameliso",
    description: "Test coverage and quality management",
    lang: "en",
    scope: "/",
    start_url: "/overview",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui", "browser"],
    orientation: "any",
    background_color: "#f5f5f5",
    theme_color: "#1e293b",
    categories: ["productivity", "developer-tools"],
    icons: [
      { src: "/icon/32", sizes: "32x32", type: "image/png" },
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
