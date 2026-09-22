# iOS Live Activities

Three native activities, separate from ordinary iPhone alerts, email, and the PWA:

| Activity | Start | Finish |
| --- | --- | --- |
| Card deadline | 30 minutes before a published card's deadline, opted-in approved players without an official submission | Submitted card, deadline, preference disabled, or loss of access |
| Followed game | Player taps Follow game (within 7 hours of kickoff or during play; up to two followed games) | Final, canceled, postponed, Stop, or the 7.5-hour session limit |
| Daily week race | 10 minutes before the first actual kickoff on each Eastern game date, for opted-in players with an official card | That day's games finish, Stop, loss of access, or a fresh 7.5-hour segment on long days |

Game days use America/New_York, not a fixed UTC offset. Late games remain in their original kickoff date after midnight. Non-standard weekdays and overseas early kickoffs use the same schedule-derived logic. The rank is **projected**, using the existing Live Race scoring rules, not an official payout/winner determination.

## Release order

1. Back up the database using the existing recovery procedure, then apply **0019_live_activity_sessions.sql** (through the existing migration workflow). This is additive: two tables and nullable score clock/freshness columns. Do this before deploying code that selects the new game columns.
2. Deploy the backend with `LIVE_ACTIVITIES_ENABLED=false` initially. This preserves ordinary push, email, web, and native card behavior. Do not apply production migrations from a preview deployment.
3. Configure `LIVE_ACTIVITIES_ENABLED=true` only in the intended environment. Existing `APNS_ENABLED=true`, `APNS_TEAM_ID`, and the appropriate `APNS_SANDBOX_KEY_ID` / `APNS_SANDBOX_PRIVATE_KEY` or production equivalents are reused. No private key belongs in the iOS app, repository, or docs.
4. `vercel.json` includes a **once-per-minute** job for `/api/cron/live-activities`. Vercel Pro was verified before adding it; the existing score/email schedules remain unchanged. Vercel supplies `Authorization: Bearer <CRON_SECRET>`. While the feature flag is false, this job is a no-op. After activation, completed passes record a heartbeat in `provider_sync_states`; the existing Checkly `/api/health` monitor detects a failed or more-than-five-minute-old heartbeat. Health reads never send Live Activity notifications or forge a heartbeat. Checkly currently polls every ten minutes, so alert delivery is not immediate.
5. Build and install the new app from Xcode with the paid Apple team for both targets. Automatic starts require **iOS 17.2+**; manual following supports the app's iOS 17 minimum. Xcode Debug uses sandbox APNs; TestFlight/App Store use production APNs, which need production credentials.
6. In the app: **Profile → Live Activity settings → Enable Live Activities**. Choose deadline and daily-race preferences. **Home or Results → Follow a game** starts a game activity. Confirm connection and automatic-start token readiness in Settings.
7. Run the physical-device checks below before claiming real delivery is verified. Simulator compilation/UI previews do not prove APNs delivery or background wakeup.

Do not silently add a paid scheduler, run production migrations, or send production test notifications as part of a local build.

### No-send deployment check

An authenticated `GET /api/cron/live-activities?check=1` reports only `enabled`, `schemaReady`, `sandboxConfigured`, `productionConfigured`, and `scheduler`. It never starts/updates/ends an activity, refreshes scores, writes a heartbeat, or emails an alert. A missing schema returns 503; a correctly migrated but disabled release returns 200 with `enabled: false`. Keep the cron secret out of URLs and logs. Vercel Secret values cannot be pulled with `env run`; a missing value in a local subprocess does **not** prove it is missing in the deployed runtime.

For the first release, verify the no-send diagnostic, public health, and protected-route responses with the flag off. Enable only when the new Xcode build is installed and the physical-device test is authorized. A Vercel deployment does not update an Xcode-installed app.

## Delivery and safety

