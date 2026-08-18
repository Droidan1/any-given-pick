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
import { getEmailNotificationPreferences } from "@/lib/email/preferences";
import { getLatestAccountPrivacyRequest } from "@/lib/privacy/account-requests";
import { AccountPrivacyControls } from "./account-privacy-controls";
import { EmailPreferencesForm } from "./email-preferences-form";
import { PlayerEligibilityPanel, PlayerIdentityForm } from "./profile-form";
import { ProfilePhotoEditor } from "./profile-photo-editor";
import { PwaInstallProfileAccess } from "@/components/pwa-install-experience";

export const metadata: Metadata = {
  title: "Player profile",
  description: "Set up your Any Given Pick player profile and eligibility.",
};

export default async function ProfilePage() {
  await auth.protect();
  const appUser = await requireAppUser();
  const [account, profile, isAdmin, privacyRequest, emailPreferences] = await Promise.all([
    getAccountSummary(appUser.id),
    getProfileRecord(appUser.id),
    hasAdminRole(appUser.id),
    getLatestAccountPrivacyRequest(appUser.id),
    getEmailNotificationPreferences(appUser.id),
  ]);
  const accessBlocked = account.accountState !== "active";
  const approvalPending = account.reason === "approval_pending";

  return (
    <main className="account-shell">
      <header className="account-header">
        <Link href="/" className="account-brand" aria-label="Any Given Pick home" prefetch={false}>
          <BrandLockup />
        </Link>
        <div className="account-header__actions">
          <Link href="/activity" className="text-link" prefetch={false}>My activity</Link>
          <Link href="/" className="text-link" prefetch={false}>Back to call sheet</Link>
          <UserButton />
        </div>
      </header>
      <section className="account-sheet profile-settings-sheet">
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
          <div className="profile-settings-stack">
            <details className="profile-settings-section" open>
              <summary>
                <span>Personal information</span>
                <small>Photo, display name, and age verification</small>
              </summary>
              <div className="profile-settings-section__content">
                <ProfilePhotoEditor />
                <PlayerIdentityForm profile={profile} />
              </div>
            </details>

            <details className="profile-settings-section" open={account.overallResult !== "eligible"}>
              <summary>
                <span>Eligibility</span>
                <small>{account.reasonLabel}</small>
              </summary>
              <div className="profile-settings-section__content">
                <PlayerEligibilityPanel account={account} />
              </div>
            </details>

            <details className="profile-settings-section" id="email-reminders" open>
              <summary>
                <span>Notifications</span>
                <small>Weekly cards, deadlines, receipts, and results</small>
              </summary>
              <div className="profile-settings-section__content">
                <EmailPreferencesForm preferences={emailPreferences} />
              </div>
            </details>

            <details className="profile-settings-section" id="email-reminders" open>
              <summary>
                <span>Privacy and account controls</span>
                <small>{privacyRequest ? "Deletion request in review" : "Review or delete your account data"}</small>
              </summary>
              <div className="profile-settings-section__content">
                <AccountPrivacyControls request={privacyRequest} />
              </div>
            </details>
          </div>
        )}
        {accessBlocked ? (
          <div className="profile-settings-stack profile-settings-stack--limited">
            <details className="profile-settings-section">
              <summary>
                <span>Notifications</span>
                <small>Choose which account emails you receive</small>
              </summary>
              <div className="profile-settings-section__content">
                <EmailPreferencesForm preferences={emailPreferences} />
              </div>
            </details>
            <details className="profile-settings-section">
              <summary>
                <span>Privacy and account controls</span>
                <small>{privacyRequest ? "Deletion request in review" : "Review or delete your account data"}</small>
              </summary>
              <div className="profile-settings-section__content">
                <AccountPrivacyControls request={privacyRequest} />
              </div>
            </details>
          </div>
        ) : null}
        <PwaInstallProfileAccess />
      </section>
      <MobileAppNav active="profile" isAdmin={isAdmin} />
    </main>
  );
}
