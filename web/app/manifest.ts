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
    icons: [],
  };
}
