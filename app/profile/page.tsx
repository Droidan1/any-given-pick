import type { Metadata } from "next";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { BrandLockup } from "@/components/brand-lockup";
import { Icon } from "@/components/icons";
import { MobileAppNav } from "@/components/mobile-app-nav";
import { hasAdminRole } from "@/lib/auth/admin";
import { requireAppUser } from "@/lib/auth/app-user";
import { getAccountSummary, getProfileRecord } from "@/lib/eligibility/service";
import { getLatestAccountPrivacyRequest } from "@/lib/privacy/account-requests";
import { AccountPrivacyControls } from "./account-privacy-controls";
import { ProfileForm } from "./profile-form";
import { ProfilePhotoEditor } from "./profile-photo-editor";

export const metadata: Metadata = {
  title: "Player profile",
  description: "Set up your Any Given Pick player profile and eligibility.",
};

export default async function ProfilePage() {
  await auth.protect();
  const appUser = await requireAppUser();
  const [account, profile, isAdmin, privacyRequest] = await Promise.all([
    getAccountSummary(appUser.id),
    getProfileRecord(appUser.id),
    hasAdminRole(appUser.id),
    getLatestAccountPrivacyRequest(appUser.id),
  ]);
  const accessBlocked = account.accountState !== "active";
  const approvalPending = account.reason === "approval_pending";

  return (
    <main className="account-shell">
      <header className="account-header">
        <Link href="/" className="account-brand" aria-label="Any Given Pick home">
          <BrandLockup />
        </Link>
        <div className="account-header__actions">
          <Link href="/activity" className="text-link">My activity</Link>
          <Link href="/" className="text-link">Back to call sheet</Link>
          <UserButton />
        </div>
      </header>
      <section className="account-sheet">
        <div className="account-intro">
          <p className="week-label">{accessBlocked ? "Account access" : "Player card"}</p>
          <h1>{accessBlocked ? (approvalPending ? "Waiting for the green light" : "Access is on hold") : "Clear every eligibility gate"}</h1>
          <p>
            {accessBlocked
              ? approvalPending
                ? "Your sign-in is verified. An administrator will review your account before you can create a player card or enter the contest."
                : "Your player card and contest access are currently unavailable. Contact an administrator if you believe this should be restored."
              : "One verified sign-in, a unique display name, age 21+, and an Indiana location check unlock participation. Everyone else keeps read-only access."}
          </p>
        </div>
        {!accessBlocked ? <ProfilePhotoEditor /> : null}
        {accessBlocked ? (
          <section className="account-access-notice" aria-labelledby="account-access-title">
            <Icon name={approvalPending ? "clock" : "shield"} />
            <div>
              <h2 id="account-access-title">{approvalPending ? "Approval pending" : "Administrator review required"}</h2>
              <p>
                {approvalPending
                  ? "There is nothing else you need to submit. Your player card stays unopened until an administrator recognizes and approves your verified account."
                  : "Your records have been preserved, but this account cannot create a player card, verify location, save picks, or submit entries."}
              </p>
            </div>
          </section>
        ) : (
          <ProfileForm account={account} profile={profile} />
        )}
        <AccountPrivacyControls request={privacyRequest} />
      </section>
      <MobileAppNav active="profile" isAdmin={isAdmin} />
    </main>
  );
}
