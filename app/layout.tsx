import type { Metadata, Viewport } from "next";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://anygivenpick.app"),
  title: {
    default: "Any Given Pick",
    template: "%s | Any Given Pick",
  },
  description:
    "Make every call in a free-entry weekly professional-football pick'em experience built for eligible Indiana adults.",
  applicationName: "Any Given Pick",
  alternates: { canonical: "/" },
  category: "sports",
  icons: {
    icon: [{ url: "/pwa-icon-192", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/pwa-icon-192", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Any Given Pick",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Any Given Pick",
    title: "Any Given Pick",
    description: "One sheet. Every call. Make your weekly football picks.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Any Given Pick",
    description: "One sheet. Every call. Make your weekly football picks.",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#123f31",
};

const designContract = `<!--
THESIS: Any Given Pick makes weekly picks feel like calling a game plan, refusing both fantasy-dashboard clutter and the sportsbook bet slip.
OWN-WORLD: Deep field green, warm play-sheet ivory, maize selection tabs, clay deadline markers, yard-scale measurement, and restrained route diagrams.
STORY: Verify access, finish every matchup, set the Monday total, review one complete entry, then receive a clear prototype receipt.
FIRST VIEWPORT: A decisive picks headline and deadline lead into the progress rail and open matchup sheet; the review action stays thumb-reachable.
FORM: Coach's Call Sheet, selected from the approved mobile concepts; seed a6de992d.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body data-design-seed="a6de992d">
        <template dangerouslySetInnerHTML={{ __html: designContract }} />
        {children}
      </body>
    </html>
  );
}
