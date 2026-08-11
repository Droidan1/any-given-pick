import type { SVGProps } from "react";

export type IconName =
  | "home"
  | "picks"
  | "standings"
  | "profile"
  | "activity"
  | "settings"
  | "clock"
  | "shield"
  | "check"
  | "arrow"
  | "install"
  | "whistle";

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></>,
    picks: <><rect x="5" y="4" width="14" height="17" rx="1.5" /><path d="M9 4V2h6v2M8.5 9h7M8.5 13h3M14 13l1.2 1.2L18 11.5M8.5 17h7" /></>,
    standings: <><path d="M4 20V12h4v8M10 20V5h4v15M16 20v-11h4v11M2 20h20" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
    activity: <><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h5M16 12v4M14 14h4" /></>,
    settings: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></>,
    shield: <><path d="M12 2 20 5v6c0 5-3.4 8.6-8 11-4.6-2.4-8-6-8-11V5l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
    install: <><path d="M12 3v11M8 10l4 4 4-4" /><path d="M5 16v4h14v-4" /></>,
    whistle: <><circle cx="9" cy="13" r="5" /><path d="M13 10h7l-2 5h-5M5 9 3 5h7l2 4" /></>,
  };

  return <svg {...common} {...props}>{paths[name]}</svg>;
}

export function RouteSketch({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <svg className={`route-sketch${mirrored ? " route-sketch--mirrored" : ""}`} viewBox="0 0 120 100" aria-hidden="true">
      <path d="M18 80c9-26 26-44 52-51" />
      <path d="m62 18 10 10-13 6" />
      <circle cx="18" cy="80" r="7" />
      <path d="m82 67 13 13M95 67 82 80M28 27l11 11M39 27 28 38" />
    </svg>
  );
}
