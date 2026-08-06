"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  formatWeekName,
  parseScheduleText,
  PRESEASON_SCHEDULE_TEMPLATE,
  SCHEDULE_TEMPLATE,
  validateWeekDetails,
  type ScheduleIssue,
  type SeasonPhase,
} from "@/lib/admin/schedule-import";
import { publishWeek, saveWeekDraft, type AdminActionResult } from "./actions";

type InitialWeek = {
  id: string;
  season: number;
  seasonPhase: SeasonPhase;
  weekNumber: number;
  label: string;
  entryDeadline: string;
  scheduleText: string;
  status: "draft" | "published" | "locked" | "final";
};

function weekFingerprint(input: {
  season: number;
  seasonPhase: SeasonPhase;
  weekNumber: number;
  label: string;
  entryDeadline: string;
  scheduleText: string;
}): string {
  return JSON.stringify({ ...input, label: input.label.trim(), scheduleText: input.scheduleText.trim() });
}

function toLocalDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIsoDateTime(localDate: string): string {
  if (!localDate) return "";
  const date = new Date(localDate);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function formatKickoff(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(isoDate));
}

function defaultSeasonPhase(): SeasonPhase {
  return [6, 7].includes(new Date().getMonth()) ? "preseason" : "regular";
}

function StepMark({ complete }: { complete: boolean }) {
  return complete ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  ) : null;
}

function ActionArrow() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

