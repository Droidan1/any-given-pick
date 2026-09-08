"use client";

import { useState, useTransition } from "react";
import { updateBoardSettings } from "./board-settings-actions";
import { boardLimit, type BoardSettings } from "@/lib/entries/board-rules";

export function BoardSettingsForm({ settings }: { settings: BoardSettings }) {
  const [saved, setSaved] = useState(settings);
  const [enabled, setEnabled] = useState(settings.multipleBoardsEnabled);
  const [limit, setLimit] = useState(String(settings.maxBoards));
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const changed = enabled !== saved.multipleBoardsEnabled || Number(limit) !== saved.maxBoards;

  function save(confirmed: boolean) {
    const maxBoards = Number(limit);
    if (!Number.isInteger(maxBoards) || maxBoards < 2 || maxBoards > 2147483647) {
      setMessage("Enter a whole-number limit of 2 or more.");
      return;
    }
    if (!confirmed && boardLimit({ multipleBoardsEnabled: enabled, maxBoards, revision: saved.revision }) < boardLimit(saved)) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      const result = await updateBoardSettings({ multipleBoardsEnabled: enabled, maxBoards, revision: saved.revision, confirmed });
      setMessage(result.message);
      if (result.ok && result.settings) {
        setSaved(result.settings);
        setConfirming(false);
      }
    });
  }

  return <section className="board-settings" aria-labelledby="board-settings-title">
    <header className="admin-settings-section-heading"><div><h2 id="board-settings-title">Boards per player</h2><p>Set one rule for everyone, across every contest week.</p></div></header>
    <form onSubmit={event => { event.preventDefault(); save(false); }}>
      <fieldset disabled={pending} className="board-mode-options">
        <legend>Pick’em boards</legend>
        <label className={!enabled ? "board-mode-selected" : ""}><input type="radio" name="board-mode" checked={!enabled} onChange={() => { setEnabled(false); setConfirming(false); }} /><span><strong>One board</strong><small>One set of picks each week</small></span></label>
        <label className={enabled ? "board-mode-selected" : ""}><input type="radio" name="board-mode" checked={enabled} onChange={() => { setEnabled(true); setConfirming(false); }} /><span><strong>Multiple boards</strong><small>You set the limit. Their best board counts.</small></span></label>
      </fieldset>
      <label className="board-limit-field"><span>Maximum boards<small>Total per player, per week</small></span><input type="number" aria-label="Maximum boards per player" min={2} max={2147483647} step={1} value={limit} disabled={!enabled || pending} onChange={event => { setLimit(event.target.value); setConfirming(false); }} /></label>
      <div className="board-setting-rules"><p><strong>Best board counts.</strong> Each player has one position in the standings, using their best eligible board each week. Each board has its own tiebreaker prediction.</p><p><strong>Changes apply immediately.</strong> Turning multiple boards off keeps Board 1 and archives all extras. Reducing the limit keeps the earliest boards. Archived boards are excluded from scoring, including previous weeks, and remain archived if you raise the limit again.</p></div>
      {confirming ? <div className="board-confirm" role="alert"><h3>{enabled ? "Reduce the board limit?" : "Turn multiple boards off?"}</h3><p>{enabled ? `Keep the earliest ${limit} boards per player and archive any extras.` : "Keep Board 1 eligible. Archive every extra board immediately."} This changes current and historical standings. Saved picks remain available in the archive.</p><div className="board-actions"><button className="board-primary" type="button" disabled={pending} onClick={() => save(true)}>{pending ? "Applying…" : "Apply now"}</button><button type="button" disabled={pending} onClick={() => setConfirming(false)}>Cancel</button></div></div> : <button className="board-primary" disabled={pending || !changed} type="submit">{pending ? "Saving…" : "Save settings"} →</button>}
      <p className="board-status" role="status">{message}</p>
    </form>
  </section>;
}
