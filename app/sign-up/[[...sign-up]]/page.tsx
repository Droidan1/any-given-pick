import type { Metadata } from "next";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { BrandLockup } from "@/components/brand-lockup";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <main className="auth-shell">
      <Link href="/" className="auth-brand" aria-label="Any Given Pick home">
        <BrandLockup />
      </Link>
      <div className="auth-copy">
        <p className="week-label">Join the roster</p>
        <h1>Create your player account.</h1>
        <p>
          Create your account with email and password. We&apos;ll verify your email before you
          clear the eligibility gates.
        </p>
      </div>
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/profile"
      />
    </main>
  );
}
