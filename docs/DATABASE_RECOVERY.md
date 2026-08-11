# Database recovery procedure

Use this runbook when Any Given Pick data is missing, corrupted, or changed unexpectedly. Brian Howard / Droidan1 is the incident lead unless another owner is explicitly assigned.

## Recovery objectives

- Preserve the last known-good state before making more changes.
- Restore identities, profiles, contest weeks, games, entries, and audit history together so references remain consistent.
- Never copy database URLs, birth dates, location results, profile details, or player picks into public tickets or chat.
- Treat Neon retention and recovery-point availability as configuration-dependent. Confirm the production project's current retention window in Neon before every beta release.

## First response

1. Record the incident start time, the first known bad time, the affected pages, and the latest known-good time.
2. Stop any manual imports, score edits, schema migrations, and account-deletion completions.
3. If writes could make the incident worse, enable a maintenance response or temporarily stop the affected workflow. Do not delete the current production branch.
4. Preserve Vercel runtime logs and the Admin settings operations alert fingerprint. Do not include player data in the incident notes.
5. Before restoring, export the current completed-deletion tombstones (`privacy_requests.id`, internal `user_id`, and `completed_at`) to an encrypted, access-restricted incident file. This is a recovery control, not a general data export. If Postgres is unavailable, use Clerk as the identity-deletion authority during the reconciliation step below.
6. Confirm whether the problem is limited to the application, a score provider, or Postgres before restoring data.

## Restore with Neon

1. Open the production Neon project and select **Backup & Restore**.
2. Choose a restore point immediately before the first known bad write. Use the configured history or an existing snapshot; do not assume a particular retention period.
3. Preview the restore point or create a temporary restore branch when that option is available. Keep production unchanged while verifying.
4. Connect a local or isolated Preview deployment to the restored branch using a newly pulled `DATABASE_URL`.
5. Run `npm run db:verify`, then compare counts and representative records for users, profiles, contest weeks, games, entries, entry versions, privacy requests, and audit events. Do not export live rows into documentation.
6. Reconcile deletions before any restored deployment can accept writes. Reapply anonymization for every user in the encrypted tombstone export. Then compare every restored, non-anonymized `clerk_user_id` with Clerk; a confirmed Clerk 404 must be quarantined and anonymized in Postgres before proceeding. A Clerk timeout or authorization error is not proof of deletion and must stop the recovery.
7. Test sign-in, the home page, a non-destructive draft save, Admin settings, score health, and `/api/health` against the restored branch.
8. After the incident lead approves the restore point and deletion reconciliation is complete, use Neon restore-to-primary when available. If recovery requires replacing the primary branch, update the Vercel `DATABASE_URL` and `DATABASE_URL_UNPOOLED` values and redeploy.
9. Confirm the production schema migration journal matches the deployed commit before re-enabling imports, score updates, or privacy completions.

## Validation after restore

1. Confirm `/api/health` reports `ok` or a score-only warning that is understood.
2. Sign in with an administrator account and verify Player access, Privacy requests, Operations monitor, Contest weeks, and Player picks.
3. Confirm every completed deletion from the tombstone export is still anonymized and every remaining Clerk identity resolves successfully.
4. Check that the newest official entry versions and game finals match the selected recovery point.
5. Run one authorized score sync and verify its timestamp and update counts in Admin settings.
6. Re-enable paused workflows one at a time and watch Vercel logs and operational alerts for at least one complete request cycle.
7. Write a private incident summary with the root cause, exact recovery point, validation owner, data-loss window, and follow-up action. Do not include personal data.

## Prevention and drills

- Create a manual Neon snapshot before every production schema migration when the current Neon plan supports it.
- Run a restore drill at least monthly during the beta using a temporary branch and non-production Vercel environment.
- Keep migrations committed and additive where practical; never edit an already-applied migration.
- Rotate database credentials if they may have been exposed, then update Vercel and redeploy.
- Review the Neon retention setting, Vercel environment scope, and this runbook before the regular season begins.
