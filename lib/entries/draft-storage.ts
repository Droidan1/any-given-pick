const LEGACY_GLOBAL_DRAFT_KEY = "any-given-pick-draft:v1";

export function userDraftStorageKey(userId: string, weekId: string) {
  return `any-given-pick-draft:v3:${userId}:${weekId}`;
}

export function unscopedDraftStorageKeys(weekId: string) {
  return [LEGACY_GLOBAL_DRAFT_KEY, `any-given-pick-draft:v2:${weekId}`];
}
