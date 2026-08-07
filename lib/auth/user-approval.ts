import "server-only";

export function isUserApprovalRequired(): boolean {
  return process.env.USER_APPROVAL_REQUIRED !== "false";
}

export function getNewUserAccessDefaults() {
  return isUserApprovalRequired()
    ? {
        accountState: "read_only" as const,
        stateReason: "awaiting_admin_approval",
      }
    : {
        accountState: "active" as const,
        stateReason: "approval_not_required",
      };
}
