import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.SITE_URL ?? "http://localhost:3000";
  return [
    { url: `${base}/overview`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/cases`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/runs`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/suites`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/repositories`, changeFrequency: "monthly", priority: 0.6 },
  ];
}