- ActivityKit push-to-start/update tokens are stored separately from ordinary notification tokens. Hex encoding is validated and callbacks are scoped to installation, authenticated app account, and session.
- Start/update/end pushes use `app.anygivenpick.ios.push-type.liveactivity` and Unix-second JSON timestamps. The same `PickActivityAttributes` Codable shape is compiled into the app and widget extension.
- An opt-in is required. iOS Settings can independently disallow Live Activities. Notifications permission is separate. Apple controls delivery and budgets; the app cannot guarantee an exact-second start or continuous updates while offline.
- Tokens rotate. The app watches them from launch, waits for Clerk hydration, uploads after sign-in, retries registration on foreground/Refresh connection, and ends local activities on sign-out/account switch. The worker verifies the Clerk session before private updates; auth service failures fail closed.
- Scheduler inserts deduplicate by device/window. Workers use row leases and `SKIP LOCKED`. A start is persisted as `starting` **before** APNs. Unknown delivery outcomes are not blindly retried as a new start. If a phone never returns an update token, the card can become stale and expire; inspect the `starting` count during the pilot.
- Stop/dismissal leaves a short-lived window tombstone. Long days create a new segment; disable the Daily week race preference to stop all future segments/days.
- Score clocks are provider snapshots, not fabricated ticking game clocks. Delayed data shows “Updates delayed.” The countdown itself renders on-device without minute-by-minute countdown pushes.
- A scheduler pass processes up to 20 sessions in a 40-second soft budget including score-refresh and queue setup, with leases preventing overlap. In-flight requests finish within their own limits. Monitor backlog/latency before expanding beyond a small beta; scale bounded worker concurrency or dispatch capacity before a larger rollout. Database-backed reads and APNs/Clerk latency make delivered throughput variable.
- End events clear update tokens. Session records are pruned two days after expiry; disabled device records after 30 days. Account deletion still requires Clerk session revocation; inactive users receive no new private state. ActivityKit can retain already-rendered Lock Screen content until end delivery or its system lifetime limit.
- Operational delivery failures are recorded using the existing generic alert service, without tokens, picks, or account identifiers. A failed pass responds 503 for scheduler/monitor alerting. Invalid tokens/permanent errors stop retrying; transient errors back off and stop after five failed attempts. A failed window is not automatically restarted; a manual followed game can be followed again.

## Verification checklist

- Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
- Generate the project with `cd ios && xcodegen generate`; build both targets and run `AnyGivenPickTests` on a simulator.
- Debug launch argument `-preview-live-activities` displays all three actual shared card layouts using example data, without making activity API requests. `-preview-live-activity-settings` opens the settings preview directly. Inspect a narrow phone and accessibility text sizes. Inspect Dynamic Island and actual Lock Screen on device as well.
- Use a non-production fixture card for trigger tests: before/at/after deadline-minus-30, before/at first kickoff-minus-10, next Eastern game day, midnight, DST and long-day rollover.
- Follow a game, background/lock/terminate the app, verify start/token callback, score + period update, stale display while offline, recovery, and final/end.
- Submit a card while the countdown is running and confirm it ends. Repeat disabling each preference, turning off iOS Live Activities, signing out, switching users, and revoking access.
- Tap each activity and verify Picks, the correct week's Results, or Live Race opens. URLs for a different account must be ignored.
- Repeat a scheduled invocation and token callback; verify no duplicate cards. Test two competing workers, APNs invalid-token/timeout behavior, and server downtime.

## Rollback

Disable new starts by setting device preferences off and allow end events to drain before turning `LIVE_ACTIVITIES_ENABLED` off. If an emergency requires immediately disabling the flag, already displayed activities may remain until the system ends them; users can dismiss them. The additive migration can remain in place when rolling back code. Do not drop the new tables or score columns as a routine rollback.

References: [Apple ActivityKit remote starts and updates](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications), [Live Activity presentation and limits](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities), [Vercel cron usage and limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
