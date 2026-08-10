"use client";

import { useActionState, useEffect, useState } from "react";
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

type LocationState = {
  status: "idle" | "checking" | "success" | "error";
  message: string;
};

const locationLabels: Record<NonNullable<AccountSummary["locationResult"]>, string> = {
  in_state: "Indiana confirmed",
  outside_state: "Outside Indiana",
  denied: "Permission denied",
  unavailable: "Location unavailable",
  indeterminate: "Could not confirm",
};

export function ProfileForm({
  account: initialAccount,
  profile,
}: {
  account: AccountSummary;
  profile: ProfileRecord;
}) {
  const router = useRouter();
  const [actionState, formAction, pending] = useActionState(
    saveProfileAction,
    initialProfileActionState,
  );
  const [account, setAccount] = useState(initialAccount);
  const [locationState, setLocationState] = useState<LocationState>({
    status: "idle",
    message: "",
  });

  useEffect(() => {
    if (actionState.status === "success") router.refresh();
  }, [actionState.status, router]);

  async function submitLocation(payload: Record<string, unknown>) {
    const response = await fetch("/api/eligibility/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { account?: AccountSummary; error?: string };
    if (!response.ok || !result.account) {
      throw new Error(result.error ?? "Location check failed.");
    }
    setAccount(result.account);
    setLocationState({ status: "success", message: result.account.reasonLabel });
    router.refresh();
  }

  function verifyLocation() {
    if (!("geolocation" in navigator)) {
      setLocationState({ status: "checking", message: "Recording unavailable location…" });
      void submitLocation({ status: "unavailable" }).catch(() => {
        setLocationState({ status: "error", message: "Location could not be recorded." });
      });
      return;
    }

    setLocationState({ status: "checking", message: "Confirming Indiana location…" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void submitLocation({
          status: "position",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }).catch(() => {
          setLocationState({ status: "error", message: "Location could not be confirmed." });
        });
      },
      (error) => {
        const status = error.code === error.PERMISSION_DENIED ? "denied" : "unavailable";
        void submitLocation({ status }).catch(() => {
          setLocationState({ status: "error", message: "Location could not be recorded." });
        });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  const locationLabel = account.locationResult
    ? locationLabels[account.locationResult]
    : "Not checked this session";

  return (
    <div className="account-grid">
      <section className="profile-card" aria-labelledby="profile-form-title">
        <div className="card-number">01</div>
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

      <section className="profile-card profile-card--location" aria-labelledby="location-title">
        <div className="card-number">02</div>
        <div>
          <p className="card-kicker">Game-day check</p>
          <h2 id="location-title">Verify Indiana</h2>
        </div>
        <p>
          Your browser shares a one-time coordinate with this server. The U.S. Census
          geography service identifies the state; coordinates are not stored.
        </p>
        <button
          className="review-action"
          type="button"
          onClick={verifyLocation}
          disabled={locationState.status === "checking"}
        >
          {locationState.status === "checking" ? "Checking location…" : "Verify this session"}
        </button>
        <p className="field-help" aria-live="polite">
          {locationState.message || locationLabel}
        </p>
      </section>

      <section className="eligibility-card" aria-labelledby="eligibility-title">
        <p className="card-kicker">Participation status</p>
        <h2 id="eligibility-title">{account.reasonLabel}</h2>
        <div className="eligibility-gates">
          <StatusLine label="Verified sign-in" passed={account.verifiedAuth} />
          <StatusLine label="Player profile" passed={account.profileComplete} />
          <StatusLine label="Age 21+" passed={account.ageEligible === true} />
          <StatusLine label="Indiana location" passed={account.locationResult === "in_state"} />
          <StatusLine label="Active account" passed={account.accountState === "active"} />
        </div>
        <p className="eligibility-verdict">
          {account.overallResult === "eligible" ? "FULL PARTICIPATION" : "READ-ONLY ACCESS"}
        </p>
      </section>
    </div>
  );
}

function StatusLine({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className="eligibility-gate">
      <span>{label}</span>
      <strong>{passed ? "Cleared" : "Open"}</strong>
    </div>
  );
}
