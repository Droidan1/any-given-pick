# Native polling and database compute review

Scope: September 28, 2026 implementation of the reviewed polling proposal. This is
not a deployment record or a claim of measured production savings.

## Mobile changes

- Picks polls every 15 seconds only while its root screen is selected and the app
  is active. Opening another screen, reviewing a card, or backgrounding pauses it.
  Locked cards take one snapshot rather than continuing the open-card loop.
- Live Race follows the selected navigation stack, selected week and app phase.
  It refreshes on entry/resume (subject to an outstanding retry deadline), every
  30 seconds with live games, and every five minutes between games. Finished races
  stop automatic polling; pull-to-refresh and revisiting still check corrections.
  The five-minute watch may discover a kickoff up to five minutes after it starts.
- Counts come from the aggregate race response, not its limited featured-game list.
- Temporary failures use exponential delays from the feed's 15/30-second base up
  to 300 seconds. A successful request resets the delay. HTTP Retry-After is a
  lower bound even when it exceeds 300 seconds, including on manual refresh.
- Cancellation is not a failure. Permanent client/access errors stop automatic
  requests; an explicit successful refresh can recover the feed. An offline
  failure does not reach the database.
- A single refresh owner prevents overlapping manual/automatic requests. Changing
  account or week discards the old retry state. Backgrounding and tab changes do
  not reset failure backoff. Cancellation is checked between token/home/picks calls.
- Cached data stays visible with a retry/access status. Existing draft persistence,
  save and official-submit semantics are unchanged.

## Server audit and safe optimization

The worker at `api/cron/live-activities` is scheduled every minute in `vercel.json`.
When LIVE_ACTIVITIES_ENABLED is true, each tick reads device/session data, discovers
automatic starts, performs cleanup, and writes a heartbeat. This can keep Neon
awake even with zero foreground users. It is independent of the iPhone loops.

Automatic discovery now skips the week/game/entry scans when there are no devices
eligible for automatic starts (including missing start token, preferences off, or
unconfigured APNs environment). Existing followed-game, private-test, ending and
queued sessions are still processed. The one-minute schedule, heartbeat, and
five-minute health threshold remain unchanged. This reduces unnecessary queries;
it does NOT remove the always-awake compute floor.

Other database traffic configured in source:

- Checkly health checks every ten minutes; the health handler checks Postgres and
  score/Live Activity freshness and may attempt score recovery.
- GitHub score-sync schedules during game windows plus daily backstops.
- Hourly GitHub email checks plus daily Vercel score/email jobs.
- Home, Live Games, web/PWA and other users' foreground requests.

These source configurations are not proof of current production execution. No
production logs, credentials, Neon usage or account plan were inspected here.

## Why the original cost explanation changes

iOS normally suspends background apps. A SwiftUI task lacking a scene guard is not
evidence of a phone polling around the clock. Explicit scene cancellation is still
important for wasted requests, truthful UI, battery use and safe resumption.

With a five-minute inactivity threshold, a five-minute poll does not guarantee a
meaningful sleep period; multiple staggered clients can also prevent suspension.
At a constant 0.25 CU, 30 days of uptime is 180 CU-hours. If the actual allowance is
100 CU-hours, it supports 400 active hours at that size, not continuous operation.
Fewer SQL requests and fewer compute-hours are different measurements.

References:
- https://developer.apple.com/documentation/uikit/extending-your-app-s-background-execution-time
- https://neon.com/docs/introduction/scale-to-zero

## Next server decision (not silently enabled)

Keep the minute worker while automatic starts rely on database discovery. For
meaningful idle compute savings, choose one of:

1. Provision a database compute allowance that supports the required always-on
   scheduler. Verify current plan, usage and limits before buying anything.
2. Move the scheduler's durable wake-up index/heartbeat outside Neon. It must be
   updated on schedule publication/edits, device preferences, follows, private
   tests, submissions, removals and token changes. Deadline starts (30 minutes),
   daily race starts (10 minutes), long-day renewals, stops and retries must all
   remain correct. Cache misses must fail open to database discovery; an ephemeral
   cache alone is not sufficient for guaranteed wake-ups. Monitor the external
   index and validate a reconciliation/failure path before enabling idle skips.

Do not simply reduce cron frequency, cache a healthy response indefinitely, or
turn off monitoring to make the database sleep. Those can miss starts or hide an
outage. No database plan, monitor, cron cadence or production setting was changed.

## Verification and release checklist

- Native tests: both cadences/backoff schedules, Retry-After seconds/date, successful
  recovery, access blocking, cancellation, inactive/active transitions, selected
  context changes, overlapping refresh prevention, idle/live/final transitions,
  explicit API failure outcomes and dirty-draft preservation.
- Backend tests: no-recipient optimization, eligible recipients, private-test
  start/update/end and unchanged heartbeat/health behavior; no live sends.
- Simulator: Picks/Race normal and retry states at narrow width and accessibility
  text sizes. Fixture launch arguments disable polling and are not delivery tests.
- On a physical iPhone, capture API traffic on each screen, background for at least
  six minutes, switch tabs and resume. Confirm no new poll requests while inactive,
  one fresh snapshot on healthy resume, and failure delays/recovery. Existing
  in-flight requests may already have reached the server when cancellation occurs.
- Before/after deployment: record Neon active compute-hours, compute size, request
  counts and worker/monitor cadence for comparable full days. Do not promise the
  free allowance until those measurements include the server jobs and all clients.

No migration is required. The native changes require an updated Xcode/device build;
the small worker optimization requires a backend deployment separately.

## Local verification completed

- September 28: 69 native tests passed (16 new polling regressions); Debug and
  Release simulator builds succeeded. The final Release build had no warnings.
- All 262 backend/web tests passed, along with TypeScript checking, lint and
  `git diff --check`. Delivery tests used mocks, not real notifications.
- Reviewed Picks and Live Race retry-state screenshots in the iPhone simulator,
  including 320-point fixture width and Accessibility 3 text. Standard-size retry
  labels were readable; the Race message wraps. Simulator automation did not move
  the scroll position, so the offscreen Picks toolbar at the largest text size
  still needs an interactive check on the phone.
- No physical-device network trace, production usage measurement, commit, push,
  deployment, database migration or infrastructure-plan change was performed.
