# Native admin

The native Admin hub is an **Operate** surface: task-first commissioner tools reached through **Profile → Admin tools**, shown only for administrator accounts. It extends the existing field-green/paper SwiftUI `Form` and `List` screens, system navigation, Dynamic Type, and confirmations. This scoped extension does not replace the app's visual system or the web commissioner dashboard.

## Feature coverage

| Task | Native behavior | Boundary |
| --- | --- | --- |
| Player approvals | Search by name or verified email; filter pending accounts; approve or remove access with confirmation. | Latest 100 accounts only; the pending count/search cover that loaded set. Administrator accounts and the current account are protected. |
| Announcements | List the latest 20; create/edit private drafts; schedule or publish with confirmation; archive with confirmation. | Archived messages cannot be edited. The server rejects overlapping published display windows. |
| Everyone's pick cards | Select a published week, search players, and see submitted/not-submitted/disqualified counts. After lock, open official versions, selections, Monday totals, and grading. | Read-only; uses the existing web reveal policy. Being an admin does not reveal official selections or Monday totals before the deadline. |
| Operations & privacy | View score/odds-feed health, last checks, active alerts, email configuration status, and pending privacy requests. | Read-only. Loading this screen does not sync scores, send watchdog email, or process deletion requests. |
| Weeks, publication, and scores | “Manage weeks & scores · Web” / “Score controls · Web.” | Browser opens `/admin/weeks`; existing publishing and game-correction safeguards remain there. |
| Schedule imports | “Import season schedule · Web.” | Browser opens `/admin/weeks/import`; no native import action. |
| Privacy processing and full settings | “Process privacy requests · Web” / “Full admin settings · Web.” | Browser opens `/admin`; deletion/anonymization and their confirmations remain web-only. |

Web links open `https://anygivenpick.app` in the browser and explicitly warn that another sign-in may be required. They are handoffs, not native feature parity or a shared-session promise.

## Behavior and security

- `GET /api/mobile/v1/admin` accepts `view=users|announcements|picks|operations` and an optional UUID `weekId`. `POST` accepts only validated access, announcement, and archive commands; the body limit is 8 KiB.
- Every request requires an authenticated Clerk session bearer token and a server-checked admin role. The client never supplies the acting user or their role. Responses are private/no-store and vary on authorization; per-admin rate limits are 120 reads or 30 writes per minute.
- Mutations reuse the existing web actions and their authorization, transactions, audit history, revalidation, and approval-email behavior. Access changes recheck verified email with Clerk, reject self/admin targets, and preserve records when removing access. Missing identity verification disables native access controls; server checks remain authoritative.
- Announcement titles require 3–80 characters and messages 3–500. The optional end must follow the start. Times are entered/displayed in the iPhone's time zone and sent as absolute timestamps. Saving a published message as a private draft removes it from player view.
- Data screens refresh on entry, pull-to-refresh, and return to the foreground. Week changes clear the prior payload, and stale responses are ignored. Mutations disable controls while saving, show the server result, and reload current data. An unconfirmed write requires a refresh before retrying; an uncertain editor save directs the admin back to the list to check for duplicates.
- The existing device-local app lock remains separate from account authentication and server authorization. This extension does not change the Face ID behavior documented in the [iOS README](../ios/README.md#face-id-app-unlock).

## Implementation locations

- Native hub, forms, report views, models, and isolated fixtures: `ios/AnyGivenPick/Features/Admin/`.
- Entry point: `ios/AnyGivenPick/Features/Profile/ProfileView.swift`; authenticated transport: `ios/AnyGivenPick/Services/APIClient.swift`.
- API boundary and tests: `app/api/mobile/v1/admin/route.ts` and `route.test.ts`.
- Shared rules/services: `lib/admin/`, `app/admin/user-access-actions.ts`, and `app/admin/announcement-actions.ts`.
- Native coverage: `ios/AnyGivenPickTests/AdminTests.swift`.

## Verification and rollout status

September 24, 2026 local validation passed: 258 backend tests, 53 native tests, TypeScript checking, lint, the production web build, and iOS Debug and Release simulator builds. After the final presentation cleanup, the 14 admin API tests, TypeScript, and lint passed again. Manual simulator checks covered the standard layout, 320pt width with accessibility2 text, and confirmation dialogs. The scoped finish review approved the paper/green styling and explicit character-limit/date-window guidance. These were isolated fixtures, not real production admin actions. The source-style detector reported no findings; simulator inspection remains the UI evidence for SwiftUI.

DEBUG launch argument `-preview-admin` opens the hub fixture. Add one of `-admin-users`, `-admin-announcements`, `-admin-editor`, `-admin-picks`, `-admin-card`, or `-admin-operations` to open a task directly. Add `-admin-narrow` for 320pt, `-admin-large-type` for accessibility2, or `-admin-error` for a load failure. Fixture writes return “Preview only — no live data was changed.” Browser handoff links still target the real website; they are not fixture mutations.

No database migration is required for this extension. Deploy the updated backend first, then build/install/run the native app from Xcode; a web deployment cannot update the bundled iOS screens. Before release, verify a signed iPhone with authorized test accounts: admin versus non-admin access, real bearer authentication, refresh/retry behavior, confirmations, official-card visibility across the deadline, and browser sign-in handoffs. Only perform write checks against an explicitly authorized test environment/account.

No commit, push, deployment, TestFlight/App Store release, or physical-device installation was performed for this extension. Local checks do not establish production availability.
