"use client";

import Link from "next/link";
import { useEffect } from "react";
import { BrandLockup } from "@/components/brand-lockup";

export default function ErrorPage({
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
    <main className="error-call-sheet">
      <BrandLockup />
      <p className="week-label">The play broke down</p>
      <h1>We hit an unexpected error.</h1>
      <p>The incident was logged without your birth date, location coordinates, picks, or profile photo.</p>
      <div className="error-call-sheet__actions">
        <button type="button" onClick={reset}>Try this play again</button>
        <Link href="/support">Contact support</Link>
      </div>
    </main>
  );
}
