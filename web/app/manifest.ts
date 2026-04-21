import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ameliso",
    short_name: "Ameliso",
    description: "Test coverage and quality management",
    start_url: "/overview",
    display: "standalone",
    background_color: "#f5f5f5",
    theme_color: "#1e293b",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/icon?size=192", sizes: "192x192", type: "image/png" },
    ],
  };
}
