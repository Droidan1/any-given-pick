import type { Metadata } from "next";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { BrandLockup } from "@/components/brand-lockup";
import { Icon } from "@/components/icons";
import { hasAdminRole } from "@/lib/auth/admin";
import { requireAppUser } from "@/lib/auth/app-user";

export const metadata: Metadata = {
  title: "Admin settings",
  description: "Open Any Given Pick commissioner tools and schedule controls.",
};

const adminSettingsDesignContract = `<!--
THESIS: Admin access is one concise coach's booth directory, not a dashboard of decorative metrics.
OWN-WORLD: Field-green framing, warm ruled paper, maize actions, condensed calls, and hard-edged controls from the Coach's Call Sheet system.
STORY: Confirm administrator access, choose a schedule task, and move directly into the operational page.
FIRST VIEWPORT: A compact booth header leads into two full-width ruled action rows; season import is the emphasized shortcut.
FORM: Protected task directory extending the established admin workspace; incumbent seed dbd731b4.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

export default async function AdminSettingsPage() {
  await auth.protect();
  const appUser = await requireAppUser();
  const isAdmin = await hasAdminRole(appUser.id);

  if (!isAdmin) {
    return (
      <main className="admin-access-shell" data-design-seed="dbd731b4">
        <template dangerouslySetInnerHTML={{ __html: adminSettingsDesignContract }} />
        <section className="admin-access-sheet">
          <Link href="/" className="admin-brand" aria-label="Any Given Pick home">
            <BrandLockup />
          </Link>
          <h1>This call is for the coaching staff</h1>
          <p>Your account is signed in, but it does not have administrator access.</p>
          <Link href="/" className="admin-return-link">Return to the player call sheet</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell" data-design-seed="dbd731b4">
      <template dangerouslySetInnerHTML={{ __html: adminSettingsDesignContract }} />
      <header className="admin-header">
        <Link href="/" className="admin-brand" aria-label="Any Given Pick home">
          <BrandLockup />
        </Link>
        <div className="admin-header__title">
          <strong>Admin settings</strong>
          <span>Coach&apos;s booth</span>
        </div>
        <div className="admin-header__actions">
          <Link href="/" className="admin-text-link">Player view</Link>
          <UserButton />
        </div>
      </header>

      <section className="admin-settings-workspace" aria-labelledby="admin-settings-title">
        <div className="admin-settings-intro">
          <div>
            <h1 id="admin-settings-title">Call the season</h1>
            <p>Open the schedule tools you use most. Every imported week stays private until you publish it.</p>
          </div>
          <span className="admin-status-stamp">Admin access</span>
        </div>

        <nav className="admin-settings-list" aria-label="Administrator tools">
          <Link href="/admin/weeks/import" className="admin-settings-call admin-settings-call--primary">
            <Icon name="picks" />
            <span><strong>Import season schedule</strong><small>Add preseason and regular-season games from one file.</small></span>
            <Icon name="arrow" />
          </Link>
          <Link href="/admin/weeks" className="admin-settings-call">
            <Icon name="settings" />
            <span><strong>Manage contest weeks</strong><small>Edit deadlines, review matchups, and publish each week.</small></span>
            <Icon name="arrow" />
          </Link>
        </nav>

        <footer className="admin-settings-note">
          <Icon name="shield" />
          <p><strong>Protected controls.</strong> These links and pages are available only to accounts with an administrator role.</p>
        </footer>
      </section>
    </main>
  );
}
