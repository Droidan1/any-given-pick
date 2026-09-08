import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-08-11T00:00:00.000Z");
  return [
    { url: "https://anygivenpick.app", lastModified, changeFrequency: "weekly", priority: 1 },
    { url: "https://anygivenpick.app/rules", lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: "https://anygivenpick.app/privacy", lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: "https://anygivenpick.app/support", lastModified, changeFrequency: "monthly", priority: 0.7 },
  ];
}
