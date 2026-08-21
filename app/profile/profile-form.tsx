"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AccountSummary } from "@/lib/account-types";
import {
  saveProfileAction,
  type ProfileActionState,
} from "./actions";

const initialProfileActionState: ProfileActionState = {
  status: "idle",
  message: "",
};

type ProfileRecord = {
  displayName: string;
  birthDate: string;
  displayNameChangedAt: string;
} | null;

export function PlayerIdentityForm({ profile }: { profile: ProfileRecord }) {
  const router = useRouter();
  const [actionState, formAction, pending] = useActionState(
    saveProfileAction,
    initialProfileActionState,
  );

  useEffect(() => {
    if (actionState.status === "success") router.refresh();
  }, [actionState.status, router]);

  return (
    <section className="profile-card profile-card--identity" aria-labelledby="profile-form-title">
      <div>
        <p className="card-kicker">Identity</p>
        <h2 id="profile-form-title">Build your player card</h2>
      </div>
      <form action={formAction} className="profile-form">
        <label>
          Display name
          <input
            name="displayName"
            type="text"
            autoComplete="nickname"
            defaultValue={profile?.displayName ?? ""}
            aria-invalid={Boolean(actionState.fieldErrors?.displayName)}
            aria-describedby="display-name-help display-name-error"
            required
          />
        </label>
        <p id="display-name-help" className="field-help">
          Unique site-wide. Changes are limited to once every 30 days.
        </p>
        <p id="display-name-error" className="field-error">
          {actionState.fieldErrors?.displayName?.[0]}
        </p>

        <label>
          Date of birth
          <input
            name="birthDate"
            type="date"
            autoComplete="bday"
            defaultValue={profile?.birthDate ?? ""}
            aria-invalid={Boolean(actionState.fieldErrors?.birthDate)}
            aria-describedby="birth-date-help birth-date-error"
            required
          />
        </label>
        <p id="birth-date-help" className="field-help">
          Used only to derive age eligibility. It is never written to application logs.
          {" "}<Link href="/privacy">How profile data is handled.</Link>
        </p>
        <p id="birth-date-error" className="field-error">
          {actionState.fieldErrors?.birthDate?.[0]}
        </p>

        <button className="commit-action" type="submit" disabled={pending}>
          {pending ? "Saving player card…" : profile ? "Update player card" : "Save player card"}
        </button>
        <p className={`form-result form-result--${actionState.status}`} aria-live="polite">
          {actionState.message}
        </p>
      </form>
    </section>
  );
}

export function PlayerEligibilityPanel({
  account,
}: {
  account: AccountSummary;
}) {
  return (
    <section className="eligibility-card" aria-labelledby="eligibility-title">
      <p className="card-kicker">Participation status</p>
      <h2 id="eligibility-title">{account.reasonLabel}</h2>
      <div className="eligibility-gates">
        <StatusLine label="Verified sign-in" passed={account.verifiedAuth} />
        <StatusLine label="Player profile" passed={account.profileComplete} />
        <StatusLine label="Age 21+" passed={account.ageEligible === true} />
        <StatusLine label="Active account" passed={account.accountState === "active"} />
      </div>
      <p className="eligibility-verdict">
        {account.overallResult === "eligible" ? "FULL PARTICIPATION" : "READ-ONLY ACCESS"}
      </p>
    </section>
  );
}

function StatusLine({
  label,
  passed,
  openLabel = "Open",
}: {
  label: string;
  passed: boolean;
  openLabel?: string;
}) {
  return (
    <div className="eligibility-gate">
      <span>{label}</span>
      <strong>{passed ? "Cleared" : openLabel}</strong>
    </div>
  );
}
