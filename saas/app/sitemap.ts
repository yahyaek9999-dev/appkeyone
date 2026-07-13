import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://w.keyone1.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${BASE}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/pricing`, lastModified, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/projects`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/login`, lastModified, changeFrequency: "yearly", priority: 0.4 },
    { url: `${BASE}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
