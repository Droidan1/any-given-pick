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
        <p>Email and password or Google both lead to one Any Given Pick player account.</p>
      </div>
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/profile"
      />
    </main>
  );
}
