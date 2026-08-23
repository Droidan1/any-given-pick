"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const LIVE_REFRESH_MS = 60_000;

export function HomeLiveScoreRefresh() {
  const router = useRouter();
  const checking = useRef(false);
  const [status, setStatus] = useState("Scores check every minute.");

  const refresh = useCallback(async () => {
    if (checking.current || document.visibilityState === "hidden") return;
    checking.current = true;
    setStatus("Checking live scores…");
    try {
      const response = await fetch("/api/activity/scores", { cache: "no-store" });
      if (!response.ok) throw new Error("LIVE_SCORE_REFRESH_FAILED");
      setStatus("Live scores are up to date.");
      router.refresh();
    } catch {
      setStatus("Score check paused. Showing the latest saved scores.");
    } finally {
      checking.current = false;
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), LIVE_REFRESH_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  return <p className="home-live-board__refresh" role="status" aria-live="polite">{status}</p>;
}
