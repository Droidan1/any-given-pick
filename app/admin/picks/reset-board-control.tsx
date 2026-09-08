"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type ResetBoardRequest = {
  boardId: string;
  expectedDraftRevision: number;
  expectedVersionNumber: number;
  reason: string;
  confirmed: boolean;
};

export function ResetBoardControl({ boardId, boardName, playerName, draftRevision, versionNumber, unavailableReason, description, resetAction }: {
  boardId: string;
  boardName: string;
  playerName: string;
  draftRevision: number;
  versionNumber: number;
  unavailableReason?: string;
  description: string;
  resetAction: (input: ResetBoardRequest) => Promise<{ ok: boolean; message: string }>;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function reset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const result = await resetAction({ boardId, expectedDraftRevision: draftRevision, expectedVersionNumber: versionNumber, reason: reason.trim(), confirmed: true });
        setMessage(result.message);
        if (result.ok) {
          setConfirming(false);
          setReason("");
        }
        router.refresh();
      } catch {
        setMessage("The reset could not be confirmed. Refresh the board before trying again.");
      }
    });
  }

  return <div className="admin-board-reset">
    {confirming ? <form className="board-confirm" onSubmit={reset} aria-label={`Reset ${boardName} for ${playerName}`}>
      <h3>Reset {boardName}?</h3>
      <p><strong>{playerName} · {boardName}</strong></p>
      <p>{description}</p>
      <label>Reason <span>(optional, recorded in the audit history)</span><textarea maxLength={240} value={reason} onChange={event => setReason(event.target.value)} disabled={pending} /></label>
      <div className="board-actions">
        <button className="board-primary" type="submit" disabled={pending}>{pending ? "Resetting…" : "Confirm reset"}</button>
        <button type="button" disabled={pending} onClick={() => setConfirming(false)}>Cancel</button>
      </div>
    </form> : <button className="admin-board-reset__button" type="button" disabled={pending || Boolean(unavailableReason)} onClick={() => { setMessage(""); setConfirming(true); }}>Reset board</button>}
    {unavailableReason && <small>{unavailableReason}</small>}
    <p className="board-status" role="status">{message}</p>
  </div>;
}