export function AdminWeekBuilder({ initialWeek }: { initialWeek: InitialWeek | null }) {
  const router = useRouter();
  const [season, setSeason] = useState(initialWeek?.season ?? new Date().getFullYear());
  const [seasonPhase, setSeasonPhase] = useState<SeasonPhase>(initialWeek?.seasonPhase ?? defaultSeasonPhase());
  const [weekNumber, setWeekNumber] = useState(initialWeek?.weekNumber ?? 1);
  const [label, setLabel] = useState(initialWeek?.label ?? "");
  const [entryDeadline, setEntryDeadline] = useState(
    initialWeek ? toLocalDateTime(initialWeek.entryDeadline) : "",
  );
  const [scheduleText, setScheduleText] = useState(initialWeek?.scheduleText ?? "");
  const [weekId, setWeekId] = useState(initialWeek?.id ?? "");
  const [savedFingerprint, setSavedFingerprint] = useState(() => initialWeek
    ? weekFingerprint({
        season: initialWeek.season,
        seasonPhase: initialWeek.seasonPhase,
        weekNumber: initialWeek.weekNumber,
        label: initialWeek.label,
        entryDeadline: initialWeek.entryDeadline,
        scheduleText: initialWeek.scheduleText,
      })
    : "");
  const [result, setResult] = useState<AdminActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const readOnly = initialWeek ? initialWeek.status !== "draft" : false;

  const preview = useMemo(() => parseScheduleText(scheduleText), [scheduleText]);
  const entryDeadlineIso = toIsoDateTime(entryDeadline);
  const currentFingerprint = weekFingerprint({
    season,
    seasonPhase,
    weekNumber,
    label,
    entryDeadline: entryDeadlineIso,
    scheduleText,
  });
  const weekIssues = useMemo(
    () =>
      validateWeekDetails(
        { season, seasonPhase, weekNumber, label: label.trim(), entryDeadline: entryDeadlineIso },
        preview.games,
      ),
    [season, seasonPhase, weekNumber, label, entryDeadlineIso, preview.games],
  );
  const allIssues = scheduleText ? [...preview.issues, ...weekIssues] : [];
  const errors = allIssues.filter((issue) => issue.severity === "error");
  const warnings = allIssues.filter((issue) => issue.severity === "warning");
  const detailsComplete = Boolean(entryDeadlineIso) && weekIssues.every((issue) => !["invalid_season", "invalid_week", "invalid_label", "invalid_deadline"].includes(issue.code));
  const importComplete = scheduleText.length > 0 && preview.games.length > 0;
  const reviewComplete = importComplete && errors.length === 0;
  const savedAndCurrent = Boolean(weekId && savedFingerprint === currentFingerprint);
  const publishComplete = initialWeek?.status === "published" || initialWeek?.status === "locked" || initialWeek?.status === "final";
  const stepStates = [
    { name: "Week details", complete: detailsComplete },
    { name: "Bring the games", complete: importComplete },
    { name: "Review the slate", complete: reviewComplete },
    { name: "Publish", complete: publishComplete },
  ];
  const activeStep = stepStates.findIndex((step) => !step.complete);
  const deviceTimeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "your device time zone",
    [],
  );

  function handleSave() {
    setResult(null);
    const fingerprint = currentFingerprint;
    startTransition(async () => {
      try {
        const nextResult = await saveWeekDraft({
          season,
          seasonPhase,
          weekNumber,
          label,
          entryDeadline: entryDeadlineIso,
          scheduleText,
        });
        setResult(nextResult);
        if (nextResult.ok && nextResult.weekId) {
          setWeekId(nextResult.weekId);
          setSavedFingerprint(fingerprint);
          router.replace(`/admin/weeks?week=${nextResult.weekId}`);
          router.refresh();
        }
      } catch {
        setResult({ ok: false, message: "The draft could not be saved. Confirm your admin access and try again." });
      }
    });
  }

  function handlePublish() {
    if (!weekId) return;
    setResult(null);
    startTransition(async () => {
      try {
        const nextResult = await publishWeek(weekId);
        setResult(nextResult);
        if (nextResult.ok) router.refresh();
      } catch {
        setResult({ ok: false, message: "The week could not be published. Confirm your admin access and try again." });
      }
    });
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setScheduleText(await file.text());
    setResult(null);
  }

  function loadExample() {
    setScheduleText(seasonPhase === "preseason" ? PRESEASON_SCHEDULE_TEMPLATE : SCHEDULE_TEMPLATE);
    setResult(null);
  }

  function handleSeasonPhase(nextPhase: SeasonPhase) {
    setSeasonPhase(nextPhase);
    setWeekNumber((current) => nextPhase === "preseason" ? Math.min(current, 4) : current);
    setResult(null);
  }

  const weekName = formatWeekName(seasonPhase, weekNumber);

  return (
    <section className="admin-sheet">
      <header className="admin-sheet__intro">
        <div>
          <h1>{initialWeek ? `${weekName} call sheet` : "Call the next week"}</h1>
          <p>
            Set the lock, bring in the slate, inspect every matchup, then publish one
            clean sheet to every player.
          </p>
        </div>
        <span className={`admin-status-stamp admin-status-stamp--${initialWeek?.status ?? "new"}`}>
          {initialWeek?.status ?? "new draft"}
        </span>
      </header>

      <ol className="admin-steps" aria-label="Week publishing progress">
        {stepStates.map(({ name, complete }, index) => (
          <li
            className={complete ? "admin-step admin-step--complete" : "admin-step"}
            key={name}
            aria-current={index === activeStep ? "step" : undefined}
          >
            <span>{index + 1}</span>
            <strong>{name}</strong>
            <StepMark complete={complete} />
            <span className="admin-sr-only">{complete ? "Complete" : index === activeStep ? "Current step" : "Not complete"}</span>
          </li>
        ))}
      </ol>

      <div className="admin-stage admin-stage--details">
        <div className="admin-stage__heading">
          <span>1</span>
          <div>
            <h2>Set the week</h2>
            <p>The entry lock is stored as an exact instant, using your device time zone.</p>
          </div>
        </div>
        <div className="admin-detail-fields">
          <label className="admin-field--phase">
            <span>Season phase</span>
            <select
              value={seasonPhase}
              onChange={(event) => handleSeasonPhase(event.target.value as SeasonPhase)}
              disabled={readOnly}
            >
              <option value="preseason">Preseason</option>
              <option value="regular">Regular season</option>
            </select>
          </label>
          <label>
            <span>Season</span>
            <input
              type="number"
              min={new Date().getFullYear() - 1}
              max={new Date().getFullYear() + 2}
              value={season}
              onChange={(event) => setSeason(Number(event.target.value))}
              disabled={readOnly}
            />
          </label>
          <label>
            <span>Week</span>
            <input
              type="number"
              min="1"
              max={seasonPhase === "preseason" ? 4 : 22}
              value={weekNumber}
              onChange={(event) => setWeekNumber(Number(event.target.value))}
              disabled={readOnly}
            />
          </label>
          <label className="admin-field--wide">
            <span>Call-sheet label <small>optional</small></span>
            <input
              type="text"
              maxLength={80}
              placeholder={seasonPhase === "preseason" ? "Preseason opener" : "Opening week"}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              disabled={readOnly}
            />
          </label>
          <label className="admin-field--deadline">
            <span>Entry deadline <small suppressHydrationWarning>{deviceTimeZone}</small></span>
            <div className="admin-deadline-control">
              <span className="admin-deadline-marker" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="8" />
                  <path d="M12 7v5l3 2M8 3h8" />
                </svg>
                Lock
              </span>
              <input
                type="datetime-local"
                value={entryDeadline}
                onChange={(event) => setEntryDeadline(event.target.value)}
                disabled={readOnly}
              />
            </div>
          </label>
        </div>
      </div>

      <div className="admin-stage admin-stage--import">
        <div className="admin-stage__heading">
          <span>2</span>
          <div>
            <h2>Bring the games</h2>
            <p>Paste CSV or spreadsheet rows. The source key is optional, so any provider can feed the same format.</p>
          </div>
        </div>
        <div className="admin-import-tools">
          <button type="button" onClick={loadExample} disabled={readOnly}>
            Load {seasonPhase === "preseason" ? "preseason " : ""}example
          </button>
          <label className="admin-file-control">
            <span>Open CSV or TSV</span>
            <input
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              onChange={(event) => void handleFile(event.target.files?.[0])}
              disabled={readOnly}
            />
          </label>
          <small>{preview.delimiter ? `${preview.delimiter}-separated detected` : "No schedule detected"}</small>
        </div>
        <label className="admin-schedule-field">
          <span>Schedule data</span>
          <textarea
            value={scheduleText}
            onChange={(event) => setScheduleText(event.target.value)}
            placeholder="Paste the header row and each matchup here…"
            spellCheck="false"
            disabled={readOnly}
          />
        </label>
        <details className="admin-format-note">
          <summary>Required columns and time format</summary>
          <p>
            Required: kickoff_at, away_code, away_name, home_code, home_name, and
            monday_tiebreaker. Set exactly one row to true; during preseason it may be
            any designated tiebreaker game. Use an ISO kickoff with Z or an offset such as
            2026-08-13T20:00:00-04:00. provider_game_key is optional.
          </p>
        </details>
      </div>

      <div className="admin-stage admin-stage--review">
        <div className="admin-stage__heading">
          <span>3</span>
          <div>
            <h2>Read the slate</h2>
            <p>Nothing is saved until every red flag is cleared.</p>
          </div>
        </div>

        <div className="admin-validation-line" aria-live="polite">
          <strong>{preview.games.length} games read</strong>
          <span className={errors.length ? "admin-count--error" : "admin-count--clear"}>
            {errors.length} {errors.length === 1 ? "error" : "errors"}
          </span>
          <span>{warnings.length} {warnings.length === 1 ? "warning" : "warnings"}</span>
        </div>

        {allIssues.length > 0 && (
          <ul className="admin-issue-list">
            {allIssues.slice(0, 8).map((issue: ScheduleIssue, index) => (
              <li key={`${issue.code}-${issue.row ?? "all"}-${index}`} data-severity={issue.severity}>
                <strong>{issue.severity}</strong>
                <span>{issue.row ? `Row ${issue.row}: ` : ""}{issue.message}</span>
              </li>
            ))}
          </ul>
        )}

        {preview.games.length > 0 ? (
          <div className="admin-game-table" role="table" aria-label="Imported games">
            <div className="admin-game-row admin-game-row--header" role="row">
              <span role="columnheader">Kickoff</span>
              <span role="columnheader">Away</span>
              <span role="columnheader">Home</span>
              <span role="columnheader">Drill</span>
            </div>
            {preview.games.map((game) => (
              <div className="admin-game-row" role="row" key={`${game.kickoffAt}-${game.awayTeamCode}-${game.homeTeamCode}`}>
                <time role="cell" dateTime={game.kickoffAt}>{formatKickoff(game.kickoffAt)}</time>
                <span role="cell"><strong>{game.awayTeamCode}</strong><small>{game.awayTeamName}</small></span>
                <span role="cell"><strong>{game.homeTeamCode}</strong><small>{game.homeTeamName}</small></span>
                <span role="cell" className={game.isMondayTiebreaker ? "admin-tiebreaker" : ""}>
                  {game.isMondayTiebreaker ? (seasonPhase === "preseason" ? "Tiebreaker total" : "Monday total") : "Standard"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="admin-review-empty">
            <svg viewBox="0 0 80 48" aria-hidden="true">
              <path d="M4 42h72M14 42V20h26v22M40 31h22v11M19 14h16M27 14V6M62 31v-9" />
            </svg>
            <strong>The review board is open</strong>
            <p>Paste a schedule above to line up every game here.</p>
          </div>
        )}
      </div>

      <div className="admin-publish-band">
        <div>
          <h2>Make the call</h2>
          <p>
            Saving keeps the week private. Publishing makes this slate available to the player experience.
          </p>
          {result && (
            <p className={result.ok ? "admin-result admin-result--success" : "admin-result admin-result--error"} role="status">
              {result.message}
            </p>
          )}
        </div>
        <div className="admin-publish-actions">
          {!readOnly && (
            <button
              type="button"
              className="admin-save-draft"
              onClick={handleSave}
              disabled={isPending || !reviewComplete}
            >
              {isPending ? "Working…" : "Save private draft"}
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              className="admin-publish"
              onClick={handlePublish}
              disabled={isPending || !savedAndCurrent || !reviewComplete}
            >
              <span>{isPending ? "Working…" : savedAndCurrent ? `Publish ${weekName.toLocaleLowerCase("en-US")}` : weekId ? "Save changes first" : "Save draft first"}</span>
              <ActionArrow />
            </button>
          )}
          {readOnly && <strong className="admin-readonly-call">This week is {initialWeek?.status}</strong>}
        </div>
      </div>
    </section>
  );
}
