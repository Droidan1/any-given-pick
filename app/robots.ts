import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://anygivenpick.app/sitemap.xml",
    host: "https://anygivenpick.app",
  };
}
