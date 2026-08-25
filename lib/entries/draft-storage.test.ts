import { describe, expect, it, vi } from "vitest";
import {
  submissionAttemptForSignature,
  shouldRestoreLocalDraft,
  unscopedDraftStorageKeys,
  userDraftStorageKey,
} from "./draft-storage";

describe("pick draft storage", () => {
  it("keeps drafts for different users separate on the same week", () => {
    expect(userDraftStorageKey("user-a", "week-1")).not.toBe(
      userDraftStorageKey("user-b", "week-1"),
    );
  });

  it("keeps weeks separate for the same user", () => {
    expect(userDraftStorageKey("user-a", "week-1")).not.toBe(
      userDraftStorageKey("user-a", "week-2"),
    );
  });

  it("identifies the old account-agnostic keys for removal", () => {
    expect(unscopedDraftStorageKeys("week-1")).toEqual([
      "any-given-pick-draft:v1",
      "any-given-pick-draft:v2:week-1",
    ]);
  });

  it("reuses a submission key only while the reviewed payload is unchanged", () => {
    const createKey = vi.fn()
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
    const first = submissionAttemptForSignature(null, "draft-a", createKey);
    const retry = submissionAttemptForSignature(first, "draft-a", createKey);
    const edited = submissionAttemptForSignature(retry, "draft-b", createKey);

    expect(retry).toEqual(first);
    expect(edited.key).not.toBe(first.key);
    expect(createKey).toHaveBeenCalledTimes(2);
  });

  it("refuses to restore a local draft older than the server revision", () => {
    expect(shouldRestoreLocalDraft(3, 4)).toBe(false);
    expect(shouldRestoreLocalDraft(4, 4)).toBe(true);
  });
});
