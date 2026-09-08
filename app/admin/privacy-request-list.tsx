"use client";

import { useActionState } from "react";
import type { AdminPrivacyRequest } from "@/lib/admin/privacy-requests";
import {
  completePrivacyRequestAction,
  type CompletePrivacyRequestState,
} from "./privacy-request-actions";

const initialState: CompletePrivacyRequestState = { status: "idle", message: "" };

function formatRequestTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Indiana/Indianapolis",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function PrivacyRequestRow({ request }: { request: AdminPrivacyRequest }) {
  const [state, action, pending] = useActionState(completePrivacyRequestAction, initialState);
  return (
    <div className="admin-privacy-request">
      <div>
        <strong>{request.displayName}</strong>
        <small>{request.status === "processing" ? "Processing started" : "Requested"} {formatRequestTime(request.processingAt ?? request.requestedAt)} · {request.id}</small>
      </div>
      <form action={action}>
        <input type="hidden" name="requestId" value={request.id} />
        <label className="admin-privacy-request__confirm">
          <input type="checkbox" name="confirmation" value="confirmed" required />
          <span>I reviewed this irreversible request</span>
        </label>
        <button type="submit" disabled={pending}>{pending ? "Anonymizing…" : request.status === "processing" ? "Resume anonymization" : "Complete anonymization"}</button>
      </form>
      <p className={`form-result form-result--${state.status}`} aria-live="polite">{state.message}</p>
    </div>
  );
}

export function PrivacyRequestList({ requests }: { requests: AdminPrivacyRequest[] }) {
  return (
    <section className="admin-privacy-requests" aria-labelledby="admin-privacy-title">
      <header className="admin-settings-section-heading">
        <h2 id="admin-privacy-title">Privacy requests</h2>
        <p>Completion deletes the Clerk identity and photo, removes direct profile and eligibility data, and preserves official picks only under an anonymous label.</p>
      </header>
      {requests.length > 0
        ? requests.map((request) => <PrivacyRequestRow request={request} key={request.id} />)
        : <p className="admin-privacy-requests__empty">No account deletion requests are waiting.</p>}
    </section>
  );
}
