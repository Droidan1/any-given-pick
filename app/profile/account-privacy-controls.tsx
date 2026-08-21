"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AccountPrivacyRequest } from "@/lib/privacy/account-requests";
import {
  cancelAccountDeletionAction,
  requestAccountDeletionAction,
  type PrivacyActionState,
} from "./privacy-actions";

const initialState: PrivacyActionState = { status: "idle", message: "" };

export function AccountPrivacyControls({ request }: { request: AccountPrivacyRequest | null }) {
  const [requestState, requestAction, requesting] = useActionState(requestAccountDeletionAction, initialState);
  const [cancelState, cancelAction, canceling] = useActionState(cancelAccountDeletionAction, initialState);

  if (request) {
    const processing = request.status === "processing";
    return (
      <section className="account-privacy-card account-privacy-card--pending" aria-labelledby="privacy-controls-title">
        <p className="card-kicker">Privacy request pending</p>
        <h2 id="privacy-controls-title">Account deletion is in review</h2>
        <p>{processing
          ? "Identity deletion has started and can no longer be canceled. The administrator is removing direct profile and eligibility data while retaining only de-identified official contest records."
          : "Your account is read-only. An administrator will remove your Clerk identity, profile photo, birth date, identity mappings, and legacy eligibility history, then retain only de-identified official contest records."}</p>
        {!processing ? (
          <>
            <form action={cancelAction}>
              <button type="submit" className="text-action" disabled={canceling}>{canceling ? "Canceling request…" : "Cancel deletion request"}</button>
            </form>
            <p className={`form-result form-result--${cancelState.status}`} aria-live="polite">{cancelState.message}</p>
          </>
        ) : null}
      </section>
    );
  }

  return (
    <section className="account-privacy-card" aria-labelledby="privacy-controls-title">
      <p className="card-kicker">Account controls</p>
      <h2 id="privacy-controls-title">Delete and anonymize my account</h2>
      <p>This starts a reviewed deletion request and immediately makes the account read-only. You can cancel while it is pending. Completion removes direct identifiers and your Clerk-hosted profile photo; official submitted picks remain only under an anonymous player label.</p>
      <form action={requestAction} className="account-privacy-card__form">
        <label htmlFor="delete-confirmation">Type DELETE to confirm</label>
        <input id="delete-confirmation" name="confirmation" autoComplete="off" required />
        <button type="submit" className="danger-action" disabled={requesting}>{requesting ? "Requesting deletion…" : "Request account deletion"}</button>
      </form>
      <p className={`form-result form-result--${requestState.status}`} aria-live="polite">{requestState.message}</p>
      <p className="field-help">Need access, correction, or export help instead? Read the <Link href="/privacy">Privacy notice</Link> or <Link href="/support">contact support</Link>.</p>
    </section>
  );
}
