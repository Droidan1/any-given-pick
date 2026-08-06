import type { Metadata } from "next";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { BrandLockup } from "@/components/brand-lockup";
import { requireAppUser } from "@/lib/auth/app-user";
import { getAccountSummary, getProfileRecord } from "@/lib/eligibility/service";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = {
  title: "Player profile",
  description: "Set up your Any Given Pick player profile and eligibility.",
};

export default async function ProfilePage() {
  await auth.protect();
  const appUser = await requireAppUser();
  const [account, profile] = await Promise.all([
    getAccountSummary(appUser.id),
    getProfileRecord(appUser.id),
  ]);

  return (
    <main className="account-shell">
      <header className="account-header">
        <Link href="/" className="account-brand" aria-label="Any Given Pick home">
          <BrandLockup />
        </Link>
        <div className="account-header__actions">
          <Link href="/" className="text-link">Back to call sheet</Link>
          <UserButton />
        </div>
      </header>
      <section className="account-sheet">
        <div className="account-intro">
          <p className="week-label">Player card</p>
          <h1>Clear every eligibility gate</h1>
          <p>
            One verified sign-in, a unique display name, age 21+, and an Indiana
            location check unlock participation. Everyone else keeps read-only access.
          </p>
        </div>
        <ProfileForm account={account} profile={profile} />
      </section>
    </main>
  );
}
