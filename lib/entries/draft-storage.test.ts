import { describe, expect, it } from "vitest";
import { unscopedDraftStorageKeys, userDraftStorageKey } from "./draft-storage";

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
});
