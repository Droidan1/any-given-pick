import { BrandLockup } from "@/components/brand-lockup";
import { Icon, type IconName } from "@/components/icons";

const loadingDestinations: Array<{ label: string; icon: IconName }> = [
  { label: "Home", icon: "home" },
  { label: "Picks", icon: "picks" },
  { label: "Results", icon: "results" },
  { label: "Profile", icon: "profile" },
];

export default function Loading() {
  return (
    <main className="route-loading-shell" aria-busy="true" aria-live="polite">
      <div className="route-loading__progress" aria-hidden="true" />
      <section className="route-loading__sheet">
        <BrandLockup />
        <div className="route-loading__copy">
          <p>Drawing up the next play</p>
          <h1>Loading your call sheet…</h1>
          <span>Your current screen will be ready in a moment.</span>
        </div>
        <div className="route-loading__lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
      <nav className="bottom-nav route-loading__nav" aria-label="Navigation is loading">
        {loadingDestinations.map((item) => (
          <span className="bottom-nav__item" key={item.label}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </span>
        ))}
      </nav>
    </main>
  );
}
