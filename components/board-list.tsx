"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { manageBoard, type BoardMutation } from "@/app/board-actions";
import { userDraftStorageKey } from "@/lib/entries/draft-storage";
import { boardLimit } from "@/lib/entries/board-rules";
import type { PlayerEntry, PlayerWeek } from "@/lib/entries/types";

type BoardForm = { intent: "create" | "rename" | "delete"; board?: PlayerEntry };

export function BoardList({ week, canParticipate, draftOwnerId, onOpen }: {
  week: PlayerWeek; canParticipate: boolean; draftOwnerId: string; onOpen: (id: string) => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<BoardForm | null>(null);
  const [name, setName] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const active = week.entries.filter(entry => !entry.archivedAt);
  const archived = week.entries.filter(entry => entry.archivedAt);
  const limit = boardLimit(week.boardSettings);
  const editable = canParticipate && !week.isLocked && !pending;
  const canCreate = editable && active.length < limit;

  function openForm(intent: BoardForm["intent"], board?: PlayerEntry) {
    setForm({ intent, board });
    setName(intent === "rename" ? board?.boardName ?? "" : board ? `${board.boardName} copy`.slice(0, 40) : `Board ${Math.max(0, ...week.entries.map(entry => entry.boardNumber)) + 1}`);
    setSourceId(intent === "create" ? board?.id ?? "" : "");
    setMessage("");
  }

  function saveForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    let input: BoardMutation;
    if (form.intent === "create") input = { intent: "create", weekId: week.id, name, ...(sourceId ? { copyFromId: sourceId } : {}) };
    else if (form.board && form.intent === "rename") input = { intent: "rename", weekId: week.id, boardId: form.board.id, name };
    else if (form.board) input = { intent: "delete", weekId: week.id, boardId: form.board.id };
    else return;
    startTransition(async () => {
      const result = await manageBoard(input);
      setMessage(result.message);
      if (result.ok) {
        setForm(null);
        if (input.intent === "delete") {
          try { window.localStorage.removeItem(userDraftStorageKey(draftOwnerId, week.id, result.boardId)); } catch { /* Storage is optional. */ }
        }
        router.refresh();
        if (input.intent === "create" && result.boardId) onOpen(result.boardId);
      }
    });
  }

  return <section className="player-boards" aria-labelledby="your-boards-title">
    <header className="board-list-intro"><p className="week-label">{week.label} Pick’em</p><h1 id="your-boards-title">Your weekly lineup</h1><div className="deadline-marker"><span>{week.isLocked ? "Locked" : "Locks"} · {week.deadlineLabel}</span></div><p>{week.boardSettings.multipleBoardsEnabled ? `Up to ${limit} boards. Your best eligible board counts each week.` : "One eligible board per player, per week."}</p></header>
    {!week.boardSettings.multipleBoardsEnabled && archived.length > 0 && <div className="board-notice" role="status"><strong>Multiple boards are off.</strong> Board 1 remains eligible. Extra boards are archived and excluded from scoring.</div>}
    <div className="board-list-content"><header className="board-list-heading"><h2>Your boards</h2><span>{active.length} / {limit} used</span></header>
      {active.length === 0 && <p className="board-empty">{week.isLocked ? "You did not create a board for this week." : "Create your first board to start picking."}</p>}
      {active.map(board => <article className="player-board-row" key={board.id}>
        <span className="player-board-number">{String(board.boardNumber).padStart(2, "0")}</span>
        <div className="player-board-identity"><h3>{board.boardName}</h3><p>{board.status === "disqualified" ? "Disqualified" : board.currentVersionNumber > 0 ? "✓ Submitted" : `${Object.keys(board.draftPicks).length} of ${week.games.length} picks · Draft`} · {week.seasonPhase === "preseason" ? "Tiebreaker" : "Monday"} {board.mondayPrediction ?? "—"}</p></div>
        <button className="board-open" type="button" onClick={() => onOpen(board.id)}>{board.currentVersionNumber > 0 || week.isLocked ? "View" : "Continue"} →</button>
        {board.status !== "disqualified" && <div className="board-actions player-board-tools"><button type="button" disabled={!editable} onClick={() => openForm("rename", board)}>Rename</button>{week.boardSettings.multipleBoardsEnabled && <button type="button" disabled={!canCreate} onClick={() => openForm("create", board)}>Copy board</button>}{board.boardNumber !== 1 && board.currentVersionNumber === 0 && <button type="button" disabled={!editable} onClick={() => openForm("delete", board)}>Delete draft</button>}</div>}
      </article>)}
      {!week.isLocked && <button className="board-primary board-create" type="button" disabled={!canCreate} onClick={() => openForm("create")}>{active.length >= limit ? "Board limit reached" : "+ Create a board"}</button>}
      {form && <form className="board-form" onSubmit={saveForm} aria-label={form.intent === "delete" ? "Delete draft" : form.intent === "rename" ? "Rename board" : "Create board"}><h3>{form.intent === "delete" ? "Delete this draft?" : form.intent === "rename" ? "Name your board" : "Create a board"}</h3>{form.intent === "delete" ? <p>{form.board?.boardName} will be deleted. Submitted boards and Board 1 are protected.</p> : <><label>Board name<input autoFocus required maxLength={40} value={name} onChange={event => setName(event.target.value)} disabled={pending} /></label>{form.intent === "create" && <label>Start with<select value={sourceId} onChange={event => setSourceId(event.target.value)} disabled={pending}><option value="">A blank board</option>{active.filter(board => board.status !== "disqualified").map(board => <option key={board.id} value={board.id}>Copy {board.boardName}</option>)}</select></label>}</>}<div className="board-actions"><button className="board-primary" type="submit" disabled={pending}>{pending ? "Saving…" : form.intent === "delete" ? "Delete draft" : form.intent === "rename" ? "Save name" : "Create draft"}</button><button type="button" disabled={pending} onClick={() => setForm(null)}>Cancel</button></div></form>}
      <p className="board-status" role="status">{message}</p>
      {archived.length > 0 && <details className="board-archive"><summary>Archived boards ({archived.length})</summary><p>Saved for your records. These boards cannot be edited and do not count toward standings.</p>{archived.map(board => <div className="player-board-row" key={board.id}><span className="player-board-number">{String(board.boardNumber).padStart(2, "0")}</span><div className="player-board-identity"><h3>{board.boardName}</h3><p>Archived · Excluded from scoring</p></div><button className="board-open" type="button" onClick={() => onOpen(board.id)}>View →</button></div>)}</details>}
    </div><footer className="board-list-footer">Each board has its own picks, submission, and tiebreaker prediction.</footer>
  </section>;
}
