# Native Home and Live Games

Implementation scope: the approved September 23, 2026 Home preview, followed by the user's “Looks good, start building” approval. This is a native iOS extension, not a web/PWA redesign. It is not a production release record.

## Design contract

- Approved composition: `home-refresh-preview/home-three-states.png` in the task's visualization artifacts; accompanying source brief: `home-and-live-games-spec.md` supplied by the user.
- Keep the existing AGPTheme field-green, paper, maize, condensed system typography, brand asset, and real NFL team crests. Legacy web-only typography/platform/crest statements in PRODUCT.md and DESIGN.md do not override this native scope.
- Keep four native tabs: Home, Picks, Results, Profile. Live Games is pushed from Home with a specific week identifier.
- Home changes between unfinished, submitted, and locked states. Missing games and the Monday tiebreaker are explicit. A saved draft is never presented as an official entry.
- At default text size, use a compact official-card summary, short matchup preview, all-games action, and projected race. Use native Dynamic Type stacking rather than truncation at accessibility sizes. Keep 44-point controls and standard iOS navigation.
- Results navigation is integrated into the locked official-card heading. The Home preview avoids duplicated per-game freshness; the fuller Live Games cards retain feed details.

## Data and safety

- `GET /api/mobile/v1/bootstrap?view=home` returns the existing authenticated envelope without the whole picks matrix or results leaderboard. An optional UUID `weekId` pins Live Games to a published/locked/final week. The default bootstrap contract remains compatible.
- All matchups come from the week's games, never the limited Live Race feature list. Optional period, clock, detail, and score-check fields are backward-compatible with older payloads.
- Countdown uses a monotonic clock anchored to server time. Home and Picks lock when the deadline is reached without waiting for another response; the server remains authoritative for mutations.
- Home and Live Games refresh while visible/active, normally every 30 seconds, with bounded failure backoff and pull-to-refresh. Cached scores remain visibly identified after an error. Projected race refresh is scoped to the same week and throttled separately.
- Background refresh preserves dirty local picks and revisions. It cannot replace a new account's state or a completed entry mutation with an older response. New-week refresh does not silently discard unsaved picks: players can review their current draft or explicitly confirm discarding unsaved changes and switching. Official submitted cards are not deleted.
- Only official submitted picks are graded. In-progress leads are not wins. Ties, canceled games, and postponed games have explicit labels.
- Existing LiveActivityManager handles Follow/Stop and device settings. No new APNs credentials, migration, or automatic notification event is introduced.

## Local test modes

Debug-only launch argument `-preview-home` uses synthetic fixtures and disables Home network polling. `HOME_PREVIEW_STATE` supports `draft`, `submitted`, `locked`, `no-official`, `stale`, `empty`, `blocked`, and `no-week`. Add `-preview-home-games` for the full slate and `-preview-large-text` for accessibility text sizing. Never treat example scores or odds as current NFL information.

Verification includes native unit tests for deadline transitions, valid-pick counts, official-only grading, draft preservation, account separation, and failure backoff; mobile-bootstrap route tests cover authentication, week validation, and compact/default contracts. Simulator screenshots and navigation checks use fixtures. Physical-iPhone delivery and production API behavior still require release/device verification; simulator Follow controls are not proof of APNs delivery.

## Release boundary

No database migration is required. Backend changes must be deployed to enable the compact query and new score metadata. Install the updated native build through Xcode to see the new screens. Existing production web/PWA screens are unchanged by this UI work.

## Local verification — September 23, 2026

- Xcode simulator build and 26 native tests passed; 48 backend/web test files with 228 tests passed; TypeScript, ESLint, and whitespace checks passed.
- iPhone 18 Pro simulator, iOS 27: checked draft, submitted, locked, stale and empty Home states; verified Home → Picks and Home → Live Games navigation, scrolling through upcoming/Monday/final game groups, readable refresh controls, and accessibility-size game rows.
- Impeccable finish review: ship after the compact Home spacing, refresh contrast, and scoped persistence fixes.
- Screenshots use illustrative fixtures. No physical-device/APNs delivery claim; no production deployment, commit, or push was performed for this implementation.
