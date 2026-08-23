"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveEntryDraft, submitEntry } from "@/app/entry-actions";
import type { AccountSummary } from "@/lib/account-types";
import { draftPayloadSignature, sanitizeDraftPicks } from "@/lib/entries/rules";
import { unscopedDraftStorageKeys, userDraftStorageKey } from "@/lib/entries/draft-storage";
import type { LivePlayerPicks, PlayerGame, PlayerWeek } from "@/lib/entries/types";
import { getHomeWeekState } from "@/lib/home-week-state";
import type { StandingsSnapshot } from "@/lib/standings/types";
import { BrandLockup } from "./brand-lockup";
import { DeadlineCountdown } from "./deadline-countdown";
import { Icon, type IconName, RouteSketch } from "./icons";
import { MobileAppNav } from "./mobile-app-nav";
import { PwaInstallHomeCard } from "./pwa-install-experience";
import { PlayerAvatar } from "./player-avatar";

type View = "home" | "picks" | "standings";
type Picks = Record<string, string>;
type ReceiptData = {
  versionNumber: number;
  committedAt: string;
  action: "submit" | "edit";
};
type DraftSyncState = {
  state: "idle" | "local" | "syncing" | "synced" | "error";
  syncedAt: string | null;
};
type LivePicksFeedState = "live" | "refreshing" | "stale";
type MobileAlertState = {
  message: string;
  tone: "warning" | "error";
} | null;

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

function hasParticipationAccess(account: AccountSummary): boolean {
  return account.overallResult === "eligible";
}

function eligibilityActionLabel(account: AccountSummary): string {
  if (!account.profileComplete) return "Finish your player card";
  return "Review your player access";
}

function eligibilityStatusLabel(account: AccountSummary): string {
  return account.reasonLabel;
}

