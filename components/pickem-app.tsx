"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { games, initialPicks } from "@/lib/games";
import type { AccountSummary } from "@/lib/account-types";
import { BrandLockup } from "./brand-lockup";
import { Icon, type IconName, RouteSketch } from "./icons";

type View = "home" | "picks" | "standings" | "groups" | "profile";
type Picks = Record<string, string>;

const DRAFT_STORAGE_KEY = "any-given-pick-draft:v1";
const LEGACY_DRAFT_STORAGE_KEY = "pickem-prototype-draft:v1";

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

export function PickemApp({ account }: { account: AccountSummary | null }) {
  const [view, setView] = useState<View>("picks");
  const [picks, setPicks] = useState<Picks>(initialPicks);
  const [mondayTotal, setMondayTotal] = useState(44);
  const [status, setStatus] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [receiptTime, setReceiptTime] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const firstMissingRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const currentDraft = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    const legacyDraft = window.localStorage.getItem(LEGACY_DRAFT_STORAGE_KEY);
    const stored = currentDraft ?? legacyDraft;
    const frame = window.requestAnimationFrame(() => {
      try {
        if (!stored) return;
        const draft = JSON.parse(stored) as { picks?: Picks; mondayTotal?: number };
        if (draft.picks) setPicks(draft.picks);
        if (Number.isInteger(draft.mondayTotal)) setMondayTotal(draft.mondayTotal ?? 44);
        if (!currentDraft && legacyDraft) {
          window.localStorage.setItem(DRAFT_STORAGE_KEY, legacyDraft);
          window.localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
        }
      } catch {
        window.localStorage.removeItem(currentDraft ? DRAFT_STORAGE_KEY : LEGACY_DRAFT_STORAGE_KEY);
      } finally {
        setDraftReady(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    window.localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ picks, mondayTotal }),
    );
  }, [draftReady, picks, mondayTotal]);

  const selectedCount = Object.keys(picks).length;
  const missingCount = games.length - selectedCount;
  const firstMissingId = games.find((game) => !picks[game.id])?.id;
  const isComplete = selectedCount === games.length && Number.isInteger(mondayTotal) && mondayTotal >= 0;

  const selectedTeams = games.map((game) => picks[game.id]).filter(Boolean);

  const chooseTeam = (gameId: string, abbreviation: string) => {
    setPicks((current) => ({ ...current, [gameId]: abbreviation }));
    setStatus(`${abbreviation} selected. Draft saved on this device.`);
    setReviewing(false);
    setReceiptTime(null);
  };

  const beginReview = () => {
    if (!isComplete) {
      setStatus(
        `${missingCount} ${missingCount === 1 ? "pick is" : "picks are"} still missing. Choose one team in every matchup.`,
      );
      window.setTimeout(() => firstMissingRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      return;
    }
    setReviewing(true);
    setStatus("Review every selection before creating the prototype receipt.");
  };

  const createReceipt = () => {
    if (!account || account.overallResult !== "eligible") {
      setStatus(account?.reasonLabel ?? "Sign in and clear eligibility before participating.");
      setView("profile");
      setReviewing(false);
      return;
    }

    const formatter = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Indiana/Indianapolis",
    });
    setReceiptTime(formatter.format(new Date()));
    setReviewing(false);
    setStatus("Prototype receipt created. No server submission has occurred yet.");
  };

  return (
    <main className="app-shell">
      <aside className="side-nav" aria-label="Primary navigation">
        <button className="brand-home" type="button" onClick={() => setView("home")} aria-label="Any Given Pick home">
          <BrandLockup />
        </button>
        <div className="nav-list">
          {navItems.map((item) => (
            <button
              className={`nav-item${view === item.view ? " nav-item--active" : ""}`}
              key={item.view}
              type="button"
              onClick={() => setView(item.view)}
              aria-current={view === item.view ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <AccountDock account={account} compact />
      </aside>

      <section className="surface">
        <div className="surface-account"><AccountDock account={account} /></div>
        <button className="mobile-brand" type="button" onClick={() => setView("home")} aria-label="Any Given Pick home">
          <BrandLockup />
        </button>
        {view === "picks" && (
          <PicksView
            picks={picks}
            selectedCount={selectedCount}
            mondayTotal={mondayTotal}
            status={status}
            reviewing={reviewing}
            receiptTime={receiptTime}
            firstMissingId={firstMissingId}
            firstMissingRef={firstMissingRef}
            onChoose={chooseTeam}
            onMondayTotal={setMondayTotal}
            onReview={beginReview}
            onReceipt={createReceipt}
            account={account}
            onEdit={() => { setReviewing(false); setReceiptTime(null); setStatus("Edit mode restored. Your draft remains saved."); }}
          />
        )}
        {view === "home" && (
          <HomeView selectedCount={selectedCount} onContinue={() => setView("picks")} account={account} />
        )}
        {view === "standings" && <StandingsView />}
        {view === "groups" && <GroupsView />}
        {view === "profile" && <ProfileView selectedTeams={selectedTeams} account={account} />}
      </section>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {navItems.filter((item) => item.view !== "groups").map((item) => (
          <button
            className={`bottom-nav__item${view === item.view ? " bottom-nav__item--active" : ""}`}
            key={item.view}
            type="button"
            onClick={() => setView(item.view)}
            aria-current={view === item.view ? "page" : undefined}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}

type PicksViewProps = {
  picks: Picks;
  selectedCount: number;
  mondayTotal: number;
  status: string;
  reviewing: boolean;
  receiptTime: string | null;
  firstMissingId?: string;
  firstMissingRef: React.RefObject<HTMLDivElement | null>;
  onChoose: (gameId: string, abbreviation: string) => void;
  onMondayTotal: (value: number) => void;
  onReview: () => void;
  onReceipt: () => void;
  onEdit: () => void;
  account: AccountSummary | null;
};

function PicksView(props: PicksViewProps) {
  return (
    <div className="picks-layout">
      <section className="pick-sheet" aria-labelledby="picks-title">
        <header className="pick-header">
          <RouteSketch />
          <RouteSketch mirrored />
          <p className="week-label">Week 1 Pick&apos;em</p>
          <h1 id="picks-title">Make your picks</h1>
          <div className="deadline-marker">
            <Icon name="clock" />
            <span>Target lock · Wed · 6:00 PM ET</span>
          </div>
          <div className="eligibility-line">
            <Icon name="shield" />
            <span>{props.account?.reasonLabel ?? "Sign in to verify eligibility"}</span>
          </div>
        </header>

        <ProgressMeasure selected={props.selectedCount} total={games.length} />

        <div className="matchup-list" aria-label="Weekly matchups">
          {games.map((game) => {
            const selected = props.picks[game.id];
            const missing = !selected;
            return (
              <div
                className={`matchup${missing ? " matchup--missing" : ""}`}
                key={game.id}
                ref={game.id === props.firstMissingId ? props.firstMissingRef : undefined}
              >
                <div className="matchup-time"><span>{game.day}</span><span>{game.time}</span></div>
                <button
                  className={`team-choice${selected === game.away.abbreviation ? " team-choice--selected" : ""}`}
                  type="button"
                  onClick={() => props.onChoose(game.id, game.away.abbreviation)}
                  aria-pressed={selected === game.away.abbreviation}
                  aria-label={`Pick ${game.away.city}`}
                >
                  {selected === game.away.abbreviation && <Icon name="check" />}
                  <span>{game.away.abbreviation}</span>
                  <small>{game.away.city}</small>
                </button>
                <span className="at-mark" aria-hidden="true">@</span>
                <button
                  className={`team-choice${selected === game.home.abbreviation ? " team-choice--selected" : ""}`}
                  type="button"
                  onClick={() => props.onChoose(game.id, game.home.abbreviation)}
                  aria-pressed={selected === game.home.abbreviation}
                  aria-label={`Pick ${game.home.city}`}
                >
                  {selected === game.home.abbreviation && <Icon name="check" />}
                  <span>{game.home.abbreviation}</span>
                  <small>{game.home.city}</small>
                </button>
              </div>
            );
          })}
        </div>

        <p className="prototype-note">Prototype schedule · official games will come from the selected sports-data provider.</p>
      </section>

      <aside className="game-panel" aria-label="Entry controls">
        <div className="desktop-progress"><ProgressMeasure selected={props.selectedCount} total={games.length} /></div>
        <MondayTotal value={props.mondayTotal} onChange={props.onMondayTotal} />
        <div className="rules-note">
          <RouteSketch mirrored />
          <h2>How this week works</h2>
          <ul>
            <li>Pick one team in each matchup.</li>
            <li>Each correct pick counts as one point.</li>
            <li>Monday Total breaks a tie.</li>
            <li>Production entries will lock at the deadline.</li>
          </ul>
        </div>

        {props.receiptTime ? (
          <Receipt time={props.receiptTime} picks={props.picks} mondayTotal={props.mondayTotal} onEdit={props.onEdit} />
        ) : props.reviewing ? (
          <ReviewPanel
            picks={props.picks}
            mondayTotal={props.mondayTotal}
            onReceipt={props.onReceipt}
            onEdit={props.onEdit}
            account={props.account}
          />
        ) : (
          <button className="review-action" type="button" onClick={props.onReview}>
            <Icon name="whistle" />
            <span>Review 8 picks</span>
            <Icon name="arrow" />
          </button>
        )}
        <p className="status-message" aria-live="polite">{props.status || "Draft changes save automatically on this device."}</p>
      </aside>
    </div>
  );
}

function ProgressMeasure({ selected, total }: { selected: number; total: number }) {
  const percent = Math.round((selected / total) * 100);
  return (
    <div className="progress-measure" aria-label={`${selected} of ${total} picks selected`}>
      <div className="progress-copy"><strong>{selected}</strong><span>of {total} selected</span></div>
      <div className="yard-scale" aria-hidden="true">
        <span className="yard-fill" style={{ transform: `scaleX(${percent / 100})` }} />
        {Array.from({ length: total + 1 }, (_, index) => <i key={index} />)}
      </div>
      <div className="scale-labels" aria-hidden="true"><span>0</span><span>4</span><span>8</span></div>
    </div>
  );
}

function MondayTotal({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="monday-total">
      <div className="drill-tag"><span>2-min</span><span>drill</span></div>
      <label htmlFor="monday-total">Monday <strong>Total</strong></label>
      <div className="number-control">
        <button type="button" onClick={() => onChange(value + 1)} aria-label="Increase Monday total">+</button>
        <input
          id="monday-total"
          min="0"
          step="1"
          inputMode="numeric"
          type="number"
          value={value}
          onChange={(event) => {
            const nextValue = Number.parseInt(event.target.value, 10);
            onChange(Number.isFinite(nextValue) ? Math.max(0, nextValue) : 0);
          }}
        />
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label="Decrease Monday total">−</button>
      </div>
    </div>
  );
}

function ReviewPanel({
  picks,
  mondayTotal,
  onReceipt,
  onEdit,
  account,
}: {
  picks: Picks;
  mondayTotal: number;
  onReceipt: () => void;
  onEdit: () => void;
  account: AccountSummary | null;
}) {
  const canParticipate = account?.overallResult === "eligible";
  return (
    <section className="review-panel" aria-labelledby="review-title">
      <h2 id="review-title">Review your entry</h2>
      <div className="review-grid">
        {games.map((game) => <span key={game.id}>{picks[game.id]}</span>)}
      </div>
      <p>Monday Total <strong>{mondayTotal}</strong></p>
      <button className="commit-action" type="button" onClick={onReceipt} disabled={!canParticipate}>
        {canParticipate ? "Create prototype receipt" : "Eligibility required"}
      </button>
      {!canParticipate && (
        <Link className="text-action text-action--link" href={account ? "/profile" : "/sign-in"}>
          {account?.reasonLabel ?? "Sign in to participate"}
        </Link>
      )}
      <button className="text-action" type="button" onClick={onEdit}>Back to picks</button>
    </section>
  );
}

function Receipt({ time, picks, mondayTotal, onEdit }: { time: string; picks: Picks; mondayTotal: number; onEdit: () => void }) {
  return (
    <section className="receipt" aria-labelledby="receipt-title">
      <Icon name="check" />
      <h2 id="receipt-title">Prototype receipt</h2>
      <p>{Object.values(picks).join(" · ")}</p>
      <p>Monday Total <strong>{mondayTotal}</strong></p>
      <time>{time} ET</time>
      <small>No contest entry was submitted. Pick submission is a later milestone.</small>
      <button className="text-action" type="button" onClick={onEdit}>Edit draft</button>
    </section>
  );
}

function HomeView({
  selectedCount,
  onContinue,
  account,
}: {
  selectedCount: number;
  onContinue: () => void;
  account: AccountSummary | null;
}) {
  return (
    <section className="single-view home-view">
      <RouteSketch /><RouteSketch mirrored />
      <p className="week-label">Week 1 Pick&apos;em</p>
      <h1>One sheet. Eight calls.</h1>
      <p className="lead">Finish your prototype entry before the planned Wednesday deadline.</p>
      <div className="home-status">
        <Icon name="shield" />
        <span>{account?.reasonLabel ?? "Sign in to verify eligibility"}</span>
        <strong>{selectedCount}/8 picks</strong>
      </div>
      <button className="review-action" type="button" onClick={onContinue}>
        <span>{selectedCount ? "Continue your picks" : "Make your picks"}</span>
        <Icon name="arrow" />
      </button>
    </section>
  );
}

function StandingsView() {
  return (
    <section className="single-view standings-view">
      <p className="week-label">Sample standings</p>
      <h1>Week 1 board</h1>
      <p className="lead">Picks reveal after the deadline. This sample shows the planned ranking treatment.</p>
      <div className="standings-table" role="table" aria-label="Sample Week 1 standings">
        <div className="standings-row standings-row--header" role="row"><span>Rank</span><span>Player</span><span>Correct</span><span>TB diff</span></div>
        {standings.map((entry) => (
          <div className={`standings-row${entry.name === "Your entry" ? " standings-row--you" : ""}`} role="row" key={entry.rank}>
            <strong>{entry.rank}</strong><span>{entry.name}</span><span>{entry.correct}</span><span>{entry.delta}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function GroupsView() {
  return (
    <section className="single-view groups-view">
      <p className="week-label">Private groups</p>
      <h1>Your locker room</h1>
      <p className="lead">Private groups are admin-created and keep their entries, rules and standings separate from the public contest.</p>
      <div className="empty-state"><Icon name="groups" /><h2>No group invitations yet</h2><p>An accepted invitation will appear here with its own weekly call sheet.</p></div>
    </section>
  );
}

function ProfileView({
  selectedTeams,
  account,
}: {
  selectedTeams: string[];
  account: AccountSummary | null;
}) {
  if (!account) {
    return (
      <section className="single-view profile-view">
        <p className="week-label">Profile & access</p>
        <h1>Join the roster</h1>
        <p className="lead">Sign in with email and password or Google to create one player account.</p>
        <div className="profile-actions">
          <Link className="review-action" href="/sign-up">Create account</Link>
          <Link className="text-link" href="/sign-in">Already have an account? Sign in</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="single-view profile-view">
      <p className="week-label">Profile & access</p>
      <h1>{account.displayName ?? "Finish your player card"}</h1>
      <div className="access-lines">
        <div><Icon name="shield" /><span>Indiana location</span><strong>{account.locationResult === "in_state" ? "Cleared" : "Open"}</strong></div>
        <div><Icon name="check" /><span>Age requirement</span><strong>{account.ageEligible ? "Cleared" : "Open"}</strong></div>
        <div><Icon name="profile" /><span>Verified sign-in</span><strong>{account.verifiedAuth ? "Cleared" : "Open"}</strong></div>
        <div><Icon name="picks" /><span>Draft selections</span><strong>{selectedTeams.length}/8</strong></div>
      </div>
      <p className="prototype-note">{account.reasonLabel}. Eligibility evidence is evaluated on the server.</p>
      <Link className="review-action" href="/profile">Open player card</Link>
    </section>
  );
}

function AccountDock({
  account,
  compact = false,
}: {
  account: AccountSummary | null;
  compact?: boolean;
}) {
  if (!account) {
    return (
      <div className={`account-dock${compact ? " account-dock--compact" : ""}`}>
        <Link href="/sign-in">Sign in</Link>
        <Link href="/sign-up" className="account-dock__primary">Join</Link>
      </div>
    );
  }

  return (
    <div className={`account-dock${compact ? " account-dock--compact" : ""}`}>
      <UserButton />
      <Link href="/profile">
        <span>{account.displayName ?? "Player card"}</span>
        <small>{account.overallResult === "eligible" ? "Eligible" : "Read-only"}</small>
      </Link>
    </div>
  );
}
