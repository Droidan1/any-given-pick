import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { LiveWeekRaceBoard } from "@/components/live-week-race";
import { PickemServerShell } from "@/components/pickem-home";
import { Icon } from "@/components/icons";
import { hasAdminRole } from "@/lib/auth/admin";
import { requireAppUser } from "@/lib/auth/app-user";
import { getAccountSummary } from "@/lib/eligibility/service";
import { buildLiveWeekRace } from "@/lib/race/rules";
import { getWeeklyResults } from "@/lib/results/service";

export const metadata: Metadata = {
  title: "Live week race",
  description: "Follow the weekly Any Given Pick field as live scores change every player's path to first.",
};

const BUSINESS_TIME_ZONE = "America/Indiana/Indianapolis";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

export default async function LiveRacePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const [{ userId }, params] = await Promise.all([auth(), searchParams]);
  if (!userId) redirect("/sign-in");

  const appUser = await requireAppUser(userId);
  const [account, isAdmin, results] = await Promise.all([
    getAccountSummary(appUser.id),
    hasAdminRole(appUser.id),
    getWeeklyResults({ weekId: params.week, currentUserId: appUser.id }),
  ]);
  if (account.accountState !== "active" && !isAdmin) redirect("/profile");
  const race = buildLiveWeekRace(results);

  return (
    <PickemServerShell account={account} isAdmin={isAdmin} active="race">
      <section className="single-view live-race-view">
        {race.status !== "ready" && results.weeks.length > 1 ? (
          <form className="live-race-week-picker" method="get">
            <label htmlFor="race-week">Race week</label>
            <select id="race-week" name="week" defaultValue={results.selectedWeek?.id}>
              {results.weeks.map((week) => (
                <option value={week.id} key={week.id}>{week.season} · {week.label}</option>
              ))}
            </select>
            <button type="submit">Open race <Icon name="arrow" /></button>
          </form>
        ) : null}

        {race.status === "ready" && race.players.length > 0 ? (
          <LiveWeekRaceBoard race={race} weekOptions={results.weeks} />
        ) : race.status === "sealed" && race.week ? (
          <section className="live-race-empty" aria-labelledby="race-sealed-title">
            <Icon name="shield" />
            <div>
              <h1 id="race-sealed-title">The field stays sealed until lock.</h1>
              <p>{race.week.label} opens for live comparison at {formatDateTime(race.week.entryDeadline)}.</p>
            </div>
          </section>
        ) : (
          <section className="live-race-empty" aria-labelledby="race-empty-title">
            <Icon name="standings" />
            <div>
              <h1 id="race-empty-title">The live field is waiting.</h1>
              <p>{race.week ? "No official cards are available for this week." : "A published call sheet will start the next race."}</p>
            </div>
          </section>
        )}

        <nav className="live-race-related" aria-label="Live race and results">
          <Link href="/race" aria-current="page">Live race</Link>
          <Link href="/trends" prefetch={false}>Pick trends</Link>
          <Link href="/results" prefetch={false}>Weekly cards</Link>
          <Link href="/standings" prefetch={false}>Standings</Link>
          <Link href="/activity" prefetch={false}>My activity</Link>
        </nav>
      </section>
    </PickemServerShell>
  );
}
