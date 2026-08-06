import type { Metadata } from "next";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { BrandLockup } from "@/components/brand-lockup";
import { hasAdminRole } from "@/lib/auth/admin";
import { requireAppUser } from "@/lib/auth/app-user";
import { SeasonImporter } from "./season-importer";

export const metadata: Metadata = {
  title: "Import a season",
  description: "Create private Any Given Pick week drafts from one full-season schedule.",
};

const seasonImportDesignContract = `<!--
THESIS: A whole NFL season should become trusted private call sheets in one reviewable move, never a generic data-upload dashboard.
OWN-WORLD: The incumbent Coach's Call Sheet system—field green booth, warm ruled paper, maize commitments, clay clock cues, condensed calls, and hard-edged controls.
STORY: Load one file, inspect every generated week and automatic rule, then create private drafts without publishing anything.
FIRST VIEWPORT: The full admin header and import playbook frame a broad ruled sheet led by the season command, three-step state, and file station.
FORM: Guided season setup extending the approved week-operations surface; incumbent seed dbd731b4.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

export default async function SeasonImportPage() {
  await auth.protect();
  const appUser = await requireAppUser();
  const isAdmin = await hasAdminRole(appUser.id);

  if (!isAdmin) {
    return (
      <main className="admin-access-shell" data-design-seed="dbd731b4">
        <template dangerouslySetInnerHTML={{ __html: seasonImportDesignContract }} />
        <section className="admin-access-sheet">
          <Link href="/" className="admin-brand" aria-label="Any Given Pick home">
            <BrandLockup />
          </Link>
          <h1>This call is for the coaching staff</h1>
          <p>Your account does not have permission to import a season.</p>
          <Link href="/" className="admin-return-link">Return to the player call sheet</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell" data-design-seed="dbd731b4">
      <template dangerouslySetInnerHTML={{ __html: seasonImportDesignContract }} />
      <header className="admin-header">
        <Link href="/" className="admin-brand" aria-label="Any Given Pick home">
          <BrandLockup />
        </Link>
        <div className="admin-header__title">
          <strong>Season import</strong>
          <span>Coach&apos;s booth</span>
        </div>
        <div className="admin-header__actions">
          <Link href="/admin/weeks" className="admin-text-link">Week operations</Link>
          <UserButton />
        </div>
      </header>

      <div className="admin-workspace">
        <aside className="admin-ledger season-import-playbook" aria-label="Season import rules">
          <div className="admin-ledger__heading">
            <h2>Import playbook</h2>
            <Link href="/admin/weeks" className="admin-new-week">Back</Link>
          </div>
          <ol>
            <li><strong>One file</strong><span>Preseason and regular season can share the same sheet.</span></li>
            <li><strong>Private first</strong><span>No week is published by the importer.</span></li>
            <li><strong>All or none</strong><span>One protected week stops every change.</span></li>
            <li><strong>Reviewable</strong><span>Edit any generated draft in Week operations.</span></li>
          </ol>
        </aside>
        <SeasonImporter />
      </div>
    </main>
  );
}
