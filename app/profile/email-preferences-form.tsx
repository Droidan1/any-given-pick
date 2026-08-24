"use client";

import { useActionState } from "react";
import type { EmailNotificationPreferenceValues } from "@/lib/email/preferences";
import {
  saveEmailPreferencesAction,
  type EmailPreferenceActionState,
} from "./email-preference-actions";

const initialState: EmailPreferenceActionState = { status: "idle", message: "" };

const options: Array<{
  name: keyof EmailNotificationPreferenceValues;
  label: string;
  description: string;
}> = [
  {
    name: "weekPublished",
    label: "Weekly card published",
    description: "Know when the commissioner opens a new call sheet.",
  },
  {
    name: "deadlineApproaching",
    label: "Deadline approaching",
    description: "Get one reminder when the lock is within 24 hours and you have not submitted.",
  },
  {
    name: "picksSubmitted",
    label: "Picks submitted",
    description: "Receive a receipt for every official version you submit.",
  },
  {
    name: "resultsAvailable",
    label: "Results available",
    description: "Know when every game on your card has a final result.",
  },
];

export function EmailPreferencesForm({
  preferences,
}: {
  preferences: EmailNotificationPreferenceValues;
}) {
  const [state, action, pending] = useActionState(saveEmailPreferencesAction, initialState);

  return (
    <section className="email-preferences-card" id="email-preferences" aria-labelledby="email-reminders-title">
      <div className="email-preferences-card__heading">
        <p className="card-kicker">Sideline updates</p>
        <h2 id="email-reminders-title">Email reminders</h2>
        <p>Messages go only to the verified email address used for your sign-in.</p>
      </div>
      <form action={action} className="email-preferences-form">
        <fieldset disabled={pending}>
          <legend className="sr-only">Choose email reminders</legend>
          {options.map((option) => (
            <label className="email-preference-option" key={option.name}>
              <input
                type="checkbox"
                name={option.name}
                defaultChecked={preferences[option.name]}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <button className="review-action" type="submit" disabled={pending}>
          {pending ? "Saving reminders…" : "Save email reminders"}
        </button>
        {state.message ? (
          <p className={`form-result form-result--${state.status}`} role="status">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
