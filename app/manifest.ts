import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Any Given Pick",
    short_name: "AGP",
    description: "One sheet for making free-entry weekly professional-football picks.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#123f31",
    theme_color: "#123f31",
    orientation: "portrait-primary",
    lang: "en-US",
    categories: ["sports", "entertainment"],
    icons: [
      { src: "/pwa-icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/pwa-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
