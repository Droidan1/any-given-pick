"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUserDirectory, AdminUserListItem } from "@/lib/admin/users";
import {
  initialUserAccessActionState,
  manageUserAccessAction,
} from "./user-access-actions";

export function UserAccessList({ directory }: { directory: AdminUserDirectory }) {
  return (
    <section className="admin-user-access" aria-labelledby="user-access-title">
      <header className="admin-user-access__heading">
        <div>
          <h2 id="user-access-title">Player access</h2>
          <p>Recognize each verified account before opening its player card.</p>
        </div>
        <strong>{directory.pendingCount} pending</strong>
      </header>

      {!directory.identityDirectoryAvailable && (
        <p className="admin-user-access__warning" role="status">
          Clerk identities are temporarily unavailable. Access controls are paused so no
          unknown account can be approved or removed.
        </p>
      )}

      {directory.users.length === 0 ? (
        <p className="admin-user-access__empty">No player accounts have signed in yet.</p>
      ) : (
        <div className="admin-user-list">
          {directory.users.map((user) => (
            <article className="admin-user-row" key={user.id}>
              <div className="admin-user-row__identity">
                <strong>{user.name || user.displayName || "Name not provided"}</strong>
                <span>{user.email || "Verified email unavailable"}</span>
                {user.displayName && user.displayName !== user.name && (
                  <small>Player card: {user.displayName}</small>
                )}
              </div>
              <div className="admin-user-row__dates">
                <span>Joined {user.joinedLabel}</span>
                <small>Last seen {user.lastSeenLabel}</small>
              </div>
              <span className={`admin-user-status admin-user-status--${user.status}`}>
                {user.isAdmin ? "Administrator" : user.statusLabel}
              </span>
              <UserAccessControls user={user} />
            </article>
          ))}
        </div>
      )}

      {directory.truncated && (
        <p className="admin-user-access__warning">
          Showing the 100 newest accounts. Search and pagination can be added before a
          larger public launch.
        </p>
      )}
    </section>
  );
}

function UserAccessControls({ user }: { user: AdminUserListItem }) {
  const router = useRouter();
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [state, formAction, pending] = useActionState(
    manageUserAccessAction,
    initialUserAccessActionState,
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  if (user.isSelf || user.isAdmin) {
    return <span className="admin-user-protected">Protected</span>;
  }
  if (!user.identityKnown) {
    return <span className="admin-user-protected">Identity unavailable</span>;
  }

  const canApprove = user.status !== "approved";

  return (
    <div className="admin-user-controls">
      {canApprove ? (
        <form action={formAction}>
          <input type="hidden" name="targetUserId" value={user.id} />
          <input type="hidden" name="intent" value="approve" />
          <button className="admin-user-approve" type="submit" disabled={pending}>
            {pending ? "Saving…" : user.status === "removed" ? "Restore access" : "Approve player"}
          </button>
        </form>
      ) : confirmingRemoval && state.status !== "success" ? (
        <div className="admin-user-confirm">
          <p>Remove access? Their records will stay intact.</p>
          <form action={formAction}>
            <input type="hidden" name="targetUserId" value={user.id} />
            <input type="hidden" name="intent" value="remove" />
            <button type="submit" disabled={pending}>{pending ? "Removing…" : "Confirm removal"}</button>
          </form>
          <button type="button" onClick={() => setConfirmingRemoval(false)} disabled={pending}>Cancel</button>
        </div>
      ) : (
        <button className="admin-user-remove" type="button" onClick={() => setConfirmingRemoval(true)}>
          Remove access
        </button>
      )}
      <p
        className={`admin-user-result admin-user-result--${state.status}`}
        aria-live="polite"
      >
        {state.message}
      </p>
    </div>
  );
}
