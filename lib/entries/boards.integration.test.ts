import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
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
