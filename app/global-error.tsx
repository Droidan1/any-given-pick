"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="error-call-sheet">
          <p className="week-label">Any Given Pick</p>
          <h1>The call sheet needs a reset.</h1>
          <p>An unexpected error was logged. Your sensitive profile information is not included in the alert.</p>
          <div className="error-call-sheet__actions">
            <button type="button" onClick={reset}>Try again</button>
            <a href="mailto:brian@Droidan1.dev">Email support</a>
          </div>
        </main>
      </body>
    </html>
  );
}
