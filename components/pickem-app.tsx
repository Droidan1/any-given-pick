"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveEntryDraft, submitEntry } from "@/app/entry-actions";
import type { AccountSummary } from "@/lib/account-types";
import { draftPayloadSignature, sanitizeDraftPicks } from "@/lib/entries/rules";
import type { PlayerGame, PlayerWeek } from "@/lib/entries/types";
import { BrandLockup } from "./brand-lockup";
import { Icon, type IconName, RouteSketch } from "./icons";

type View = "home" | "picks" | "standings" | "groups" | "profile";
type Picks = Record<string, string>;
type ReceiptData = {
  versionNumber: number;
  committedAt: string;
  action: "submit" | "edit";
};

const LEGACY_DRAFT_STORAGE_KEY = "any-given-pick-draft:v1";

function gameRulesForCurrentSlate(games: PlayerGame[]) {
  return games.map((game) => ({
    id: game.id,
    awayTeamCode: game.away.abbreviation,
    homeTeamCode: game.home.abbreviation,
  }));
}

function picksForCurrentSlate(games: PlayerGame[], picks: Picks): Picks {
  return sanitizeDraftPicks(gameRulesForCurrentSlate(games), picks);
}

function signatureForDraft(games: PlayerGame[], picks: Picks, mondayPrediction: number | null) {
  return draftPayloadSignature({
    games: gameRulesForCurrentSlate(games),
    picks,
    mondayPrediction,
  });
}

const navItems: { view: View; label: string; icon: IconName }[] = [
  { view: "home", label: "Home", icon: "home" },
  { view: "picks", label: "Picks", icon: "picks" },
  { view: "standings", label: "Standings", icon: "standings" },
  { view: "groups", label: "Groups", icon: "groups" },
  { view: "profile", label: "Profile", icon: "profile" },
];

const standings = [
  { rank: 1, name: "Fourth & Long", correct: 7, delta: 2 },
  { rank: 2, name: "Sunday Drive", correct: 7, delta: 5 },
  { rank: 3, name: "Goal Line", correct: 6, delta: 1 },
  { rank: 4, name: "Your entry", correct: 5, delta: 4 },
  { rank: 5, name: "Two Minute", correct: 5, delta: 8 },
];

