import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { resetPlayerBoard } from "@/app/admin/picks/reset-board-action";
import { manageBoard } from "@/app/board-actions";
import { saveEntryDraft, submitEntry } from "@/app/entry-actions";
import { updateBoardSettings } from "@/app/admin/board-settings-actions";
import { buildLiveWeekRace } from "@/lib/race/rules";
import { buildWeeklyRecap } from "@/lib/recap/rules";
import { getCurrentPlayerWeek, getLivePlayerPicks } from "./service";
import { getPlayerActivity } from "./activity-service";
import { getSeasonStandings } from "@/lib/standings/service";
import { getWeeklyResults } from "@/lib/results/service";
import { getAdminPicksBoard } from "@/lib/admin/picks";

const context = vi.hoisted(() => ({ db: null as unknown, userId: "", eligible: true }));
vi.mock("@/lib/db", () => ({ getDb: () => context.db }));
vi.mock("@/lib/auth/app-user", () => ({ requireAppUser: async () => ({ id: context.userId }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/monitoring/operational-alerts", () => ({ reportOperationalIssue: vi.fn() }));
vi.mock("@/lib/email/player-notifications", () => ({ queueAndProcessSubmissionConfirmation: vi.fn() }));
vi.mock("@/lib/push/player-notifications", () => ({ queueAndProcessSubmissionPush: vi.fn() }));
vi.mock("@/lib/eligibility/authorize", () => {
  class ParticipationForbiddenError extends Error {}
  return { ParticipationForbiddenError, requireParticipationEligibility: async () => {
    if (!context.eligible) throw new ParticipationForbiddenError();
    return { reason: "eligible", locationResult: "in_state", locationCheckedAt: new Date().toISOString() };
  } };
});

let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
const adminId = "10000000-0000-4000-8000-000000000001";
const otherId = "10000000-0000-4000-8000-000000000002";
const weekId = "20000000-0000-4000-8000-000000000001";
const gameId = "30000000-0000-4000-8000-000000000001";
let migratedLegacy: { board_number: number; board_name: string; archived_at: unknown; draft_picks: unknown };

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  context.db = db;
  const journal = JSON.parse(readFileSync(resolve("drizzle/meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  for (const migration of journal.entries) {
    if (migration.tag === "0018_multiple_boards") {
      await client.exec(`INSERT INTO users (id,clerk_user_id) VALUES ('${adminId}','legacy');
        INSERT INTO contest_weeks (id,season,week_number,entry_deadline,created_by_user_id) VALUES ('${weekId}',2026,1,now(),'${adminId}');
        INSERT INTO contest_entries (contest_week_id,user_id,draft_picks) VALUES ('${weekId}','${adminId}','{"legacy":"IND"}');`);
    }
    await client.exec(readFileSync(resolve(`drizzle/${migration.tag}.sql`), "utf8"));
  }
  migratedLegacy = (await client.query<typeof migratedLegacy>("SELECT board_number,board_name,archived_at,draft_picks FROM contest_entries")).rows[0];
});

beforeEach(async () => {
  await client.exec("TRUNCATE users CASCADE; UPDATE board_settings SET multiple_boards_enabled=false, max_boards=4, revision=0;");
  context.userId = adminId;
  context.eligible = true;
  await db.insert(schema.users).values([{ id: adminId, clerkUserId: "admin", accountState: "active" }, { id: otherId, clerkUserId: "other", accountState: "active" }]);
  await db.insert(schema.profiles).values([adminId, otherId].map((userId, index) => ({ userId, displayName: index ? "Other" : "Admin", normalizedDisplayName: index ? "other" : "admin", birthDate: "1990-01-01", ageEligible: true, ageCheckedAt: new Date(), displayNameChangedAt: new Date() })));
  const [role] = await db.insert(schema.roles).values({ key: "admin", description: "Admin" }).onConflictDoNothing().returning();
  const roleId = role?.id ?? (await db.select().from(schema.roles).where(eq(schema.roles.key, "admin")))[0].id;
  await db.insert(schema.userRoles).values({ userId: adminId, roleId });
  await db.insert(schema.contestWeeks).values({ id: weekId, season: 2026, weekNumber: 1, status: "published", entryDeadline: new Date(Date.now() + 3_600_000), createdByUserId: adminId });
  await db.insert(schema.games).values({ id: gameId, contestWeekId: weekId, kickoffAt: new Date(), awayTeamCode: "IND", awayTeamName: "Indianapolis", homeTeamCode: "CHI", homeTeamName: "Chicago", status: "final", awayScore: 24, homeScore: 17, isMondayTiebreaker: true, sortOrder: 1 });
});
afterAll(async () => { await client?.close(); });

async function enable(maxBoards = 3) {
  const [settings] = await db.select().from(schema.boardSettings);
  const result = await updateBoardSettings({ multipleBoardsEnabled: true, maxBoards, revision: settings.revision, confirmed: true });
  expect(result.ok).toBe(true);
}
async function create(name = "Board") {
  const result = await manageBoard({ intent: "create", weekId, name });
  expect(result.ok, result.message).toBe(true);
  return result.boardId!;
}
async function submit(boardId: string, team = "IND", mondayPrediction = 41, submissionKey = crypto.randomUUID()) {
  const [entry] = await db.select().from(schema.contestEntries).where(eq(schema.contestEntries.id, boardId));
  return submitEntry({ baseDraftRevision: entry?.draftRevision ?? 0, weekId, boardId, picks: { [gameId]: team }, mondayPrediction, submissionKey });
}

describe("board actions against PostgreSQL", () => {
  it("migrates legacy picks to Board 1 and leaves multiple boards disabled", async () => {
    expect(migratedLegacy).toEqual({ board_number: 1, board_name: "Board 1", archived_at: null, draft_picks: { legacy: "IND" } });
    expect((await db.select().from(schema.boardSettings))[0].multipleBoardsEnabled).toBe(false);
  });
  it("enforces the cap for overlapping creation requests", async () => {
    await enable(2);
    const results = await Promise.all([1, 2, 3, 4].map(n => manageBoard({ intent: "create", weekId, name: `Board ${n}` })));
    expect(results.filter(result => result.ok)).toHaveLength(2);
    expect(await db.select().from(schema.contestEntries)).toHaveLength(2);
  });
  it("copies picks and tiebreaker into an independent unsubmitted draft", async () => {
    await enable();
    const id = await create("Original");
    expect((await submit(id, "IND", 47)).ok).toBe(true);
    const copy = await manageBoard({ intent: "create", weekId, name: "Copy", copyFromId: id });
    const [row] = await db.select().from(schema.contestEntries).where(eq(schema.contestEntries.id, copy.boardId!));
    expect(row).toMatchObject({ draftPicks: { [gameId]: "IND" }, draftMondayPrediction: 47, status: "draft", currentVersionNumber: 0, submittedAt: null });
    await saveEntryDraft({ baseDraftRevision: 0, boardId: row.id, weekId, picks: { [gameId]: "CHI" }, mondayPrediction: 35 });
    expect((await db.select().from(schema.contestEntries).where(eq(schema.contestEntries.id, id)))[0].draftPicks).toEqual({ [gameId]: "IND" });
  });
  it("rejects cross-user edits, copies, deletion, and submission", async () => {
    await enable();
    const id = await create();
    context.userId = otherId;
    expect((await manageBoard({ intent: "rename", weekId, boardId: id, name: "Stolen" })).ok).toBe(false);
    expect((await manageBoard({ intent: "delete", weekId, boardId: id })).ok).toBe(false);
    expect((await manageBoard({ intent: "create", weekId, name: "Copy", copyFromId: id })).ok).toBe(false);
    expect((await submit(id)).ok).toBe(false);
    expect((await saveEntryDraft({ baseDraftRevision: 0, weekId, boardId: id, picks: {}, mondayPrediction: 0 })).ok).toBe(false);
  });
  it("requires admin access, confirmation, and the latest settings revision", async () => {
    context.userId = otherId;
    await expect(updateBoardSettings({ multipleBoardsEnabled: true, maxBoards: 3, revision: 0, confirmed: true })).rejects.toThrow("ADMIN_REQUIRED");
    context.userId = adminId;
    await enable();
    expect((await updateBoardSettings({ multipleBoardsEnabled: false, maxBoards: 3, revision: 1, confirmed: false })).ok).toBe(false);
    expect((await updateBoardSettings({ multipleBoardsEnabled: false, maxBoards: 3, revision: 0, confirmed: true })).ok).toBe(false);
  });
  it("preserves Board 1 and immediately blocks writes, scoring, and creation after shutoff", async () => {
    await enable();
    const first = await create("First");
    const extra = await create("Extra");
    expect((await submit(first, "CHI")).ok).toBe(true);
    expect((await submit(extra, "IND")).ok).toBe(true);
    expect((await getSeasonStandings()).rows[0].correctPicks).toBe(1);
    expect((await updateBoardSettings({ multipleBoardsEnabled: false, maxBoards: 3, revision: 1, confirmed: true })).ok).toBe(true);
    expect((await getSeasonStandings()).rows[0].correctPicks).toBe(0);
    expect((await submit(extra)).ok).toBe(false);
    expect((await saveEntryDraft({ baseDraftRevision: 0, weekId, boardId: extra, picks: {}, mondayPrediction: 0 })).ok).toBe(false);
    expect((await manageBoard({ intent: "create", weekId, name: "Blocked" })).ok).toBe(false);
    const week = await getCurrentPlayerWeek(adminId);
    expect(week?.entries.find(entry => entry.id === first)?.archivedAt).toBeNull();
    expect(week?.entries.find(entry => entry.id === extra)?.archivedAt).toBeTruthy();
    expect((await getPlayerActivity(adminId)).cards.find(card => card.id === extra)?.state).toBe("archived");
    await enable();
    expect((await getCurrentPlayerWeek(adminId))?.entries.find(entry => entry.id === extra)?.archivedAt).toBeTruthy();
  });
  it("only allows deletion of unsubmitted extra drafts, and does not reuse an occupied board number", async () => {
    await enable(4);
    const first = await create();
    const second = await create();
    const third = await create();
    expect((await manageBoard({ intent: "delete", weekId, boardId: first })).ok).toBe(false);
    expect((await manageBoard({ intent: "delete", weekId, boardId: second })).ok).toBe(true);
    const fourth = await create();
    expect((await db.select().from(schema.contestEntries).where(eq(schema.contestEntries.id, fourth)))[0].boardNumber).toBe(4);
    await submit(third);
    expect((await manageBoard({ intent: "delete", weekId, boardId: third })).ok).toBe(false);
  });
  it("rejects board mutations and submissions after lock and while ineligible", async () => {
    const id = await create();
    context.eligible = false;
    expect((await manageBoard({ intent: "rename", weekId, boardId: id, name: "No" })).ok).toBe(false);
    expect((await submit(id)).code).toBe("ineligible");
    context.eligible = true;
    await db.update(schema.contestWeeks).set({ entryDeadline: new Date(Date.now() - 1000) });
    expect((await manageBoard({ intent: "rename", weekId, boardId: id, name: "Late" })).ok).toBe(false);
    expect((await submit(id)).code).toBe("deadline_passed");
  });
  it("keeps receipts board-specific and reveals all eligible boards only after lock", async () => {
    await enable();
    const first = await create("First");
    const second = await create("Second");
    const key = crypto.randomUUID();
    const result = await submit(first, "IND", 50, key);
    expect((await submit(first, "IND", 50, key)).receipt).toEqual(result.receipt);
    expect((await submit(second, "CHI", 30, key)).ok).toBe(false);
    expect((await submit(second, "IND", 41)).ok).toBe(true);
    expect((await getWeeklyResults({ currentUserId: adminId })).entries).toHaveLength(0);
    expect((await getAdminPicksBoard({ currentUserId: adminId })).players.every(player => player.entry === null)).toBe(true);
    await db.update(schema.contestWeeks).set({ entryDeadline: new Date(Date.now() - 1000) });
    const results = await getWeeklyResults({ currentUserId: adminId });
    expect(results.entries).toHaveLength(2);
    expect(results.entries.filter(entry => entry.isBestBoard).map(entry => entry.entryId)).toEqual([second]);
    const standings = await getSeasonStandings();
    expect(standings.rows).toHaveLength(1);
    expect(standings.rows[0]).toMatchObject({ correctPicks: 1, gradedPicks: 1, tiebreakerDiff: 0 });
    expect((await getAdminPicksBoard({ currentUserId: adminId })).players.filter(player => player.entry).map(player => player.entry?.entryId)).toEqual(expect.arrayContaining([first, second]));
  });
  it("aggregates the best board separately each week, without adding extra boards to season points", async () => {
    await enable();
    const first = await create();
    const extra = await create();
    await submit(first, "IND");
    await submit(extra, "CHI");
    await db.update(schema.contestWeeks).set({ status: "locked" }).where(eq(schema.contestWeeks.id, weekId));
    const nextWeek = "20000000-0000-4000-8000-000000000002";
    const nextGame = "30000000-0000-4000-8000-000000000002";
    await db.insert(schema.contestWeeks).values({ id: nextWeek, season: 2026, weekNumber: 2, status: "published", entryDeadline: new Date(Date.now() + 3_600_000), createdByUserId: adminId });
    await db.insert(schema.games).values({ id: nextGame, contestWeekId: nextWeek, kickoffAt: new Date(), awayTeamCode: "IND", awayTeamName: "Indianapolis", homeTeamCode: "CHI", homeTeamName: "Chicago", status: "final", awayScore: 24, homeScore: 17, isMondayTiebreaker: true, sortOrder: 1 });
    for (const [index, team] of ["CHI", "IND"].entries()) {
      const board = await manageBoard({ intent: "create", weekId: nextWeek, name: `Week two board ${index + 1}` });
      expect((await submitEntry({ baseDraftRevision: 0, weekId: nextWeek, boardId: board.boardId, picks: { [nextGame]: team }, mondayPrediction: 41, submissionKey: crypto.randomUUID() })).ok).toBe(true);
    }
    expect((await getSeasonStandings()).rows[0]).toMatchObject({ correctPicks: 2, gradedPicks: 2, tiebreakerDiff: 0 });
    await updateBoardSettings({ multipleBoardsEnabled: false, maxBoards: 3, revision: 1, confirmed: true });
    expect((await getSeasonStandings()).rows[0]).toMatchObject({ correctPicks: 1, gradedPicks: 2 });
  });

  it("keeps recovered drafts and official receipts isolated for each board", async () => {
    await enable();
    const first = await create("Original");
    const extra = await create("Upsets");
    await submit(first, "IND", 41);
    await submit(extra, "CHI", 30);
    const loaded = await getCurrentPlayerWeek(adminId);
    expect(loaded?.entries.find(entry => entry.id === first)).toMatchObject({ officialPicks: { [gameId]: "IND" }, officialMondayPrediction: 41 });
    expect(loaded?.entries.find(entry => entry.id === extra)).toMatchObject({ officialPicks: { [gameId]: "CHI" }, officialMondayPrediction: 30 });
    const extraRevision = loaded!.entries.find(entry => entry.id === extra)!.draftRevision;
    const update = await saveEntryDraft({ weekId, boardId: extra, picks: { [gameId]: "IND" }, mondayPrediction: 45, baseDraftRevision: extraRevision });
    expect(update.ok).toBe(true);
    expect((await saveEntryDraft({ weekId, boardId: extra, picks: {}, mondayPrediction: null, baseDraftRevision: extraRevision })).code).toBe("draft_conflict");
    const after = await getCurrentPlayerWeek(adminId);
    expect(after?.entries.find(entry => entry.id === first)?.draftPicks).toEqual({ [gameId]: "IND" });
    expect(after?.entries.find(entry => entry.id === extra)?.officialPicks).toEqual({ [gameId]: "CHI" });
    expect((await getLivePlayerPicks(weekId))?.filter(entry => entry.userId === adminId)).toHaveLength(2);
    await updateBoardSettings({ multipleBoardsEnabled: false, maxBoards: 3, revision: 1, confirmed: true });
    expect((await getLivePlayerPicks(weekId))?.filter(entry => entry.userId === adminId).map(entry => entry.entryId)).toEqual([first]);
  });

  it("shows one best board per player in the live race and weekly recap", async () => {
    await enable();
    const first = await create("Original");
    const extra = await create("Winner");
    await submit(first, "CHI", 30);
    await submit(extra, "IND", 41);
    await db.update(schema.contestWeeks).set({ entryDeadline: new Date(Date.now() - 1000) });
    const results = await getWeeklyResults({ currentUserId: adminId });
    expect(buildLiveWeekRace(results).players).toHaveLength(1);
    expect(buildLiveWeekRace(results).players[0].correct).toBe(1);
    expect(buildWeeklyRecap(results)).toMatchObject({ fieldSize: 1, correctPicks: 1, rank: 1 });
  });

  it("reduces limits by active board order and records the change in the audit log", async () => {
    await enable(4);
    const ids = [await create(), await create(), await create(), await create()];
    await manageBoard({ intent: "delete", weekId, boardId: ids[1] });
    expect((await updateBoardSettings({ multipleBoardsEnabled: true, maxBoards: 2, revision: 1, confirmed: true })).ok).toBe(true);
    const rows = await db.select().from(schema.contestEntries);
    expect(rows.filter(row => !row.archivedAt).map(row => row.id)).toEqual([ids[0], ids[2]]);
    const audits = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.action, "boards.settings_changed"), eq(schema.auditEvents.actorUserId, adminId)));
    expect(audits.at(-1)?.metadata).toMatchObject({ next_limit: 2, archived_count: 1 });
  });
});


async function resetBoard(boardId: string, overrides: Partial<Parameters<typeof resetPlayerBoard>[0]> = {}) {
  const [entry] = await db.select().from(schema.contestEntries).where(eq(schema.contestEntries.id, boardId));
  return resetPlayerBoard({ boardId, expectedDraftRevision: entry?.draftRevision ?? 0, expectedVersionNumber: entry?.currentVersionNumber ?? 0, reason: "Player requested a fresh start", confirmed: true, ...overrides });
}

describe("administrator board reset", () => {
  it("requires an administrator and explicit confirmation", async () => {
    const id = await create();
    context.userId = otherId;
    await expect(resetBoard(id)).rejects.toThrow("ADMIN_REQUIRED");
    context.userId = adminId;
    expect((await resetBoard(id, { confirmed: false })).ok).toBe(false);
    expect((await db.select().from(schema.contestEntries))[0].resetRevision).toBe(0);
  });

  it("clears only the chosen board and preserves submissions, picks, identity, and an audit record", async () => {
    await enable();
    const first = await create("Original");
    const extra = await create("Second");
    await submit(first, "IND", 41);
    await submit(extra, "CHI", 30);
    const versions = await db.select().from(schema.entryVersions);
    const picks = await db.select().from(schema.entryVersionPicks);
    const [before] = await db.select().from(schema.contestEntries).where(eq(schema.contestEntries.id, first));
    const [untouched] = await db.select().from(schema.contestEntries).where(eq(schema.contestEntries.id, extra));
    expect((await resetBoard(first)).ok).toBe(true);
    const [after] = await db.select().from(schema.contestEntries).where(eq(schema.contestEntries.id, first));
    expect(after).toMatchObject({ id: first, boardName: "Original", boardNumber: 1, status: "draft", draftPicks: {}, draftMondayPrediction: null, currentVersionNumber: 0, submittedAt: null, draftRevision: before.draftRevision + 1, resetRevision: before.draftRevision + 1 });
    expect(after.lastResetAt).toBeTruthy();
    expect(await db.select().from(schema.entryVersions)).toEqual(versions);
    expect(await db.select().from(schema.entryVersionPicks)).toEqual(picks);
    expect((await db.select().from(schema.contestEntries).where(eq(schema.contestEntries.id, extra)))[0]).toEqual(untouched);
    expect((await getSeasonStandings()).rows[0].correctPicks).toBe(0);
    const card = (await getPlayerActivity(adminId)).cards.find(card => card.id === first)!;
    expect(card).toMatchObject({ versionNumber: 0, officialPicks: [], pickCount: 0 });
    expect(card.submissionHistory[0]).toMatchObject({ versionNumber: 1, isCurrent: false, voidedByReset: true, mondayPrediction: 41 });
    expect(card.submissionHistory[0].picks[0].selectedTeamCode).toBe("IND");
    const [audit] = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, "board.reset"));
    expect(audit).toMatchObject({ actorUserId: adminId, targetUserId: adminId, entityId: first, metadata: { previous_version_number: 1, reason: "Player requested a fresh start" } });
    expect((await getCurrentPlayerWeek(adminId))?.entries.find(entry => entry.id === first)).toMatchObject({ officialPicks: {}, officialMondayPrediction: null, resetRevision: after.resetRevision });
  });

  it("blocks old autosaves and submissions, then permits a fresh submission with a new version number", async () => {
    const id = await create();
    const key = crypto.randomUUID();
    await submit(id, "IND", 41, key);
    const [before] = await db.select().from(schema.contestEntries);
    await resetBoard(id);
    const stale = { weekId, boardId: id, picks: { [gameId]: "IND" }, mondayPrediction: 41, baseDraftRevision: before.draftRevision };
    expect((await saveEntryDraft(stale)).code).toBe("board_reset");
    expect((await submitEntry({ ...stale, submissionKey: key })).code).toBe("board_reset");
    expect((await submitEntry({ ...stale, submissionKey: crypto.randomUUID() })).code).toBe("board_reset");
    expect((await db.select().from(schema.contestEntries))[0].draftPicks).toEqual({});
    const fresh = await submit(id, "CHI", 30);
    expect(fresh.receipt).toMatchObject({ versionNumber: 2, action: "submit", mondayPrediction: 30 });
    expect((await submit(id, "IND", 41, key)).ok).toBe(false);
    const card = (await getPlayerActivity(adminId)).cards[0];
    expect(card.officialPicks[0].selectedTeamCode).toBe("CHI");
    expect(card.submissionHistory.map(version => [version.versionNumber, version.isCurrent, version.voidedByReset])).toEqual([[2, true, false], [1, false, true]]);
  });

  it("keeps post-reset receipts valid even when timestamps match the reset", async () => {
    const id = await create();
    await submit(id);
    await resetBoard(id);
    const [reset] = await db.select().from(schema.contestEntries);
    const key = crypto.randomUUID();
    await submit(id, "CHI", 30, key);
    await db.update(schema.entryVersions).set({ committedAt: reset.lastResetAt! }).where(eq(schema.entryVersions.versionNumber, 2));
    expect((await submit(id, "CHI", 30, key)).ok).toBe(true);
    const card = (await getPlayerActivity(adminId)).cards[0];
    expect(card.submissionHistory[0]).toMatchObject({ versionNumber: 2, isCurrent: true, voidedByReset: false });
    await resetBoard(id);
    await resetBoard(id);
    expect((await db.select().from(schema.contestEntries))[0].resetVersionNumber).toBe(2);
    expect((await submit(id, "CHI", 30, key)).ok).toBe(false);
  });

  it("rejects stale confirmations when either the draft or official version changed", async () => {
    const id = await create();
    await submit(id);
    const [before] = await db.select().from(schema.contestEntries);
    await submit(id);
    expect((await resetBoard(id, { expectedVersionNumber: before.currentVersionNumber })).ok).toBe(false);
    await saveEntryDraft({ weekId, boardId: id, picks: {}, mondayPrediction: null, baseDraftRevision: before.draftRevision });
    expect((await resetBoard(id, { expectedDraftRevision: before.draftRevision })).ok).toBe(false);
    expect((await db.select().from(schema.contestEntries))[0].lastResetAt).toBeNull();
  });

  it("refuses resets at or after the deadline and for closed weeks", async () => {
    const id = await create();
    await submit(id);
    await db.update(schema.contestWeeks).set({ entryDeadline: new Date() });
    expect((await resetBoard(id)).ok).toBe(false);
    await db.update(schema.contestWeeks).set({ entryDeadline: new Date(Date.now() + 3_600_000), status: "locked" });
    expect((await resetBoard(id)).ok).toBe(false);
    expect((await db.select().from(schema.contestEntries))[0].currentVersionNumber).toBe(1);
  });

  it("keeps archived and disqualified boards protected and reset history undeletable", async () => {
    await enable();
    await create();
    const extra = await create();
    await submit(extra);
    await resetBoard(extra);
    expect((await manageBoard({ intent: "delete", weekId, boardId: extra })).ok).toBe(false);
    await db.update(schema.contestEntries).set({ status: "disqualified" }).where(eq(schema.contestEntries.id, extra));
    expect((await resetBoard(extra)).ok).toBe(false);
    await updateBoardSettings({ multipleBoardsEnabled: false, maxBoards: 3, revision: 1, confirmed: true });
    expect((await resetBoard(extra)).ok).toBe(false);
  });
});
