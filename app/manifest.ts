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
    shortcuts: [
      {
        name: "Make my picks",
        short_name: "Picks",
        description: "Open the current weekly call sheet.",
        url: "/picks",
        icons: [{ src: "/pwa-icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "View standings",
        short_name: "Standings",
        description: "Open the regular-season standings.",
        url: "/standings",
        icons: [{ src: "/pwa-icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
