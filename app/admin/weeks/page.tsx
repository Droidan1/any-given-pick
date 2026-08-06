import type { Metadata } from "next";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { BrandLockup } from "@/components/brand-lockup";
import { formatWeekName } from "@/lib/admin/schedule-import";
import { getAdminWeek, listAdminWeeks } from "@/lib/admin/weeks";
import { hasAdminRole } from "@/lib/auth/admin";
import { requireAppUser } from "@/lib/auth/app-user";
import { AdminWeekBuilder } from "./week-builder";

export const metadata: Metadata = {
  title: "Week operations",
  description: "Import, validate, and publish Any Given Pick contest weeks.",
};

const adminDesignContract = `<!--
THESIS: Week operations should feel like preparing one trusted sideline call sheet, not configuring a generic sports dashboard.
OWN-WORLD: Deep field-green booth, warm ruled paper, maize commitments, clay clock cues, condensed calls, and sparse play-diagram geometry.
STORY: Set the lock, import the slate, clear every validation flag, save privately, then publish one complete week.
FIRST VIEWPORT: The current week state and four-stage publishing sequence lead directly into week details and the import station.
FORM: Guided setup within the established Coach's Call Sheet world; surface seed dbd731b4.
FINISH: Server authorization, parser tests, database guards, desktop/mobile inspection, accessibility audit, and finish review close the work.
-->`;

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function scheduleTextForWeek(week: NonNullable<Awaited<ReturnType<typeof getAdminWeek>>>): string {
  const header =
    "kickoff_at,away_code,away_name,home_code,home_name,monday_tiebreaker,provider_game_key";
  return [
    header,
    ...week.games.map((game) =>
      [
        game.kickoffAt,
        game.awayTeamCode,
        csvField(game.awayTeamName),
        game.homeTeamCode,
        csvField(game.homeTeamName),
        game.isMondayTiebreaker ? "true" : "false",
        csvField(game.providerGameKey ?? ""),
      ].join(","),
    ),
  ].join("\n");
}

export default async function AdminWeeksPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await auth.protect();
  const appUser = await requireAppUser();
  const isAdmin = await hasAdminRole(appUser.id);

  if (!isAdmin) {
    return (
      <main className="admin-access-shell" data-design-seed="dbd731b4">
        <template dangerouslySetInnerHTML={{ __html: adminDesignContract }} />
        <section className="admin-access-sheet">
          <Link href="/" className="admin-brand" aria-label="Any Given Pick home">
            <BrandLockup />
          </Link>
          <h1>This call is for the coaching staff</h1>
          <p>
            Your account is signed in, but it does not have an administrator role. Ask a
            super administrator to add you before opening week operations.
          </p>
          <Link href="/" className="admin-return-link">Return to the player call sheet</Link>
        </section>
      </main>
    );
  }

  const { week: selectedWeekId } = await searchParams;
  const [weeks, selectedWeek] = await Promise.all([
    listAdminWeeks(),
    selectedWeekId ? getAdminWeek(selectedWeekId) : Promise.resolve(null),
  ]);

  return (
    <main className="admin-shell" data-design-seed="dbd731b4">
      <template dangerouslySetInnerHTML={{ __html: adminDesignContract }} />
      <header className="admin-header">
        <Link href="/" className="admin-brand" aria-label="Any Given Pick home">
          <BrandLockup />
        </Link>
        <div className="admin-header__title">
          <strong>Week operations</strong>
          <span>Coach&apos;s booth</span>
        </div>
        <div className="admin-header__actions">
          <Link href="/" className="admin-text-link">Player view</Link>
          <UserButton />
        </div>
      </header>

      <div className="admin-workspace">
        <aside className="admin-ledger" aria-label="Contest weeks">
          <div className="admin-ledger__heading">
            <h2>Season board</h2>
            <div className="admin-ledger__actions">
              <Link href="/admin/weeks/import" className="admin-season-import-link">Import season</Link>
              <Link href="/admin/weeks" className="admin-new-week">New week</Link>
            </div>
          </div>
          {weeks.length === 0 ? (
            <p className="admin-ledger__empty">No weeks yet. Build the first call sheet.</p>
          ) : (
            <ol className="admin-week-list">
              {weeks.map((week) => (
                <li key={week.id}>
                  <Link
                    href={`/admin/weeks?week=${week.id}`}
                    aria-current={selectedWeek?.id === week.id ? "page" : undefined}
                  >
                    <span>{week.season} · {week.seasonPhase === "preseason" ? "Preseason" : "Regular season"}</span>
                    <strong>{week.label || formatWeekName(week.seasonPhase, week.weekNumber)}</strong>
                    <small>{week.gameCount} games · {week.status}</small>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </aside>

        <AdminWeekBuilder
          initialWeek={
            selectedWeek
              ? {
                  id: selectedWeek.id,
                  season: selectedWeek.season,
                  seasonPhase: selectedWeek.seasonPhase,
                  weekNumber: selectedWeek.weekNumber,
                  label: selectedWeek.label ?? "",
                  entryDeadline: selectedWeek.entryDeadline,
                  scheduleText: scheduleTextForWeek(selectedWeek),
                  status: selectedWeek.status,
                }
              : null
          }
        />
      </div>
    </main>
  );
}
