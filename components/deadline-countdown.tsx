"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getDeadlineCountdown, type DeadlineCountdownState } from "@/lib/deadline/countdown";

export function DeadlineCountdown({
  deadline,
  fallbackLabel,
  onLock,
  refreshOnLock = false,
}: {
  deadline: string;
  fallbackLabel: string;
  onLock?: () => void;
  refreshOnLock?: boolean;
}) {
  const router = useRouter();
  const onLockRef = useRef(onLock);
  const lockHandledRef = useRef(false);
  const [countdown, setCountdown] = useState<DeadlineCountdownState>({
    label: `Locks ${fallbackLabel}`,
    remainingMs: Number.POSITIVE_INFINITY,
    tone: "open",
  });

  useEffect(() => {
    onLockRef.current = onLock;
  }, [onLock]);

  useEffect(() => {
    let timer: number | undefined;
    lockHandledRef.current = false;

    const updateCountdown = () => {
      const next = getDeadlineCountdown(deadline);
      setCountdown(next);

      if (next.tone === "locked") {
        if (!lockHandledRef.current) {
          lockHandledRef.current = true;
          onLockRef.current?.();
          if (refreshOnLock) router.refresh();
        }
        return;
      }

      const refreshDelay = next.remainingMs <= 60 * 60 * 1_000 ? 1_000 : 30_000;
      timer = window.setTimeout(updateCountdown, Math.min(refreshDelay, next.remainingMs));
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (timer !== undefined) window.clearTimeout(timer);
      updateCountdown();
    };

    updateCountdown();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [deadline, refreshOnLock, router]);

  return (
    <span
      className={`deadline-countdown deadline-countdown--${countdown.tone}`}
      role="timer"
      aria-label={countdown.label}
    >
      {countdown.label}
    </span>
  );
}
