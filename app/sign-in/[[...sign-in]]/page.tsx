import type { Metadata } from "next";
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { BrandLockup } from "@/components/brand-lockup";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="auth-shell">
      <Link href="/" className="auth-brand" aria-label="Any Given Pick home">
        <BrandLockup />
      </Link>
      <div className="auth-copy">
        <p className="week-label">Report to the sideline</p>
        <h1>Sign in. Make the call.</h1>
        <p>
          Enter your email and we&apos;ll send a one-time sign-in code. Your password stays
          available as a backup.
        </p>
      </div>
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/profile"
      />
      <section className="auth-game-plan" aria-labelledby="game-plan-title">
        <h2 id="game-plan-title">How the game works</h2>
        <div className="auth-game-plan__details">
          <ol>
            <li>
              <strong>Pick every matchup</strong>
              <span>Choose one winner in each game. Every correct call earns one point.</span>
            </li>
            <li>
              <strong>Set Monday total</strong>
              <span>Predict the combined Monday-night score to break standings ties.</span>
            </li>
            <li>
              <strong>Review before lock</strong>
              <span>Finish every pick and eligibility check before the weekly deadline.</span>
            </li>
          </ol>
          <p className="auth-game-plan__note">
            The current prototype saves picks on this device. Official schedules and contest
            submission are coming in a later milestone.
          </p>
        </div>
      </section>
    </main>
  );
}