function formatMoneyline(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function formatOddsUpdate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Indiana/Indianapolis",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

const navItems: { view: View; label: string; icon: IconName }[] = [
  { view: "home", label: "Home", icon: "home" },
  { view: "picks", label: "Picks", icon: "picks" },
  { view: "standings", label: "Standings", icon: "standings" },
];

const viewHrefs: Record<View, string> = {
  home: "/",
  picks: "/picks",
  standings: "/standings",
};

function viewFromCurrentUrl(): View {
  if (window.location.pathname === "/picks") return "picks";
  if (window.location.pathname === "/standings") return "standings";
  const candidate = new URLSearchParams(window.location.search).get("view");
  return candidate === "picks" || candidate === "standings"
    ? candidate
    : "home";
}

export function PickemApp({
  account,
  week,
  isAdmin,
  draftOwnerId,
  standings,
  initialView,
}: {
  account: AccountSummary;
  week: PlayerWeek | null;
  isAdmin: boolean;
  draftOwnerId: string;
  standings: StandingsSnapshot | null;
  initialView: "home" | "picks" | "standings";
}) {
  const [view, setView] = useState<View>(initialView);
  const [picks, setPicks] = useState<Picks>(() =>
    picksForCurrentSlate(week?.games ?? [], week?.entry?.draftPicks ?? {}),
  );
  const [mondayTotal, setMondayTotal] = useState<number | null>(() => week?.entry?.mondayPrediction ?? null);
  const [liveAccount, setLiveAccount] = useState(account);
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
  const [draftSync, setDraftSync] = useState<DraftSyncState>({
    state: week?.entry ? "synced" : "idle",
    syncedAt: week?.entry?.updatedAt ?? null,
  });
  const [draftRetryVersion, setDraftRetryVersion] = useState(0);
  const [livePlayerPicks, setLivePlayerPicks] = useState<LivePlayerPicks[]>(() => week?.livePlayerPicks ?? []);
  const [livePicksFeedState, setLivePicksFeedState] = useState<LivePicksFeedState>("live");
  const [deadlineLockedWeekId, setDeadlineLockedWeekId] = useState<string | null>(
    week?.isLocked ? week.id : null,
  );
  const [mobileAlert, setMobileAlert] = useState<MobileAlertState>(null);
  const [isPending, startTransition] = useTransition();
  const firstMissingRef = useRef<HTMLFieldSetElement | null>(null);
  const lastSavedSignatureRef = useRef("");
  const currentDraftSignatureRef = useRef("");
  const draftSaveInFlightRef = useRef(false);
  const draftSaveQueuedRef = useRef(false);

  const draftStorageKey = week ? userDraftStorageKey(draftOwnerId, week.id) : null;
  const activeWeekId = week?.id ?? null;
  const games = week?.games ?? [];
  const canParticipate = hasParticipationAccess(liveAccount);
  const isLocked = (week?.isLocked ?? true) || deadlineLockedWeekId === activeWeekId;

  const selectView = (nextView: View) => {
    if (nextView !== view) {
      window.history.pushState(null, "", viewHrefs[nextView]);
      setView(nextView);
    }
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  };

  useEffect(() => {
    const syncViewFromHistory = () => {
      setView(viewFromCurrentUrl());
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
    };
    window.addEventListener("popstate", syncViewFromHistory);
    return () => window.removeEventListener("popstate", syncViewFromHistory);
  }, []);

  useEffect(() => {
    if (!activeWeekId || view !== "picks" || isLocked) return;
    let active = true;

    const refreshLivePicks = async () => {
      if (document.visibilityState === "hidden") return;
      setLivePicksFeedState("refreshing");
      try {
        const response = await fetch(`/api/picks/live?weekId=${encodeURIComponent(activeWeekId)}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("LIVE_PICKS_REFRESH_FAILED");
        const body = await response.json() as { players: LivePlayerPicks[] };
        if (!active) return;
        setLivePlayerPicks(body.players);
        setLivePicksFeedState("live");
      } catch {
        if (active) setLivePicksFeedState("stale");
      }
    };

    const interval = window.setInterval(() => void refreshLivePicks(), 12_000);
    const resumeRefresh = () => {
      if (document.visibilityState === "visible") void refreshLivePicks();
    };
    void refreshLivePicks();
    document.addEventListener("visibilitychange", resumeRefresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", resumeRefresh);
    };
  }, [activeWeekId, isLocked, view]);

  useEffect(() => {
    const retryAfterReconnect = () => {
      if (currentDraftSignatureRef.current === lastSavedSignatureRef.current) return;
      setStatus("Connection restored. Retrying your saved draft…");
      setDraftRetryVersion((version) => version + 1);
    };
    window.addEventListener("online", retryAfterReconnect);
    return () => window.removeEventListener("online", retryAfterReconnect);
  }, []);

  useEffect(() => {
    const focusTarget = receipt ? "receipt-title" : reviewing ? "review-title" : null;
    if (!focusTarget) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(focusTarget)?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [receipt, reviewing]);

  async function refreshEligibility(): Promise<AccountSummary> {
    const response = await fetch("/api/eligibility", { cache: "no-store" });
    if (!response.ok) throw new Error("ELIGIBILITY_REFRESH_FAILED");
    const body = await response.json() as { account: AccountSummary };
    setLiveAccount(body.account);
    return body.account;
  }

  useEffect(() => {
    if (!week || !draftStorageKey) {
      return;
    }

    let stored: string | null = null;
    try {
      for (const legacyKey of unscopedDraftStorageKeys(week.id)) {
        window.localStorage.removeItem(legacyKey);
      }
      stored = window.localStorage.getItem(draftStorageKey);
    } catch {
      // Server-backed drafts still work when browser storage is unavailable.
    }
    const serverVersion = week.entry?.currentVersionNumber ?? 0;
    const frame = window.requestAnimationFrame(() => {
      try {
        if (stored) {
          const draft = JSON.parse(stored) as {
            picks?: Picks;
            mondayTotal?: number | null;
            baseVersion?: number;
          };
          if ((draft.baseVersion ?? 0) >= serverVersion) {
            if (draft.picks) setPicks(picksForCurrentSlate(week.games, draft.picks));
            if (draft.mondayTotal === null || Number.isInteger(draft.mondayTotal)) setMondayTotal(draft.mondayTotal ?? null);
          }
        }
      } catch {
        window.localStorage.removeItem(draftStorageKey);
      } finally {
        lastSavedSignatureRef.current = signatureForDraft(
          week.games,
          week.entry?.draftPicks ?? {},
          week.entry?.mondayPrediction ?? null,
        );
        currentDraftSignatureRef.current = lastSavedSignatureRef.current;
        setDraftReady(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draftStorageKey, week]);

  useEffect(() => {
    if (!draftReady || !draftStorageKey || !week) return;
    try {
      window.localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          picks,
          mondayTotal,
          baseVersion: week.entry?.currentVersionNumber ?? 0,
        }),
      );
    } catch {
      // Autosave to the server remains the source of truth.
    }

    const signature = signatureForDraft(week.games, picks, mondayTotal);
    currentDraftSignatureRef.current = signature;
    if (!canParticipate || isLocked || signature === lastSavedSignatureRef.current) return;
    setDraftSync((current) => ({ ...current, state: "local" }));

    if (!navigator.onLine) {
      const frame = window.requestAnimationFrame(() => {
        setStatus("Saved on this device. Reconnect to sync this draft securely.");
      });
      return () => window.cancelAnimationFrame(frame);
    }

    const timer = window.setTimeout(() => {
      if (draftSaveInFlightRef.current) {
        draftSaveQueuedRef.current = true;
        setStatus("Your newest changes are saved on this device and waiting to sync.");
        return;
      }
      draftSaveInFlightRef.current = true;
      setDraftSync((current) => ({ ...current, state: "syncing" }));
      setStatus("Syncing draft…");
      void (async () => {
        try {
          const result = await saveEntryDraft({
            weekId: week.id,
            picks,
            mondayPrediction: mondayTotal,
          });
          if (result.ok) {
            lastSavedSignatureRef.current = signature;
            setMobileAlert(null);
            const newerChangesAreWaiting = currentDraftSignatureRef.current !== signature;
            setDraftSync({
              state: newerChangesAreWaiting ? "local" : "synced",
              syncedAt: result.syncedAt ?? new Date().toISOString(),
            });
            setStatus(newerChangesAreWaiting
              ? "Earlier changes synced. Your newest changes are saved on this device and waiting to sync."
              : result.message);
          } else if (result.code === "invalid_pick") {
            const currentPicks = picksForCurrentSlate(week.games, picks);
            if (JSON.stringify(currentPicks) !== JSON.stringify(picks)) {
              setPicks(currentPicks);
              setDraftSync((current) => ({ ...current, state: "local" }));
              setStatus("The schedule changed. Your valid picks were kept and the draft is syncing again.");
              return;
            }
          }
          if (!result.ok) {
            if (result.code === "deadline_passed") {
              setDeadlineLockedWeekId(activeWeekId);
              setReviewing(false);
            } else {
              setMobileAlert({
                message: result.message,
                tone: result.code === "rate_limited" ? "warning" : "error",
              });
            }
            setDraftSync((current) => ({ ...current, state: "error" }));
            setStatus(result.message);
          }
        } catch {
          setDraftSync((current) => ({ ...current, state: "error" }));
          const message = "This draft is saved on your device but has not reached the server. Retry when your connection is stable.";
          setStatus(message);
          setMobileAlert({ message, tone: "error" });
        } finally {
          draftSaveInFlightRef.current = false;
          if (draftSaveQueuedRef.current) {
            draftSaveQueuedRef.current = false;
            setDraftRetryVersion((version) => version + 1);
          }
        }
      })();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [activeWeekId, canParticipate, draftReady, draftRetryVersion, draftStorageKey, isLocked, mondayTotal, picks, week]);

  if (!week) {
    const emptyContent = view === "standings" && standings ? (
      <StandingsView standings={standings} currentUserId={draftOwnerId} />
    ) : (
      <section className="single-view no-week-view">
        <RouteSketch /><RouteSketch mirrored />
        <p className="week-label">Coach&apos;s call sheet</p>
        <h1>{view === "picks" ? "No picks are open." : "The next slate is being drawn up."}</h1>
        <p className="lead">There is no published week yet. Once the commissioner publishes one, the official matchups will appear here automatically.</p>
        <div className="empty-state"><Icon name="picks" /><h2>Check back soon</h2><p>Your player account is ready for kickoff.</p></div>
        <PwaInstallHomeCard />
      </section>
    );
    return (
      <AppFrame view={view} setView={selectView} account={account} isAdmin={isAdmin}>
        {emptyContent}
      </AppFrame>
    );
  }

  const selectedCount = games.filter((game) => Boolean(picks[game.id])).length;
  const missingCount = games.length - selectedCount;
  const firstMissingId = games.find((game) => !picks[game.id])?.id;
  const isComplete = selectedCount === games.length && mondayTotal !== null && Number.isInteger(mondayTotal) && mondayTotal >= 0;

  const chooseTeam = (gameId: string, abbreviation: string) => {
    if (isLocked) return;
    if (!canParticipate) {
      setStatus(`${eligibilityStatusLabel(liveAccount)}. Complete eligibility before making picks.`);
      return;
    }
    setPicks((current) => ({ ...current, [gameId]: abbreviation }));
    setDraftSync((current) => ({ ...current, state: "local" }));
    setMobileAlert(null);
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
      if (missingCount > 0) {
        setStatus(`${missingCount} ${missingCount === 1 ? "pick is" : "picks are"} still missing. Choose one team in every matchup.`);
        window.setTimeout(() => firstMissingRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      } else {
        setStatus("Enter your own tiebreaker total before reviewing the card.");
        window.setTimeout(() => document.getElementById("monday-total")?.focus(), 50);
      }
      return;
    }
    if (!canParticipate) {
      setStatus(`${eligibilityStatusLabel(liveAccount)}. Complete account setup before reviewing this card.`);
      return;
    }
    setReviewing(true);
    setStatus("Review every selection before submitting your official entry.");
  };

  const commitEntry = () => {
    if (!canParticipate) {
      setStatus(`${eligibilityStatusLabel(liveAccount)}. Review your player access before submitting; your selections are preserved.`);
      return;
    }
    if (isLocked) {
      setStatus("The entry deadline has passed.");
      return;
    }

    startTransition(async () => {
      try {
        setStatus("Confirming account access before submission…");
        const currentAccount = await refreshEligibility();
        if (!hasParticipationAccess(currentAccount)) {
          setStatus(`${currentAccount.reasonLabel}. Review your player access and return to submit; your selections are preserved.`);
          return;
        }

        setStatus("Sending your official entry…");
        const result = await submitEntry({
          weekId: week.id,
          picks,
          mondayPrediction: mondayTotal,
          submissionKey: crypto.randomUUID(),
        });
        setStatus(result.message);
        if (result.ok && result.receipt) {
          setMobileAlert(null);
          setReceipt(result.receipt);
          setReviewing(false);
          lastSavedSignatureRef.current = signatureForDraft(week.games, picks, mondayTotal);
          setDraftSync({ state: "synced", syncedAt: result.receipt.committedAt });
          if (draftStorageKey) window.localStorage.removeItem(draftStorageKey);
        } else {
          if (result.code === "deadline_passed") {
            setDeadlineLockedWeekId(activeWeekId);
            setReviewing(false);
          } else {
            setMobileAlert({
              message: result.message,
              tone: result.code === "rate_limited" ? "warning" : "error",
            });
          }
          if (result.code === "ineligible") {
            await refreshEligibility().catch(() => undefined);
          }
        }
      } catch {
        const message = "Your entry was not submitted. Check your connection and try again; your selections are preserved.";
        setStatus(message);
        setMobileAlert({ message, tone: "error" });
      }
    });
  };

  const handleDeadlineLock = () => {
    setDeadlineLockedWeekId(week.id);
    setReviewing(false);
    setMobileAlert(null);
    setStatus(
      (week.entry?.currentVersionNumber ?? 0) > 0
        ? "Deadline reached. Your latest submitted card is official."
        : "Deadline reached. Picks are locked for this week.",
    );
  };

  return (
    <AppFrame view={view} setView={selectView} account={liveAccount} isAdmin={isAdmin}>
      {view === "picks" && (
        <PicksView
          week={week}
          games={games}
          picks={picks}
          selectedCount={selectedCount}
          mondayTotal={mondayTotal}
          status={status}
          mobileAlert={mobileAlert}
          draftSync={draftSync}
          reviewing={reviewing}
          receipt={receipt}
          firstMissingId={firstMissingId}
          firstMissingRef={firstMissingRef}
          onChoose={chooseTeam}
          onMondayTotal={(value) => {
            setMondayTotal(value);
            setDraftSync((current) => ({ ...current, state: "local" }));
          }}
          onReview={beginReview}
          onReceipt={commitEntry}
          account={liveAccount}
          canParticipate={canParticipate}
          isPending={isPending}
          isLocked={isLocked}
          onDeadlineLock={handleDeadlineLock}
          hasSubmitted={(week.entry?.currentVersionNumber ?? 0) > 0}
          onRetryDraft={() => {
            setDraftSync((current) => ({ ...current, state: "local" }));
            setStatus("Retrying your saved draft…");
            setMobileAlert({ message: "Retrying your saved draft…", tone: "warning" });
            setDraftRetryVersion((version) => version + 1);
          }}
          onDismissMobileAlert={() => setMobileAlert(null)}
          onEdit={() => { setReviewing(false); setReceipt(null); setStatus("Edit mode restored. Submit again to make changes official."); }}
          currentUserId={draftOwnerId}
          livePlayerPicks={livePlayerPicks}
          livePicksFeedState={livePicksFeedState}
        />
      )}
      {view === "home" && <HomeView week={week} selectedCount={selectedCount} onContinue={() => selectView("picks")} account={liveAccount} canParticipate={canParticipate} hasSubmitted={(week.entry?.currentVersionNumber ?? 0) > 0} />}
      {view === "standings" && standings ? <StandingsView standings={standings} currentUserId={draftOwnerId} /> : null}
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
          {navItems.map((item) => item.view === "standings" ? (
            <Link
              className={`nav-item nav-item--link${view === item.view ? " nav-item--active" : ""}`}
              href={viewHrefs[item.view]}
              key={item.view}
              prefetch={false}
              aria-current={view === item.view ? "page" : undefined}
            >
              <Icon name={item.icon} /><span>{item.label}</span>
            </Link>
          ) : (
            <button className={`nav-item${view === item.view ? " nav-item--active" : ""}`} key={item.view} type="button" onClick={() => setView(item.view)} aria-current={view === item.view ? "page" : undefined}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </button>
          ))}
          <Link className="nav-item nav-item--link" href="/profile" prefetch={false}>
            <Icon name="profile" /><span>Profile</span>
          </Link>
          <Link className="nav-item nav-item--link" href="/activity" prefetch={false}>
            <Icon name="activity" /><span>My activity</span>
          </Link>
          <Link className="nav-item nav-item--link" href="/results" prefetch={false}>
            <Icon name="results" /><span>Results</span>
          </Link>
          {isAdmin && (
            <Link className="nav-item nav-item--link" href="/admin" prefetch={false}>
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
      <MobileAppNav
        active={view === "standings" ? "results" : view}
        isAdmin={isAdmin}
        onSelectView={setView}
      />
    </main>
  );
}

type PicksViewProps = {
  week: PlayerWeek;
  games: PlayerGame[];
  picks: Picks;
  selectedCount: number;
  mondayTotal: number | null;
  status: string;
  mobileAlert: MobileAlertState;
  draftSync: DraftSyncState;
  reviewing: boolean;
  receipt: ReceiptData | null;
  firstMissingId?: string;
  firstMissingRef: React.RefObject<HTMLFieldSetElement | null>;
  onChoose: (gameId: string, abbreviation: string) => void;
  onMondayTotal: (value: number | null) => void;
  onReview: () => void;
  onReceipt: () => void;
  onEdit: () => void;
  account: AccountSummary;
  canParticipate: boolean;
  isPending: boolean;
  isLocked: boolean;
  onDeadlineLock: () => void;
  hasSubmitted: boolean;
  onRetryDraft: () => void;
  onDismissMobileAlert: () => void;
  currentUserId: string;
  livePlayerPicks: LivePlayerPicks[];
  livePicksFeedState: LivePicksFeedState;
};

function savedPickCount(games: PlayerGame[], picks: Picks): number {
  return games.filter((game) => (
    picks[game.id] === game.away.abbreviation || picks[game.id] === game.home.abbreviation
  )).length;
}

function PicksView(props: PicksViewProps) {
  const tiebreakerLabel = props.week.seasonPhase === "preseason" ? "Tiebreaker" : "Monday";
  const oddsProviders = Array.from(new Set(
    props.games.flatMap((game) => game.odds?.provider ? [game.odds.provider] : []),
  ));
  const latestOddsUpdate = props.games.reduce<string | null>((latest, game) => {
    if (!game.odds) return latest;
    if (!latest || new Date(game.odds.updatedAt).getTime() > new Date(latest).getTime()) {
      return game.odds.updatedAt;
    }
    return latest;
  }, null);
  const otherPlayers = props.livePlayerPicks.filter((player) => player.userId !== props.currentUserId);
  const missingCount = props.games.length - props.selectedCount;
  return (
    <div className={`picks-layout${props.isLocked ? " picks-layout--locked" : ""}`}>
      <section className="pick-sheet" aria-labelledby="picks-title">
        <header className="pick-header">
          <RouteSketch /><RouteSketch mirrored />
          <p className="week-label">{props.week.label} Pick&apos;em</p>
          <h1 id="picks-title">{props.isLocked ? "Calls are locked" : "Make your picks"}</h1>
          <div className={`deadline-marker${props.isLocked ? " deadline-marker--locked" : ""}`}>
            <Icon name="clock" />
            <span className="deadline-marker__copy">
              <strong>{props.isLocked ? "Locked" : "Locks"} · {props.week.deadlineLabel}</strong>
              {!props.isLocked ? (
                <DeadlineCountdown
                  deadline={props.week.entryDeadline}
                  fallbackLabel={props.week.deadlineLabel}
                  onLock={props.onDeadlineLock}
                />
              ) : null}
            </span>
          </div>
          <div className="eligibility-line"><Icon name="shield" /><span>{eligibilityStatusLabel(props.account)}</span></div>
          {!props.canParticipate && !props.isLocked ? (
            <Link className="eligibility-action" href="/profile">{eligibilityActionLabel(props.account)}</Link>
          ) : null}
        </header>

        {props.isLocked ? (
          <LockedResultsHandoff hasSubmitted={props.hasSubmitted} />
        ) : (
          <>
            <ProgressMeasure selected={props.selectedCount} total={props.games.length} tiebreakerSet={props.mondayTotal !== null} />

            <div className="scoreboard-toolbar">
          <p>Your highlighted row is editable. Every active player&apos;s saved calls appear below.</p>
          <span className={`scoreboard-live-state scoreboard-live-state--${props.livePicksFeedState}`} aria-live="polite">
            {props.livePicksFeedState === "refreshing" ? "Refreshing…" : props.livePicksFeedState === "stale" ? "Refresh paused" : "Live board"}
          </span>
        </div>

        <div className="scoreboard-scroll" role="region" aria-label="Live player picks scoreboard" tabIndex={0}>
          <table className="scoreboard-entry-table">
            <caption className="sr-only">Make your picks in the first row and compare them with other active players&apos; saved picks.</caption>
            <thead>
              <tr>
                <th className="scoreboard-player-column" scope="col">Player</th>
                {props.games.map((game) => {
                  const mondayTotal = props.week.seasonPhase === "regular" && game.isMondayTiebreaker
                    ? game.odds?.overUnder ?? null
                    : null;
                  return (
                    <th scope="col" key={game.id}>
                      <strong>{game.away.abbreviation} @ {game.home.abbreviation}</strong>
                      <span>{game.day} · {game.time}</span>
                      {game.odds ? (
                        <span className="scoreboard-odds">
                          <b>{game.away.abbreviation} {game.odds.awayMoneyline === null ? "—" : formatMoneyline(game.odds.awayMoneyline)}</b>
                          <b>{game.home.abbreviation} {game.odds.homeMoneyline === null ? "—" : formatMoneyline(game.odds.homeMoneyline)}</b>
                          {mondayTotal !== null ? <em>O/U {mondayTotal}</em> : null}
                        </span>
                      ) : <span className="scoreboard-odds scoreboard-odds--empty">Odds pending</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr className="scoreboard-your-row">
                <th className="scoreboard-player-column" scope="row">
                  <strong>{props.account.displayName ?? "Your picks"}</strong>
                  <span>You · {props.selectedCount}/{props.games.length} picked</span>
                </th>
                {props.games.map((game) => {
                  const selected = props.picks[game.id];
                  return (
                    <td key={game.id}>
                      <fieldset
                        id={`matchup-${game.id}`}
                        className={`scoreboard-entry-choice${selected ? "" : " scoreboard-entry-choice--missing"}`}
                        ref={game.id === props.firstMissingId ? props.firstMissingRef : undefined}
                      >
                        <legend className="sr-only">Pick {game.away.name} or {game.home.name}</legend>
                        {[game.away, game.home].map((team) => {
                          const moneyline = team.abbreviation === game.away.abbreviation
                            ? game.odds?.awayMoneyline ?? null
                            : game.odds?.homeMoneyline ?? null;
                          const isSelected = selected === team.abbreviation;
                          return (
                            <button
                              className={`scoreboard-team-choice${isSelected ? " scoreboard-team-choice--selected" : ""}`}
                              type="button"
                              key={team.abbreviation}
                              onClick={() => props.onChoose(game.id, team.abbreviation)}
                              aria-pressed={isSelected}
                              aria-label={`Pick ${team.name}${moneyline !== null ? `. Moneyline ${formatMoneyline(moneyline)}` : ""}`}
                              disabled={!props.canParticipate || props.isLocked || props.isPending}
                            >
                              {isSelected ? <Icon name="check" /> : null}
                              <span>{team.abbreviation}</span>
                              <small>{moneyline === null ? "ML —" : `ML ${formatMoneyline(moneyline)}`}</small>
                            </button>
                          );
                        })}
                      </fieldset>
                    </td>
                  );
                })}
              </tr>
              {otherPlayers.map((player) => {
                const playerPickCount = savedPickCount(props.games, player.picks);
                return (
                  <tr key={player.userId}>
                    <th className="scoreboard-player-column" scope="row">
                      <strong>{player.displayName}</strong>
                      <span>{playerPickCount}/{props.games.length} saved</span>
                    </th>
                    {props.games.map((game) => {
                      const selection = player.picks[game.id];
                      const validSelection = selection === game.away.abbreviation || selection === game.home.abbreviation;
                      return (
                        <td key={game.id}>
                          <span className={`scoreboard-saved-pick${validSelection ? " scoreboard-saved-pick--selected" : ""}`}>
                            {validSelection ? selection : "—"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
            </div>
            <p className="prototype-note">
              Official commissioner-published slate · kickoff times shown in Eastern Time.
              {oddsProviders.length > 0 && latestOddsUpdate ? ` Moneylines and Monday O/U are informational reference lines from ${oddsProviders.join(" / ")} via ESPN; they may change and never affect scoring. Latest line update ${formatOddsUpdate(latestOddsUpdate)}.` : ""}
            </p>
          </>
        )}
      </section>

      <aside className="game-panel" aria-label="Entry controls">
        {props.isLocked ? (
          <LockedControlPanel hasSubmitted={props.hasSubmitted} />
        ) : (
          <>
            <div className="desktop-progress"><ProgressMeasure selected={props.selectedCount} total={props.games.length} tiebreakerSet={props.mondayTotal !== null} /></div>
            <MondayTotal label={tiebreakerLabel} value={props.mondayTotal} onChange={props.onMondayTotal} disabled={props.isPending} />
            <div className="rules-note">
              <RouteSketch mirrored /><h2>How this week works</h2>
              <ul><li>Pick one team in each matchup.</li><li>Each correct pick counts as one point.</li><li>{tiebreakerLabel} Total breaks a tie.</li><li>Your latest submitted version before the deadline is official.</li></ul>
            </div>

            {props.receipt ? (
              <Receipt receipt={props.receipt} games={props.games} picks={props.picks} mondayTotal={props.mondayTotal} tiebreakerLabel={tiebreakerLabel} onEdit={props.onEdit} locked={false} />
            ) : props.reviewing ? (
              <ReviewPanel games={props.games} picks={props.picks} mondayTotal={props.mondayTotal} tiebreakerLabel={tiebreakerLabel} onReceipt={props.onReceipt} onEdit={props.onEdit} account={props.account} canParticipate={props.canParticipate} isPending={props.isPending} isLocked={false} hasSubmitted={props.hasSubmitted} />
            ) : (
              <button className="review-action" type="button" onClick={props.onReview} disabled={!props.canParticipate || props.isPending}>
                <Icon name="whistle" /><span>{!props.canParticipate ? "Account setup required" : missingCount > 0 ? `Finish ${missingCount} ${missingCount === 1 ? "pick" : "picks"}` : props.mondayTotal === null ? "Set tiebreaker" : `Review ${props.games.length} picks`}</span><Icon name="arrow" />
              </button>
            )}
            <p className="status-message" aria-live="polite">{props.status || "Draft changes sync automatically."}</p>
            <div className={`draft-sync-status draft-sync-status--${props.draftSync.state}`}>
              <span aria-hidden="true" />
              <p>
                {props.draftSync.state === "synced"
                  ? "Synced securely"
                  : props.draftSync.state === "syncing"
                    ? "Syncing with the server"
                    : props.draftSync.state === "error"
                      ? "Saved on this device · Not yet synced"
                      : props.draftSync.state === "local"
                        ? "Saved on this device · Waiting to sync"
                        : "Ready for your first pick"}
              </p>
              {props.draftSync.state === "error" ? (
                <button type="button" onClick={props.onRetryDraft} disabled={!props.canParticipate}>Retry draft</button>
              ) : null}
            </div>
          </>
        )}
      </aside>
      {props.isLocked ? (
        <div className="mobile-pick-dock mobile-pick-dock--locked" role="status" aria-live="polite">
          <span><strong>Locked</strong>{props.hasSubmitted ? "Card official" : "Entry closed"}</span>
          <Link href="/results" prefetch={false}>See results <Icon name="arrow" /></Link>
        </div>
      ) : props.mobileAlert ? (
        <div
          className={`mobile-pick-dock mobile-pick-dock--alert mobile-pick-dock--${props.mobileAlert.tone}`}
          role={props.mobileAlert.tone === "error" ? "alert" : "status"}
        >
          <p>{props.mobileAlert.message}</p>
          <button
            type="button"
            onClick={props.draftSync.state === "error" ? props.onRetryDraft : props.onDismissMobileAlert}
            disabled={props.isPending}
          >
            {props.draftSync.state === "error" ? "Retry" : "Dismiss"}
          </button>
        </div>
      ) : (
        <div className="mobile-pick-dock" aria-label="Pick progress and next action">
          <span><strong>{props.selectedCount}/{props.games.length}</strong>{missingCount === 0 && props.mondayTotal === null ? "Tiebreaker needed" : "picks"}</span>
          <button type="button" onClick={props.onReview} disabled={!props.canParticipate || props.isPending}>
            {missingCount > 0 ? `Next missing (${missingCount})` : props.mondayTotal === null ? "Set tiebreaker" : "Review card"}
            <Icon name="arrow" />
          </button>
        </div>
      )}
    </div>
  );
}

function LockedResultsHandoff({ hasSubmitted }: { hasSubmitted: boolean }) {
  return (
    <section className="locked-results-handoff" aria-labelledby="locked-results-title">
      <div className="locked-results-handoff__mark"><Icon name="whistle" /></div>
      <div>
        <h2 id="locked-results-title">The board has moved to results.</h2>
        <p>
          {hasSubmitted
            ? "Your latest submitted card is official. Follow every matchup and compare the official calls as scores arrive."
            : "The deadline has passed, so this call sheet is read-only. Follow the official cards and game results from here."}
        </p>
        <div className="locked-results-handoff__actions">
          <Link className="review-action review-action--link" href="/results" prefetch={false}>
            <span>See official cards</span><Icon name="arrow" />
          </Link>
          {hasSubmitted ? <Link href="/activity" prefetch={false}>View my card</Link> : null}
        </div>
      </div>
    </section>
  );
}

function LockedControlPanel({ hasSubmitted }: { hasSubmitted: boolean }) {
  return (
    <section className="locked-control-panel">
      <Icon name="shield" />
      <h2>{hasSubmitted ? "Your card is official." : "Entry is closed."}</h2>
      <span>The Results page now carries the weekly action.</span>
      <Link href="/results" prefetch={false}>Open results <Icon name="arrow" /></Link>
    </section>
  );
}

function ProgressMeasure({ selected, total, tiebreakerSet }: { selected: number; total: number; tiebreakerSet: boolean }) {
  const percent = total ? Math.round((selected / total) * 100) : 0;
  const progressLabel = `${selected} of ${total} picks selected. Tiebreaker ${tiebreakerSet ? "set" : "still required"}.`;
  return (
    <div className="progress-measure" aria-label={progressLabel}>
      <div className="progress-copy"><strong>{selected}</strong><span>of {total} selected · TB {tiebreakerSet ? "set" : "needed"}</span></div>
      <div className="yard-scale" aria-hidden="true"><span className="yard-fill" style={{ transform: `scaleX(${percent / 100})` }} />{Array.from({ length: total + 1 }, (_, index) => <i key={index} />)}</div>
      <div className="scale-labels" aria-hidden="true"><span>0</span><span>{Math.floor(total / 2)}</span><span>{total}</span></div>
    </div>
  );
}

function MondayTotal({ label, value, onChange, disabled }: { label: string; value: number | null; onChange: (value: number | null) => void; disabled: boolean }) {
  const numericValue = value ?? 0;
  return (
    <div className="monday-total">
      <div className="drill-tag"><span>2-min</span><span>drill</span></div>
      <label htmlFor="monday-total">{label} <strong>Total</strong></label>
      <div className="number-control">
        <button type="button" onClick={() => onChange(Math.min(200, numericValue + 1))} aria-label={`Increase ${label.toLocaleLowerCase("en-US")} total`} disabled={disabled}>+</button>
        <input id="monday-total" min="0" max="200" step="1" inputMode="numeric" type="number" value={value ?? ""} placeholder="—" required aria-describedby="monday-total-help" disabled={disabled} onChange={(event) => { if (!event.target.value) { onChange(null); return; } const nextValue = Number.parseInt(event.target.value, 10); onChange(Number.isFinite(nextValue) ? Math.min(200, Math.max(0, nextValue)) : null); }} />
        <button type="button" onClick={() => onChange(Math.max(0, numericValue - 1))} aria-label={`Decrease ${label.toLocaleLowerCase("en-US")} total`} disabled={disabled}>−</button>
      </div>
      <span className="sr-only" id="monday-total-help">Enter your own whole-number tiebreaker prediction from 0 to 200.</span>
    </div>
  );
}

function selectedTeamName(game: PlayerGame, selection: string | undefined): string {
  if (selection === game.away.abbreviation) return game.away.name;
  if (selection === game.home.abbreviation) return game.home.name;
  return "No selection";
}

function ReviewPanel({ games, picks, mondayTotal, tiebreakerLabel, onReceipt, onEdit, account, canParticipate, isPending, isLocked, hasSubmitted }: { games: PlayerGame[]; picks: Picks; mondayTotal: number | null; tiebreakerLabel: string; onReceipt: () => void; onEdit: () => void; account: AccountSummary; canParticipate: boolean; isPending: boolean; isLocked: boolean; hasSubmitted: boolean }) {
  const editGame = (gameId: string) => {
    onEdit();
    window.requestAnimationFrame(() => {
      const matchup = document.getElementById(`matchup-${gameId}`);
      matchup?.scrollIntoView({ behavior: "smooth", block: "center" });
      matchup?.querySelector<HTMLButtonElement>("button[aria-pressed='true'], button")?.focus();
    });
  };
  return (
    <section className="review-panel" aria-labelledby="review-title">
      <h2 id="review-title" tabIndex={-1}>Review your entry</h2>
      <p className="review-count">{games.length} matchup {games.length === 1 ? "call" : "calls"}</p>
      <ol className="review-list">
        {games.map((game) => (
          <li key={game.id}>
            <span><small>{game.away.abbreviation} @ {game.home.abbreviation} · {game.day} {game.time}</small><strong>{selectedTeamName(game, picks[game.id])}</strong></span>
            <button type="button" onClick={() => editGame(game.id)}>Edit pick</button>
          </li>
        ))}
      </ol>
      <p>{tiebreakerLabel} Total <strong>{mondayTotal}</strong></p>
      <button className="commit-action" type="button" onClick={onReceipt} disabled={!canParticipate || isPending}>{isPending ? "Submitting…" : canParticipate ? (hasSubmitted ? "Submit changes" : "Submit official entry") : isLocked ? "Entry locked" : "Eligibility required"}</button>
          {!canParticipate && !isLocked && <Link className="text-action text-action--link" href="/profile" prefetch={false}>{account.reasonLabel}</Link>}
      <button className="text-action" type="button" onClick={onEdit} disabled={isPending}>Back to picks</button>
    </section>
  );
}

function Receipt({ receipt, games, picks, mondayTotal, tiebreakerLabel, onEdit, locked }: { receipt: ReceiptData; games: PlayerGame[]; picks: Picks; mondayTotal: number | null; tiebreakerLabel: string; onEdit: () => void; locked: boolean }) {
  const time = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Indiana/Indianapolis" }).format(new Date(receipt.committedAt));
  return (
    <section className="receipt" aria-labelledby="receipt-title">
      <Icon name="check" /><h2 id="receipt-title" tabIndex={-1}>Entry {receipt.action === "edit" ? "updated" : "submitted"}</h2>
      <p className="review-count">{games.length} official matchup {games.length === 1 ? "call" : "calls"}</p>
      <ol className="review-list review-list--receipt">
        {games.map((game) => (
          <li key={game.id}><span><small>{game.away.abbreviation} @ {game.home.abbreviation}</small><strong>{selectedTeamName(game, picks[game.id])}</strong></span></li>
        ))}
      </ol>
      <p>{tiebreakerLabel} Total <strong>{mondayTotal ?? "—"}</strong></p>
      <time dateTime={receipt.committedAt}>{time} ET</time><small>Official version {receipt.versionNumber} · Keep this timestamp as your receipt.</small>
      <Link className="receipt-reminders-link" href="/profile#email-reminders" prefetch={false}>Manage deadline and results reminders</Link>
      {!locked && <button className="text-action" type="button" onClick={onEdit}>Edit and resubmit</button>}
    </section>
  );
}

function HomeView({ selectedCount, onContinue, account, week, canParticipate, hasSubmitted }: { selectedCount: number; onContinue: () => void; account: AccountSummary; week: PlayerWeek; canParticipate: boolean; hasSubmitted: boolean }) {
  const homeState = getHomeWeekState({
    deadlineLabel: week.deadlineLabel,
    games: week.games,
    hasSubmitted,
    isLocked: week.isLocked,
    selectedCount,
  });
  const statusLabel = homeState.lockedStatusLabel
    ?? eligibilityStatusLabel(account);
  const action = homeState.destination === "picks"
    ? canParticipate
      ? <button className="review-action" type="button" onClick={onContinue}><span>{homeState.actionLabel}</span><Icon name="arrow" /></button>
      : <Link className="review-action review-action--link" href="/profile" prefetch={false}><span>{eligibilityActionLabel(account)}</span><Icon name="arrow" /></Link>
    : <Link className="review-action review-action--link" href={`/${homeState.destination}`} prefetch={false}><span>{homeState.actionLabel}</span><Icon name="arrow" /></Link>;
  return (
    <section className="single-view home-view"><RouteSketch /><RouteSketch mirrored /><p className="week-label">{week.label} Pick&apos;em</p><h1>One sheet. {week.games.length} calls.</h1><p className="lead">{homeState.lead}</p><div className="home-status"><Icon name={homeState.lockedStatusLabel ? "check" : "shield"} /><span>{statusLabel}</span><strong>{selectedCount}/{week.games.length} picks</strong></div>{action}<Link className="home-reminders-link" href="/profile#email-reminders" prefetch={false}>Set deadline and results reminders</Link><PwaInstallHomeCard /><div className="home-trust-links"><Link href="/rules">Beta rules</Link><Link href="/privacy">Privacy</Link><Link href="/support">Support</Link><span>Built by <a href="https://droidan1.dev">Droidan1</a></span></div></section>
  );
}

function StandingsView({
  standings,
  currentUserId,
}: {
  standings: StandingsSnapshot;
  currentUserId: string;
}) {
  if (standings.status === "ready" && standings.rows.length > 0) {
    return (
      <section className="single-view standings-view">
        <p className="week-label">{standings.season} regular-season standings</p>
        <h1>The official board.</h1>
        <p className="lead">
          Regular-season results through Week {standings.throughWeek ?? 1}. Preseason picks
          are excluded. Lower cumulative tiebreaker difference wins equal records.
        </p>
        <div className="standings-table" role="table" aria-label={`${standings.season} regular-season standings`}>
          <div className="standings-row standings-row--header" role="row">
            <span role="columnheader">Rank</span><span role="columnheader">Player</span><span role="columnheader">Correct</span><span role="columnheader">TB diff</span>
          </div>
          {standings.rows.map((entry) => (
            <div
              className={`standings-row${entry.userId === currentUserId ? " standings-row--you" : ""}`}
              role="row"
              key={entry.userId}
            >
              <span className="standings-rank" role="cell"><strong>{entry.rank}</strong>{entry.rankChange !== null && entry.rankChange !== 0 ? <small className={entry.rankChange > 0 ? "standings-rank--up" : "standings-rank--down"}>{entry.rankChange > 0 ? `↑${entry.rankChange}` : `↓${Math.abs(entry.rankChange)}`}</small> : null}</span>
              <span className="standings-player" role="cell"><PlayerAvatar displayName={entry.displayName} photoUrl={entry.profilePhotoUrl} size={32} />{entry.displayName}</span>
              <span role="cell">{entry.correctPicks}/{entry.gradedPicks}</span>
              <span role="cell">{entry.tiebreakerDiff ?? "—"}</span>
            </div>
          ))}
        </div>
        <Link className="standings-results-link" href="/results" prefetch={false}>View weekly results <Icon name="arrow" /></Link>
      </section>
    );
  }

  return (
    <section className="single-view standings-view">
      <p className="week-label">{standings.season} regular-season standings</p>
      <h1>The board opens after Week 1.</h1>
      <p className="lead">
        Preseason picks do not count toward the standings. Rankings begin after every
        regular-season Week 1 game has a final result.
      </p>
      <div className="empty-state">
        <Icon name="standings" />
        <h2>{standings.status === "ready" ? "No official entries" : "No standings yet"}</h2>
        <p>
          {standings.status === "ready"
            ? "Week 1 is final, but no official player entries are available to rank."
            : standings.weekOneGameCount > 0
              ? `${standings.weekOneFinalGames} of ${standings.weekOneGameCount} Week 1 games are final.`
              : "Week 1 results will set the first official leaderboard."}
        </p>
      </div>
      <Link className="standings-results-link" href="/results" prefetch={false}>View weekly results <Icon name="arrow" /></Link>
    </section>
  );
}

function AccountDock({ account, compact = false }: { account: AccountSummary; compact?: boolean }) {
  return <div className={`account-dock${compact ? " account-dock--compact" : ""}`}><UserButton /><Link href="/profile" prefetch={false}><span>{account.displayName ?? "Player card"}</span><small>{account.overallResult === "eligible" ? "Eligible" : "Read-only"}</small></Link></div>;
}
