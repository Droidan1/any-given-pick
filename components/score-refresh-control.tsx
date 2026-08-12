"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 60_000;
const BUSINESS_TIME_ZONE = "America/Indiana/Indianapolis";

type ScoreHealth = {
  status?: "idle" | "running" | "healthy" | "warning" | "failed";
  lastSuccessAt?: string | null;
};

type CheckReason = "automatic" | "manual";
type FeedbackState = "ready" | "checking" | "updated" | "unchanged" | "paused";

function formatStoredUpdate(value: string | null): string {
  if (!value) return "No stored score update has completed yet.";
  return `Stored results last updated ${new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value))}.`;
}

function formatNextCheck(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function ScoreRefreshControl({
  initialLastSuccessAt,
  shouldPoll,
  nextAutomaticCheckAt,
}: {
  initialLastSuccessAt: string | null;
  shouldPoll: boolean;
  nextAutomaticCheckAt: string | null;
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [lastSuccessAt, setLastSuccessAt] = useState(initialLastSuccessAt);
  const [feedback, setFeedback] = useState<FeedbackState>("ready");
  const [announcement, setAnnouncement] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [activatedWindow, setActivatedWindow] = useState<string | null>(null);
  const latestSuccessRef = useRef(initialLastSuccessAt);
  const checkingRef = useRef(false);

  useEffect(() => {
    latestSuccessRef.current = initialLastSuccessAt;
  }, [initialLastSuccessAt]);

  const checkForUpdates = useCallback(async (reason: CheckReason) => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setIsChecking(true);
    if (reason === "manual") setFeedback("checking");

    try {
      const response = await fetch("/api/activity/scores", { cache: "no-store" });
      if (!response.ok) throw new Error("Score refresh failed.");
      const result = await response.json() as ScoreHealth;
      if (result.status === "failed") {
        setFeedback("paused");
        setAnnouncement("The score feed needs attention. The last stored results remain available.");
        return;
      }

      const nextSuccessAt = result.lastSuccessAt ?? null;
      if (nextSuccessAt && nextSuccessAt !== latestSuccessRef.current) {
        latestSuccessRef.current = nextSuccessAt;
        setLastSuccessAt(nextSuccessAt);
        setFeedback("updated");
        setAnnouncement("New stored results are available and have been loaded.");
        startRefresh(() => router.refresh());
      } else if (reason === "manual") {
        setFeedback("unchanged");
        setAnnouncement("No newer stored results are available yet.");
      } else {
        setFeedback("ready");
      }
    } catch {
      setFeedback("paused");
      setAnnouncement("Results could not be checked. Your last stored results are still available.");
    } finally {
      checkingRef.current = false;
      setIsChecking(false);
    }
  }, [router]);

  const automaticChecksActive = shouldPoll
    || (nextAutomaticCheckAt !== null && activatedWindow === nextAutomaticCheckAt);

  useEffect(() => {
    if (!automaticChecksActive) return;
    const initialTimer = window.setTimeout(() => void checkForUpdates("automatic"), 0);
    const timer = window.setInterval(() => void checkForUpdates("automatic"), REFRESH_INTERVAL_MS);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [automaticChecksActive, checkForUpdates]);

  useEffect(() => {
    if (shouldPoll || !nextAutomaticCheckAt) return;
    const delay = Math.max(0, new Date(nextAutomaticCheckAt).getTime() - Date.now());
    const timer = window.setTimeout(() => setActivatedWindow(nextAutomaticCheckAt), delay);
    return () => window.clearTimeout(timer);
  }, [nextAutomaticCheckAt, shouldPoll]);

  const statusCopy = feedback === "paused"
    ? "The score feed needs attention. Showing the latest stored results."
    : feedback === "checking"
      ? "Checking for newer stored results…"
      : feedback === "updated"
        ? "New stored results loaded."
        : feedback === "unchanged"
          ? "No newer stored results yet."
          : formatStoredUpdate(lastSuccessAt);

  return (
    <div className={`score-refresh-control score-refresh-control--${feedback}`}>
      <span className="score-refresh-control__mark" aria-hidden="true" />
      <div>
        <strong>{statusCopy}</strong>
        <span>
          {automaticChecksActive
            ? "Automatic checks run every minute during active games."
            : nextAutomaticCheckAt
              ? `Automatic checks begin ${formatNextCheck(nextAutomaticCheckAt)}.`
              : "Automatic checks resume during active game windows."}
        </span>
      </div>
      <button type="button" onClick={() => void checkForUpdates("manual")} disabled={isChecking || isRefreshing}>
        {isChecking || isRefreshing ? "Checking…" : "Check for updates"}
      </button>
      <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    </div>
  );
}
