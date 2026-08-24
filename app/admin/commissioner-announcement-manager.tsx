"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CommissionerAnnouncement } from "@/lib/announcements/service";
import { archiveCommissionerAnnouncement, saveCommissionerAnnouncement, type AnnouncementActionResult } from "./announcement-actions";

const BUSINESS_TIME_ZONE = "America/Indiana/Indianapolis";

function toLocalDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIsoDateTime(localDate: string): string {
  if (!localDate) return "";
  const date = new Date(localDate);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function defaultStartTime(): string {
  const date = new Date();
  date.setSeconds(0, 0);
  return toLocalDateTime(date.toISOString());
}

function formatAnnouncementTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function CommissionerAnnouncementManager({ announcements }: { announcements: CommissionerAnnouncement[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [startsAt, setStartsAt] = useState(defaultStartTime);
  const [expiresAt, setExpiresAt] = useState("");
  const [result, setResult] = useState<AnnouncementActionResult | null>(null);
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const editingAnnouncement = announcements.find((announcement) => announcement.id === editingId) ?? null;
  const publishedCount = announcements.filter((announcement) => announcement.status === "published").length;

  function resetForm(clearResult = true) {
    setEditingId(null);
    setTitle("");
    setBody("");
    setStartsAt(defaultStartTime());
    setExpiresAt("");
    if (clearResult) setResult(null);
  }

  function editAnnouncement(announcement: CommissionerAnnouncement) {
    setEditingId(announcement.id);
    setTitle(announcement.title);
    setBody(announcement.body);
    setStartsAt(toLocalDateTime(announcement.startsAt));
    setExpiresAt(announcement.expiresAt ? toLocalDateTime(announcement.expiresAt) : "");
    setResult(null);
    document.getElementById("commissioner-announcement-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function save(intent: "save_draft" | "publish") {
    setResult(null);
    startTransition(async () => {
      try {
        const nextResult = await saveCommissionerAnnouncement({
          id: editingId ?? undefined,
          title,
          body,
          startsAt: toIsoDateTime(startsAt),
          expiresAt: toIsoDateTime(expiresAt),
          intent,
        });
        setResult(nextResult);
        if (nextResult.ok) {
          resetForm(false);
          setResult(nextResult);
          router.refresh();
        }
      } catch {
        setResult({ ok: false, message: "The announcement could not be saved. Confirm your admin access and try again." });
      }
    });
  }

  function archive(id: string) {
    setResult(null);
    startTransition(async () => {
      try {
        const nextResult = await archiveCommissionerAnnouncement(id);
        setResult(nextResult);
        if (nextResult.ok) {
          setArchiveConfirmId(null);
          if (editingId === id) resetForm(false);
          setResult(nextResult);
          router.refresh();
        }
      } catch {
        setResult({ ok: false, message: "The announcement could not be archived. Try again." });
      }
    });
  }

  const canSave = title.trim().length >= 3 && body.trim().length >= 3 && Boolean(toIsoDateTime(startsAt));

  return (
    <section className="admin-announcements" aria-labelledby="commissioner-announcements-title">
      <header className="admin-announcements__heading">
        <div>
          <h2 id="commissioner-announcements-title">Commissioner announcements</h2>
          <p>Post one clear update to every player&apos;s Home screen now or schedule it for later.</p>
        </div>
        <strong>{publishedCount} published</strong>
      </header>

      <div className="admin-announcements__workspace">
        <form id="commissioner-announcement-form" className="admin-announcement-form" onSubmit={(event) => event.preventDefault()}>
          <div className="admin-announcement-form__title">
            <h3>{editingAnnouncement ? "Edit the announcement" : "Write an announcement"}</h3>
            {editingAnnouncement ? <button type="button" onClick={() => resetForm()}>Cancel edit</button> : null}
          </div>
          <label>
            <span>Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="Week 3 schedule update" disabled={isPending} />
          </label>
          <label>
            <span>Message</span>
            <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={500} rows={5} placeholder="Tell players what changed and what they need to do." disabled={isPending} />
            <small>{body.length}/500</small>
          </label>
          <div className="admin-announcement-form__times">
            <label><span>Show starting</span><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} disabled={isPending} /></label>
            <label><span>Stop showing <small>optional</small></span><input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} disabled={isPending} /></label>
          </div>
          <p className="admin-announcement-form__timezone">Enter times in this device&apos;s time zone. The board labels them in Indianapolis time; every player receives the same start and stop instants.</p>
          <div className="admin-announcement-form__actions">
            {editingAnnouncement?.status === "published" ? null : (
              <button type="button" className="admin-announcement-button admin-announcement-button--secondary" onClick={() => save("save_draft")} disabled={isPending || !canSave}>Save draft</button>
            )}
            <button type="button" className="admin-announcement-button" onClick={() => save("publish")} disabled={isPending || !canSave}>
              {isPending ? "Saving…" : editingAnnouncement?.status === "published" ? "Update live notice" : "Publish or schedule"}
            </button>
          </div>
          <p className={`admin-announcement-result admin-announcement-result--${result?.ok ? "success" : "error"}`} aria-live="polite">{result?.message}</p>
        </form>

        <div className="admin-announcement-ledger">
          <h3>Announcement board</h3>
          {announcements.length === 0 ? <p className="admin-announcement-ledger__empty">No announcements have been written yet.</p> : announcements.map((announcement) => (
            <article className={`admin-announcement-row admin-announcement-row--${announcement.displayState}`} key={announcement.id}>
              <header><strong>{announcement.title}</strong><span>{announcement.displayState}</span></header>
              <p>{announcement.body}</p>
              <small>
                Starts {formatAnnouncementTime(announcement.startsAt)}
                {announcement.expiresAt ? ` · Ends ${formatAnnouncementTime(announcement.expiresAt)}` : " · No end time"}
              </small>
              {announcement.status !== "archived" ? (
                <div className="admin-announcement-row__actions">
                  <button type="button" onClick={() => editAnnouncement(announcement)} disabled={isPending}>Edit</button>
                  {archiveConfirmId === announcement.id ? (
                    <><button type="button" className="admin-announcement-row__archive" onClick={() => archive(announcement.id)} disabled={isPending}>Confirm archive</button><button type="button" onClick={() => setArchiveConfirmId(null)} disabled={isPending}>Cancel</button></>
                  ) : <button type="button" className="admin-announcement-row__archive" onClick={() => setArchiveConfirmId(announcement.id)} disabled={isPending}>Archive</button>}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