export function PickemApp({ account, week, isAdmin }: { account: AccountSummary; week: PlayerWeek | null; isAdmin: boolean }) {
  const [view, setView] = useState<View>("picks");
  const [picks, setPicks] = useState<Picks>(() =>
    picksForCurrentSlate(week?.games ?? [], week?.entry?.draftPicks ?? {}),
  );
  const [mondayTotal, setMondayTotal] = useState(() => week?.entry?.mondayPrediction ?? 44);
  const [status, setStatus] = useState(week?.entry ? "Your saved entry is loaded." : "");
  const [reviewing, setReviewing] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(() => {
    if (!week?.entry?.submittedAt || week.entry.currentVersionNumber === 0) return null;
    return {
      versionNumber: week.entry.currentVersionNumber,
      committedAt: week.entry.submittedAt,
      action: week.entry.currentVersionNumber === 1 ? "submit" : "edit",
    };
  });
  const [draftReady, setDraftReady] = useState(false);
  const [isPending, startTransition] = useTransition();
  const firstMissingRef = useRef<HTMLDivElement | null>(null);
  const lastSavedSignatureRef = useRef("");

  const draftStorageKey = week ? `any-given-pick-draft:v2:${week.id}` : null;
  const games = week?.games ?? [];
  const canParticipate = account.overallResult === "eligible";
  const isLocked = week?.isLocked ?? true;

  useEffect(() => {
    if (!week || !draftStorageKey) {
      return;
    }

    const currentDraft = window.localStorage.getItem(draftStorageKey);
    const legacyDraft = window.localStorage.getItem(LEGACY_DRAFT_STORAGE_KEY);
    const stored = currentDraft ?? legacyDraft;
    const serverVersion = week.entry?.currentVersionNumber ?? 0;
    const frame = window.requestAnimationFrame(() => {
      try {
        if (stored) {
          const draft = JSON.parse(stored) as {
            picks?: Picks;
            mondayTotal?: number;
            baseVersion?: number;
          };
          if ((draft.baseVersion ?? 0) >= serverVersion) {
            if (draft.picks) setPicks(picksForCurrentSlate(week.games, draft.picks));
            if (Number.isInteger(draft.mondayTotal)) setMondayTotal(draft.mondayTotal ?? 44);
          }
          if (!currentDraft && legacyDraft) {
            window.localStorage.setItem(
              draftStorageKey,
              JSON.stringify({ ...draft, baseVersion: serverVersion }),
            );
            window.localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
          }
        }
      } catch {
        window.localStorage.removeItem(currentDraft ? draftStorageKey : LEGACY_DRAFT_STORAGE_KEY);
      } finally {
        lastSavedSignatureRef.current = signatureForDraft(
          week.games,
          week.entry?.draftPicks ?? {},
          week.entry?.mondayPrediction ?? 44,
        );
        setDraftReady(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draftStorageKey, week]);

  useEffect(() => {
    if (!draftReady || !draftStorageKey || !week) return;
    window.localStorage.setItem(
      draftStorageKey,
      JSON.stringify({
        picks,
        mondayTotal,
        baseVersion: week.entry?.currentVersionNumber ?? 0,
      }),
    );

    const signature = signatureForDraft(week.games, picks, mondayTotal);
    if (!canParticipate || isLocked || signature === lastSavedSignatureRef.current) return;

    const timer = window.setTimeout(() => {
      setStatus("Syncing draft…");
      startTransition(async () => {
        const result = await saveEntryDraft({
          weekId: week.id,
          picks,
          mondayPrediction: mondayTotal,
        });
        if (result.ok) {
          lastSavedSignatureRef.current = signature;
        } else if (result.code === "invalid_pick") {
          const currentPicks = picksForCurrentSlate(week.games, picks);
          if (JSON.stringify(currentPicks) !== JSON.stringify(picks)) {
            setPicks(currentPicks);
            setStatus("The schedule changed. Your valid picks were kept and the draft is syncing again.");
            return;
          }
        }
        setStatus(result.message);
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [canParticipate, draftReady, draftStorageKey, isLocked, mondayTotal, picks, week]);

  if (!week) {
    return (
      <AppFrame view={view} setView={setView} account={account} isAdmin={isAdmin}>
        <section className="single-view no-week-view">
          <RouteSketch /><RouteSketch mirrored />
          <p className="week-label">Coach&apos;s call sheet</p>
          <h1>The next slate is being drawn up.</h1>
          <p className="lead">There is no published week yet. Once the commissioner publishes one, the official matchups will appear here automatically.</p>
          <div className="empty-state"><Icon name="picks" /><h2>Check back soon</h2><p>Your player account is ready for kickoff.</p></div>
        </section>
      </AppFrame>
    );
  }

  const selectedCount = games.filter((game) => Boolean(picks[game.id])).length;
  const missingCount = games.length - selectedCount;
  const firstMissingId = games.find((game) => !picks[game.id])?.id;
  const isComplete = selectedCount === games.length && Number.isInteger(mondayTotal) && mondayTotal >= 0;
  const selectedTeams = games.map((game) => picks[game.id]).filter(Boolean);

  const chooseTeam = (gameId: string, abbreviation: string) => {
    if (isLocked) return;
    setPicks((current) => ({ ...current, [gameId]: abbreviation }));
    setStatus(`${abbreviation} selected. Syncing your draft…`);
    setReviewing(false);
    setReceipt(null);
  };

  const beginReview = () => {
    if (isLocked) {
      setStatus("This week is locked. Your latest submitted version remains official.");
      return;
    }
    if (!isComplete) {
      setStatus(`${missingCount} ${missingCount === 1 ? "pick is" : "picks are"} still missing. Choose one team in every matchup.`);
      window.setTimeout(() => firstMissingRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      return;
    }
    setReviewing(true);
    setStatus("Review every selection before submitting your official entry.");
  };

  const commitEntry = () => {
    if (!canParticipate) {
      setStatus(account.reasonLabel);
      setView("profile");
      setReviewing(false);
      return;
    }
    if (isLocked) {
      setStatus("The entry deadline has passed.");
      return;
    }

    startTransition(async () => {
      setStatus("Sending your official entry…");
      const result = await submitEntry({
        weekId: week.id,
        picks,
        mondayPrediction: mondayTotal,
        submissionKey: crypto.randomUUID(),
      });
      setStatus(result.message);
      if (result.ok && result.receipt) {
        setReceipt(result.receipt);
        setReviewing(false);
        lastSavedSignatureRef.current = signatureForDraft(week.games, picks, mondayTotal);
        if (draftStorageKey) window.localStorage.removeItem(draftStorageKey);
      }
    });
  };

  return (
    <AppFrame view={view} setView={setView} account={account} isAdmin={isAdmin}>
      {view === "picks" && (
        <PicksView
          week={week}
          games={games}
          picks={picks}
          selectedCount={selectedCount}
          mondayTotal={mondayTotal}
          status={status}
          reviewing={reviewing}
          receipt={receipt}
          firstMissingId={firstMissingId}
          firstMissingRef={firstMissingRef}
          onChoose={chooseTeam}
          onMondayTotal={setMondayTotal}
          onReview={beginReview}
          onReceipt={commitEntry}
          account={account}
          isPending={isPending}
          isLocked={isLocked}
          hasSubmitted={(week.entry?.currentVersionNumber ?? 0) > 0}
          onEdit={() => { setReviewing(false); setReceipt(null); setStatus("Edit mode restored. Submit again to make changes official."); }}
        />
      )}
      {view === "home" && <HomeView week={week} selectedCount={selectedCount} onContinue={() => setView("picks")} account={account} />}
      {view === "standings" && <StandingsView week={week} />}
      {view === "groups" && <GroupsView />}
      {view === "profile" && <ProfileView selectedTeams={selectedTeams} totalGames={games.length} account={account} isAdmin={isAdmin} />}
    </AppFrame>
  );
}

function AppFrame({
  view,
  setView,
  account,
  isAdmin,
  children,
}: {
  view: View;
  setView: (view: View) => void;
  account: AccountSummary;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className="app-shell">
      <aside className="side-nav" aria-label="Primary navigation">
        <button className="brand-home" type="button" onClick={() => setView("home")} aria-label="Any Given Pick home"><BrandLockup /></button>
        <div className="nav-list">
          {navItems.map((item) => (
            <button className={`nav-item${view === item.view ? " nav-item--active" : ""}`} key={item.view} type="button" onClick={() => setView(item.view)} aria-current={view === item.view ? "page" : undefined}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </button>
          ))}
          <Link className="nav-item nav-item--link" href="/activity">
            <Icon name="activity" /><span>My activity</span>
          </Link>
          {isAdmin && (
            <Link className="nav-item nav-item--link" href="/admin">
              <Icon name="settings" /><span>Admin</span>
            </Link>
          )}
        </div>
        <AccountDock account={account} compact />
      </aside>
      <section className="surface">
        <div className="surface-account"><AccountDock account={account} /></div>
        <button className="mobile-brand" type="button" onClick={() => setView("home")} aria-label="Any Given Pick home"><BrandLockup /></button>
        {children}
      </section>
      <nav className={`bottom-nav${isAdmin ? " bottom-nav--admin" : ""}`} aria-label="Primary navigation">
        {navItems.filter((item) => item.view !== "groups" && item.view !== "standings").map((item) => (
          <button className={`bottom-nav__item${view === item.view ? " bottom-nav__item--active" : ""}`} key={item.view} type="button" onClick={() => setView(item.view)} aria-current={view === item.view ? "page" : undefined}>
            <Icon name={item.icon} /><span>{item.label}</span>
          </button>
        ))}
        <Link className="bottom-nav__item bottom-nav__item--link" href="/activity">
          <Icon name="activity" /><span>Activity</span>
        </Link>
        {isAdmin && (
          <Link className="bottom-nav__item bottom-nav__item--link" href="/admin">
            <Icon name="settings" /><span>Admin</span>
          </Link>
        )}
      </nav>
    </main>
  );
}

type PicksViewProps = {
  week: PlayerWeek;
  games: PlayerGame[];
  picks: Picks;
  selectedCount: number;
  mondayTotal: number;
  status: string;
  reviewing: boolean;
  receipt: ReceiptData | null;
  firstMissingId?: string;
  firstMissingRef: React.RefObject<HTMLDivElement | null>;
  onChoose: (gameId: string, abbreviation: string) => void;
  onMondayTotal: (value: number) => void;
  onReview: () => void;
  onReceipt: () => void;
  onEdit: () => void;
  account: AccountSummary;
  isPending: boolean;
  isLocked: boolean;
  hasSubmitted: boolean;
};

function PicksView(props: PicksViewProps) {
  const tiebreakerLabel = props.week.seasonPhase === "preseason" ? "Tiebreaker" : "Monday";
  return (
    <div className="picks-layout">
      <section className="pick-sheet" aria-labelledby="picks-title">
        <header className="pick-header">
          <RouteSketch /><RouteSketch mirrored />
          <p className="week-label">{props.week.label} Pick&apos;em</p>
          <h1 id="picks-title">Make your picks</h1>
          <div className="deadline-marker"><Icon name="clock" /><span>{props.isLocked ? "Locked" : "Locks"} · {props.week.deadlineLabel}</span></div>
          <div className="eligibility-line"><Icon name="shield" /><span>{props.account.reasonLabel}</span></div>
        </header>

        <ProgressMeasure selected={props.selectedCount} total={props.games.length} />

        <div className="matchup-list" aria-label="Weekly matchups">
          {props.games.map((game) => {
            const selected = props.picks[game.id];
            const missing = !selected;
            return (
              <div className={`matchup${missing ? " matchup--missing" : ""}`} key={game.id} ref={game.id === props.firstMissingId ? props.firstMissingRef : undefined}>
                <div className="matchup-time"><span>{game.day}</span><span>{game.time}</span></div>
                <button className={`team-choice${selected === game.away.abbreviation ? " team-choice--selected" : ""}`} type="button" onClick={() => props.onChoose(game.id, game.away.abbreviation)} aria-pressed={selected === game.away.abbreviation} aria-label={`Pick ${game.away.name}`} disabled={props.isLocked || props.isPending}>
                  {selected === game.away.abbreviation && <Icon name="check" />}<span>{game.away.abbreviation}</span><small>{game.away.name}</small>
                </button>
                <span className="at-mark" aria-hidden="true">@</span>
                <button className={`team-choice${selected === game.home.abbreviation ? " team-choice--selected" : ""}`} type="button" onClick={() => props.onChoose(game.id, game.home.abbreviation)} aria-pressed={selected === game.home.abbreviation} aria-label={`Pick ${game.home.name}`} disabled={props.isLocked || props.isPending}>
                  {selected === game.home.abbreviation && <Icon name="check" />}<span>{game.home.abbreviation}</span><small>{game.home.name}</small>
                </button>
              </div>
            );
          })}
        </div>
        <p className="prototype-note">Official commissioner-published slate · kickoff times shown in Eastern Time.</p>
      </section>

      <aside className="game-panel" aria-label="Entry controls">
        <div className="desktop-progress"><ProgressMeasure selected={props.selectedCount} total={props.games.length} /></div>
        <MondayTotal label={tiebreakerLabel} value={props.mondayTotal} onChange={props.onMondayTotal} disabled={props.isLocked || props.isPending} />
        <div className="rules-note">
          <RouteSketch mirrored /><h2>How this week works</h2>
          <ul><li>Pick one team in each matchup.</li><li>Each correct pick counts as one point.</li><li>{tiebreakerLabel} Total breaks a tie.</li><li>Your latest submitted version before the deadline is official.</li></ul>
        </div>

        {props.receipt ? (
          <Receipt receipt={props.receipt} picks={props.picks} mondayTotal={props.mondayTotal} tiebreakerLabel={tiebreakerLabel} onEdit={props.onEdit} locked={props.isLocked} />
        ) : props.reviewing ? (
          <ReviewPanel games={props.games} picks={props.picks} mondayTotal={props.mondayTotal} tiebreakerLabel={tiebreakerLabel} onReceipt={props.onReceipt} onEdit={props.onEdit} account={props.account} isPending={props.isPending} isLocked={props.isLocked} hasSubmitted={props.hasSubmitted} />
        ) : (
          <button className="review-action" type="button" onClick={props.onReview} disabled={props.isPending || props.isLocked}>
            <Icon name="whistle" /><span>{props.isLocked ? "Entry locked" : `Review ${props.games.length} picks`}</span><Icon name="arrow" />
          </button>
        )}
        <p className="status-message" aria-live="polite">{props.status || (props.isLocked ? "The deadline has passed. Your latest submitted entry is official." : "Draft changes sync automatically.")}</p>
      </aside>
    </div>
  );
}

function ProgressMeasure({ selected, total }: { selected: number; total: number }) {
  const percent = total ? Math.round((selected / total) * 100) : 0;
  return (
    <div className="progress-measure" aria-label={`${selected} of ${total} picks selected`}>
      <div className="progress-copy"><strong>{selected}</strong><span>of {total} selected</span></div>
      <div className="yard-scale" aria-hidden="true"><span className="yard-fill" style={{ transform: `scaleX(${percent / 100})` }} />{Array.from({ length: total + 1 }, (_, index) => <i key={index} />)}</div>
      <div className="scale-labels" aria-hidden="true"><span>0</span><span>{Math.floor(total / 2)}</span><span>{total}</span></div>
    </div>
  );
}

function MondayTotal({ label, value, onChange, disabled }: { label: string; value: number; onChange: (value: number) => void; disabled: boolean }) {
  return (
    <div className="monday-total">
      <div className="drill-tag"><span>2-min</span><span>drill</span></div>
      <label htmlFor="monday-total">{label} <strong>Total</strong></label>
      <div className="number-control">
        <button type="button" onClick={() => onChange(Math.min(200, value + 1))} aria-label={`Increase ${label.toLocaleLowerCase("en-US")} total`} disabled={disabled}>+</button>
        <input id="monday-total" min="0" max="200" step="1" inputMode="numeric" type="number" value={value} disabled={disabled} onChange={(event) => { const nextValue = Number.parseInt(event.target.value, 10); onChange(Number.isFinite(nextValue) ? Math.min(200, Math.max(0, nextValue)) : 0); }} />
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Decrease ${label.toLocaleLowerCase("en-US")} total`} disabled={disabled}>−</button>
      </div>
    </div>
  );
}

function ReviewPanel({ games, picks, mondayTotal, tiebreakerLabel, onReceipt, onEdit, account, isPending, isLocked, hasSubmitted }: { games: PlayerGame[]; picks: Picks; mondayTotal: number; tiebreakerLabel: string; onReceipt: () => void; onEdit: () => void; account: AccountSummary; isPending: boolean; isLocked: boolean; hasSubmitted: boolean }) {
  const canParticipate = account.overallResult === "eligible" && !isLocked;
  return (
    <section className="review-panel" aria-labelledby="review-title">
      <h2 id="review-title">Review your entry</h2>
      <div className="review-grid">{games.map((game) => <span key={game.id}>{picks[game.id]}</span>)}</div>
      <p>{tiebreakerLabel} Total <strong>{mondayTotal}</strong></p>
      <button className="commit-action" type="button" onClick={onReceipt} disabled={!canParticipate || isPending}>{isPending ? "Submitting…" : canParticipate ? (hasSubmitted ? "Submit changes" : "Submit official entry") : isLocked ? "Entry locked" : "Eligibility required"}</button>
      {!canParticipate && !isLocked && <Link className="text-action text-action--link" href="/profile">{account.reasonLabel}</Link>}
      <button className="text-action" type="button" onClick={onEdit} disabled={isPending}>Back to picks</button>
    </section>
  );
}

function Receipt({ receipt, picks, mondayTotal, tiebreakerLabel, onEdit, locked }: { receipt: ReceiptData; picks: Picks; mondayTotal: number; tiebreakerLabel: string; onEdit: () => void; locked: boolean }) {
  const time = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Indiana/Indianapolis" }).format(new Date(receipt.committedAt));
  return (
    <section className="receipt" aria-labelledby="receipt-title">
      <Icon name="check" /><h2 id="receipt-title">Entry {receipt.action === "edit" ? "updated" : "submitted"}</h2>
      <p>{Object.values(picks).join(" · ")}</p><p>{tiebreakerLabel} Total <strong>{mondayTotal}</strong></p>
      <time>{time} ET</time><small>Official version {receipt.versionNumber} · Keep this timestamp as your receipt.</small>
      {!locked && <button className="text-action" type="button" onClick={onEdit}>Edit and resubmit</button>}
    </section>
  );
}

function HomeView({ selectedCount, onContinue, account, week }: { selectedCount: number; onContinue: () => void; account: AccountSummary; week: PlayerWeek }) {
  return (
    <section className="single-view home-view"><RouteSketch /><RouteSketch mirrored /><p className="week-label">{week.label} Pick&apos;em</p><h1>One sheet. {week.games.length} calls.</h1><p className="lead">Finish and submit your entry before {week.deadlineLabel}.</p><div className="home-status"><Icon name="shield" /><span>{account.reasonLabel}</span><strong>{selectedCount}/{week.games.length} picks</strong></div><button className="review-action" type="button" onClick={onContinue}><span>{selectedCount ? "Continue your picks" : "Make your picks"}</span><Icon name="arrow" /></button></section>
  );
}

function StandingsView({ week }: { week: PlayerWeek }) {
  return (
    <section className="single-view standings-view"><p className="week-label">Sample standings</p><h1>{week.label} board</h1><p className="lead">Picks reveal after the deadline. This sample shows the planned ranking treatment.</p><div className="standings-table" role="table" aria-label={`Sample ${week.label} standings`}><div className="standings-row standings-row--header" role="row"><span>Rank</span><span>Player</span><span>Correct</span><span>TB diff</span></div>{standings.map((entry) => <div className={`standings-row${entry.name === "Your entry" ? " standings-row--you" : ""}`} role="row" key={entry.rank}><strong>{entry.rank}</strong><span>{entry.name}</span><span>{entry.correct}</span><span>{entry.delta}</span></div>)}</div></section>
  );
}

function GroupsView() {
  return <section className="single-view groups-view"><p className="week-label">Private groups</p><h1>Your locker room</h1><p className="lead">Private groups are admin-created and keep their entries, rules and standings separate from the public contest.</p><div className="empty-state"><Icon name="groups" /><h2>No group invitations yet</h2><p>An accepted invitation will appear here with its own weekly call sheet.</p></div></section>;
}

function ProfileView({ selectedTeams, totalGames, account, isAdmin }: { selectedTeams: string[]; totalGames: number; account: AccountSummary; isAdmin: boolean }) {
  return (
    <section className="single-view profile-view"><p className="week-label">Profile & access</p><h1>{account.displayName ?? "Finish your player card"}</h1><div className="access-lines"><div><Icon name="shield" /><span>Indiana location</span><strong>{account.locationResult === "in_state" ? "Cleared" : "Open"}</strong></div><div><Icon name="check" /><span>Age requirement</span><strong>{account.ageEligible ? "Cleared" : "Open"}</strong></div><div><Icon name="profile" /><span>Verified sign-in</span><strong>{account.verifiedAuth ? "Cleared" : "Open"}</strong></div><div><Icon name="picks" /><span>Draft selections</span><strong>{selectedTeams.length}/{totalGames}</strong></div></div><p className="prototype-note">{account.reasonLabel}. Eligibility evidence is evaluated on the server.</p><div className="profile-actions"><Link className="review-action" href="/profile">Open player card</Link>{isAdmin && <Link className="admin-profile-link" href="/admin"><Icon name="settings" />Open admin settings</Link>}</div></section>
  );
}

function AccountDock({ account, compact = false }: { account: AccountSummary; compact?: boolean }) {
  return <div className={`account-dock${compact ? " account-dock--compact" : ""}`}><UserButton /><Link href="/profile"><span>{account.displayName ?? "Player card"}</span><small>{account.overallResult === "eligible" ? "Eligible" : "Read-only"}</small></Link></div>;
}
