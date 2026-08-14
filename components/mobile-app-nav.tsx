"use client";

import Link from "next/link";
import { Icon, type IconName } from "./icons";

export type MobileAppDestination =
  | "home"
  | "picks"
  | "standings"
  | "activity"
  | "profile"
  | "admin";

type LocalDestination = "home" | "picks" | "standings";

const playerDestinations: Array<{
  destination: Exclude<MobileAppDestination, "admin">;
  label: string;
  icon: IconName;
  href: string;
  localView?: LocalDestination;
}> = [
  { destination: "home", label: "Home", icon: "home", href: "/?view=home", localView: "home" },
  { destination: "picks", label: "Picks", icon: "picks", href: "/?view=picks", localView: "picks" },
  { destination: "standings", label: "Standings", icon: "standings", href: "/?view=standings", localView: "standings" },
  { destination: "activity", label: "Activity", icon: "activity", href: "/activity" },
  { destination: "profile", label: "Profile", icon: "profile", href: "/profile" },
];

export function MobileAppNav({
  active,
  isAdmin = false,
  onSelectView,
}: {
  active: MobileAppDestination;
  isAdmin?: boolean;
  onSelectView?: (view: LocalDestination) => void;
}) {
  return (
    <nav className={`bottom-nav${isAdmin ? " bottom-nav--admin" : ""}`} aria-label="Primary navigation">
      {playerDestinations.map((item) => {
        const className = `bottom-nav__item${active === item.destination ? " bottom-nav__item--active" : ""}`;
        const content = <><Icon name={item.icon} /><span>{item.label}</span></>;
        const localView = item.localView;
        if (onSelectView && localView) {
          return (
            <button
              className={className}
              key={item.destination}
              type="button"
              onClick={() => onSelectView(localView)}
              aria-current={active === item.destination ? "page" : undefined}
            >
              {content}
            </button>
          );
        }
        return (
          <Link
            className={`${className} bottom-nav__item--link`}
            href={item.href}
            key={item.destination}
            aria-current={active === item.destination ? "page" : undefined}
          >
            {content}
          </Link>
        );
      })}
      {isAdmin ? (
        <Link
          className={`bottom-nav__item bottom-nav__item--link${active === "admin" ? " bottom-nav__item--active" : ""}`}
          href="/admin"
          aria-current={active === "admin" ? "page" : undefined}
        >
          <Icon name="settings" /><span>Admin</span>
        </Link>
      ) : null}
    </nav>
  );
}
