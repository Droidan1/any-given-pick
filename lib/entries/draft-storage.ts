const LEGACY_GLOBAL_DRAFT_KEY = "any-given-pick-draft:v1";

export function userDraftStorageKey(userId: string, weekId: string) {
  return `any-given-pick-draft:v3:${userId}:${weekId}`;
}

export function unscopedDraftStorageKeys(weekId: string) {
  return [LEGACY_GLOBAL_DRAFT_KEY, `any-given-pick-draft:v2:${weekId}`];
}

export type SubmissionAttempt = {
  key: string;
  signature: string;
};

export function submissionAttemptForSignature(
  current: SubmissionAttempt | null,
  signature: string,
  createKey: () => string,
): SubmissionAttempt {
  return current?.signature === signature
    ? current
    : { key: createKey(), signature };
}

export function shouldRestoreLocalDraft(storedRevision: number, serverRevision: number): boolean {
  return storedRevision >= serverRevision;
}
