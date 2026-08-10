"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatWeekName, type ScheduleIssue } from "@/lib/admin/schedule-import";
import type { ProviderSchedule } from "@/lib/admin/schedule-providers/types";
import { parseSeasonScheduleText } from "@/lib/admin/season-import";
import {
  fetchSeasonSchedule,
  importSeasonDrafts,
  type SeasonImportActionResult,
} from "./actions";

const SIGN_IN_RECOVERY_URL = "/sign-in?redirect_url=%2Fadmin%2Fweeks%2Fimport";

function formatDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "America/Indiana/Indianapolis",
  }).format(new Date(isoDate));
}

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function ActionArrow() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

export function SeasonImporter() {
  const router = useRouter();
  const [season, setSeason] = useState(new Date().getFullYear());
  const [scheduleText, setScheduleText] = useState("");
  const [scheduleSource, setScheduleSource] = useState<ProviderSchedule | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncNeedsSignIn, setSyncNeedsSignIn] = useState(false);
  const [result, setResult] = useState<SeasonImportActionResult | null>(null);
  const [isImportPending, startImportTransition] = useTransition();
  const [isSyncPending, startSyncTransition] = useTransition();
  const syncRequestId = useRef(0);
  const preview = useMemo(
    () => parseSeasonScheduleText(scheduleText, season),
    [scheduleText, season],
  );
  const visibleIssues = scheduleText ? preview.issues : [];
  const errors = visibleIssues.filter((issue) => issue.severity === "error");
  const warnings = visibleIssues.filter((issue) => issue.severity === "warning");
  const automaticTiebreakers = preview.weeks.filter((week) => week.tiebreakerSelection === "automatic").length;
  const canImport = preview.weeks.length > 0 && errors.length === 0 && !isImportPending && !isSyncPending;
  const steps = [
    { name: "Load season", complete: scheduleText.length > 0 },
    { name: "Review weeks", complete: preview.weeks.length > 0 && errors.length === 0 },
    { name: "Create drafts", complete: Boolean(result?.ok) },
  ];
  const activeStep = steps.findIndex((step) => !step.complete);

  function resetResult() {
    setResult(null);
  }

  function invalidateScheduleSync() {
    syncRequestId.current += 1;
    setScheduleSource(null);
    setSyncError(null);
    setSyncNeedsSignIn(false);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setScheduleText(await file.text());
    invalidateScheduleSync();
    resetResult();
  }

  function handleScheduleSync() {
    const requestedSeason = season;
    const requestId = syncRequestId.current + 1;
    syncRequestId.current = requestId;
    setSyncError(null);
    setSyncNeedsSignIn(false);
    resetResult();
    startSyncTransition(async () => {
      try {
        const nextResult = await fetchSeasonSchedule({ season: requestedSeason });
        if (requestId !== syncRequestId.current) return;
        if (!nextResult.ok) {
          setSyncError(nextResult.message);
          setSyncNeedsSignIn(nextResult.code === "auth_required");
          return;
        }
        if (nextResult.schedule.season !== requestedSeason) {
          setSyncError("The schedule provider returned a different season. Your current schedule was left unchanged.");
          return;
        }
        setScheduleSource(nextResult.schedule);
        setScheduleText(nextResult.schedule.scheduleText);
      } catch {
        if (requestId !== syncRequestId.current) return;
        setSyncError("The actual schedule could not be loaded. Your current schedule was left unchanged. Try again or load a CSV instead.");
      }
    });
  }

  function handleImport() {
    resetResult();
    startImportTransition(async () => {
      try {
        const nextResult = await importSeasonDrafts({
          season,
          scheduleText,
          replaceSeasonDrafts: scheduleSource?.provider === "espn",
        });
        setResult(nextResult);
        if (nextResult.ok) router.refresh();
      } catch {
        setResult({
          ok: false,
          message: "The season drafts could not be created. Confirm your admin access and try again.",
        });
      }
    });
  }

  return (
    <section className="admin-sheet season-import-sheet">
      <header className="admin-sheet__intro">
        <div>
          <h1>Load the whole season</h1>
          <p>
            Bring every preseason and regular-season game in one file, inspect the
            generated weeks, then create private call sheets in one move.
          </p>
        </div>
        <span className="admin-status-stamp">Drafts only</span>
      </header>

      <ol className="admin-steps admin-steps--season" aria-label="Season import progress">
        {steps.map(({ name, complete }, index) => (
          <li
            className={complete ? "admin-step admin-step--complete" : "admin-step"}
            key={name}
            aria-current={index === activeStep ? "step" : undefined}
          >
            <span>{index + 1}</span>
            <strong>{name}</strong>
            {complete ? <CheckMark /> : null}
            <span className="admin-sr-only">
              {complete ? "Complete" : index === activeStep ? "Current step" : "Not complete"}
            </span>
          </li>
        ))}
      </ol>

      <div className="admin-stage admin-stage--details season-import-stage">
        <div className="admin-stage__heading">
          <span>1</span>
          <div>
            <h2>Choose the season</h2>
            <p>Pull the actual schedule, or bring your own CSV or TSV file.</p>
          </div>
        </div>
        <div className="season-import-source">
          <label className="season-import-season">
            <span>Season</span>
            <input
              type="number"
              min={new Date().getFullYear() - 1}
              max={new Date().getFullYear() + 2}
              value={season}
              disabled={isSyncPending || isImportPending}
              onChange={(event) => {
                setSeason(Number(event.target.value));
                invalidateScheduleSync();
                resetResult();
              }}
            />
          </label>

          <div className="season-sync-station">
            <div className="season-sync-station__call">
              <strong>Actual schedule feed</strong>
              <p>
                Load the three full preseason slates and all 18 regular-season weeks.
                Each preseason slate has 16 games; the standalone Hall of Fame game is
                excluded from the pick&apos;em schedule.
              </p>
            </div>
            <button
              type="button"
              className="season-sync-button"
              onClick={handleScheduleSync}
              disabled={isSyncPending || isImportPending}
            >
              <span>{isSyncPending ? `Loading ${season}…` : `Load actual ${season} schedule`}</span>
              <ActionArrow />
            </button>
            <div className="season-sync-station__status" aria-live="polite">
              {scheduleSource ? (
                <>
                  <strong>{scheduleSource.weekCount} weeks · {scheduleSource.gameCount} games loaded</strong>
                  <span>
                    From <a href={scheduleSource.sourceUrl} target="_blank" rel="noreferrer">{scheduleSource.providerLabel}</a>
                    {" · "}<a href={scheduleSource.verificationUrl} target="_blank" rel="noreferrer">Verify at NFL.com</a>
                    {" · "}Fetched {formatDateTime(scheduleSource.fetchedAt)}
                  </span>
                </>
              ) : (
                <span>Nothing is saved or published until you review and create the private drafts.</span>
              )}
            </div>
          </div>

          {syncError ? (
            <p className="season-sync-message season-sync-message--error" role="alert">
              <span>{syncError}</span>
              {syncNeedsSignIn ? <Link href={SIGN_IN_RECOVERY_URL}>Sign in again</Link> : null}
            </p>
          ) : null}
          {scheduleSource?.warnings.map((warning) => (
            <p className="season-sync-message season-sync-message--warning" role="status" key={warning}>{warning}</p>
          ))}

          <div className="admin-import-tools">
            <label className="admin-file-control">
              <span>Open CSV or TSV</span>
              <input
                type="file"
                accept=".csv,.tsv,text/csv,text/tab-separated-values"
                disabled={isSyncPending || isImportPending}
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
            </label>
            <small>{preview.delimiter ? `${preview.delimiter}-separated detected` : "No schedule loaded"}</small>
          </div>
          <label className="admin-schedule-field">
            <span>Full-season schedule</span>
            <textarea
              value={scheduleText}
              disabled={isSyncPending || isImportPending}
              onChange={(event) => {
                setScheduleText(event.target.value);
                invalidateScheduleSync();
                resetResult();
              }}
              placeholder="Paste the header row and every game here…"
              spellCheck="false"
            />
          </label>
          <details className="admin-format-note">
            <summary>Season file columns and automatic rules</summary>
            <p>
              Required: season_phase, week_number, kickoff_at, away_code, away_name,
              home_code, and home_name. Tiebreaker and provider_game_key are optional.
              Use preseason or regular for the phase and an ISO kickoff containing Z or
              a UTC offset.
            </p>
            <p>
              Blank tiebreakers use the latest Monday game during the regular season and
              the latest game during preseason. If a regular week has no Monday game, mark
              its tiebreaker explicitly. Every lock is set to Wednesday at 6:00 PM
              Indianapolis time before that week&apos;s first kickoff.
            </p>
          </details>
        </div>
      </div>

      <div className="admin-stage admin-stage--review season-import-stage">
        <div className="admin-stage__heading">
          <span>2</span>
          <div>
            <h2>Review every week</h2>
            <p>A red flag stops the entire import. Existing private drafts will be replaced.</p>
          </div>
        </div>
        <div className="admin-validation-line" aria-live="polite">
          <strong>{preview.weeks.length} {preview.weeks.length === 1 ? "week" : "weeks"} · {preview.gameCount} games</strong>
          <span className={errors.length ? "admin-count--error" : "admin-count--clear"}>
            {errors.length} {errors.length === 1 ? "error" : "errors"}
          </span>
          <span>{warnings.length} {warnings.length === 1 ? "note" : "notes"}</span>
        </div>

        {visibleIssues.length > 0 ? (
          <ul className="admin-issue-list">
            {visibleIssues.slice(0, 12).map((issue: ScheduleIssue, index) => (
              <li key={`${issue.code}-${issue.row ?? "all"}-${index}`} data-severity={issue.severity}>
                <strong>{issue.severity === "warning" ? "Note" : "Error"}</strong>
                <span>{issue.row ? `Row ${issue.row}: ` : ""}{issue.message}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {preview.weeks.length > 0 ? (
          <div className="season-week-board">
            <div className="season-week-board__header">
              <span>Generated call sheets</span>
              <small>{automaticTiebreakers} automatic {automaticTiebreakers === 1 ? "tiebreaker" : "tiebreakers"}</small>
            </div>
            {preview.weeks.map((week) => {
              const tiebreaker = week.games.find((game) => game.isMondayTiebreaker);
              return (
                <details className="season-week-row" key={`${week.seasonPhase}-${week.weekNumber}`}>
                  <summary>
                    <span>
                      <small>{week.seasonPhase === "preseason" ? "Preseason" : "Regular season"}</small>
                      <strong>{formatWeekName(week.seasonPhase, week.weekNumber)}</strong>
                    </span>
                    <span>
                      <small>Games</small>
                      <strong>{week.games.length}</strong>
                    </span>
                    <span>
                      <small>Locks</small>
                      <strong>{formatDateTime(week.entryDeadline)}</strong>
                    </span>
                    <span>
                      <small>Tiebreaker</small>
                      <strong>{tiebreaker ? `${tiebreaker.awayTeamCode} at ${tiebreaker.homeTeamCode}` : "Missing"}</strong>
                    </span>
                    <span className="season-week-expand">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5" /></svg>
                      <small>View games</small>
                    </span>
                  </summary>
                  <ol>
                    {week.games.map((game) => (
                      <li key={`${game.kickoffAt}-${game.awayTeamCode}-${game.homeTeamCode}`}>
                        <time dateTime={game.kickoffAt}>{formatDateTime(game.kickoffAt)}</time>
                        <strong>{game.awayTeamCode} at {game.homeTeamCode}</strong>
                        <span>{game.isMondayTiebreaker ? "Tiebreaker" : "Standard"}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              );
            })}
          </div>
        ) : (
          <div className="admin-review-empty">
            <svg viewBox="0 0 80 48" aria-hidden="true">
              <path d="M4 42h72M14 42V20h26v22M40 31h22v11M19 14h16M27 14V6M62 31v-9" />
            </svg>
            <strong>The season board is open</strong>
            <p>Load a season file to group every matchup into weeks.</p>
          </div>
        )}
      </div>

      <div className="admin-publish-band">
        <div>
          <h2>Create the call sheets</h2>
          <p>
            This creates or replaces private drafts only. A published, locked, or final
            week stops the full import before any draft changes. Draft games appear to
            players only after you publish that week from Week Operations. An actual
            schedule sync also removes obsolete private drafts left by an earlier sync.
          </p>
          {result ? (
            <p className={result.ok ? "admin-result admin-result--success" : "admin-result admin-result--error"} role="status">
              {result.message}
            </p>
          ) : null}
          {result?.ok ? (
            <Link
              className="season-import-result-link"
              href={result.weekIds?.[0] ? `/admin/weeks?week=${result.weekIds[0]}` : "/admin/weeks"}
            >
              Open the first imported draft in Week Operations
            </Link>
          ) : null}
          {result?.code === "auth_required" ? (
            <Link className="season-import-auth-link" href={SIGN_IN_RECOVERY_URL}>Sign in again to finish the import</Link>
          ) : null}
        </div>
        <div className="admin-publish-actions">
          <button
            type="button"
            className="admin-publish"
            onClick={handleImport}
            disabled={!canImport}
          >
            <span>{isImportPending ? "Creating drafts…" : `Create ${preview.weeks.length} private ${preview.weeks.length === 1 ? "draft" : "drafts"}`}</span>
            <ActionArrow />
          </button>
        </div>
      </div>
    </section>
  );
}
