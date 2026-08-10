"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 60_000;

type RefreshState = "checking" | "ready" | "paused";

export function ActivityScoreRefresh() {
  const router = useRouter();
  const [state, setState] = useState<RefreshState>("checking");

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refreshScores() {
      if (!active) return;
      if (document.visibilityState !== "visible") {
        setState("ready");
        timer = setTimeout(refreshScores, REFRESH_INTERVAL_MS);
        return;
      }

      setState("checking");
      try {
        const response = await fetch("/api/activity/scores", { cache: "no-store" });
        if (!response.ok) throw new Error("Score refresh failed.");
        const result = await response.json() as { updatedGames?: number };
        if (active && (result.updatedGames ?? 0) > 0) router.refresh();
        if (active) setState("ready");
      } catch {
        if (active) setState("paused");
      } finally {
        if (active) timer = setTimeout(refreshScores, REFRESH_INTERVAL_MS);
      }
    }

    void refreshScores();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  return (
    <p className={`activity-score-refresh activity-score-refresh--${state}`} aria-live="polite">
      <span aria-hidden="true" />
      {state === "checking"
        ? "Checking final scores…"
        : state === "paused"
          ? "Automatic score check will retry shortly."
          : "Final scores update automatically every minute."}
    </p>
  );
}
