# Any Given Pick for iOS

This folder contains the native SwiftUI player app. The existing Next.js application remains the backend, web player experience, and commissioner dashboard.

## Generate and open the project

```sh
cd ios
xcodegen generate
open AnyGivenPick.xcodeproj
```

## First device install

1. Connect and unlock the iPhone, then tap **Trust** if prompted.
2. In Xcode, open **Xcode → Settings → Accounts** and sign in with the Apple Account used for development.
3. Select the **AnyGivenPick** target, open **Signing & Capabilities**, and choose your Team.
4. Repeat the Team selection for **AnyGivenPickWidgets**.
5. Select the connected iPhone in Xcode's run-destination menu and press **Run**.
6. If iOS asks, enable Developer Mode under **Settings → Privacy & Security → Developer Mode** and restart the phone.

The first milestone includes native navigation, a production-backend health check, a local notification test, and a demo Live Activity for the Lock Screen and Dynamic Island.

## Enable production sign-in

The native app uses the existing Clerk production instance through the same Frontend API proxy as the web app. Before testing sign-in on an iPhone:

1. Open the Clerk Dashboard for the production `any-given-pick-auth` application.
2. Go to **Configure → Native applications** and enable the Native API if it is not already enabled.
3. Add an iOS application with bundle identifier `app.anygivenpick.ios`.
4. Enter the Apple App ID prefix associated with development team `225457KEGM`.
5. Rebuild and install the app from Xcode.

Do not place a Clerk secret key in the iOS project. The checked-in value is the public production publishable key; authenticated requests exchange the active Clerk session for a short-lived bearer token.

## Current native milestone

- Clerk email-code sign-in and sign-up
- Optional Face ID / Touch ID / device-passcode app unlock from Profile → App Security
- Commissioner approval and account-state handling
- Versioned `/api/mobile/v1` bootstrap, results, draft-save, and official-submit endpoints
- Native scoreboard entry matrix with an editable player row and draft-conflict recovery
- Live saved picks for every active player, real team marks, moneylines, and Monday over/under reference
- Native revealed results and player scorecards
- Native season standings and player achievement pages
- Dedicated native Live Race page from Home
- Native iPhone push settings, authenticated device registration, and week-aware notification taps (requires APNs setup below)
- Production health check and demo Live Activity

## Native Picks flow and acceptance

- Players stay fixed on the left while games scroll horizontally. Only the yellow YOU row is editable; other rows show saved picks before lock.
- Real team crests and choice moneylines remain visible. The designated Monday game's O/U and combined-points input stay in that game's column.
- Safe-area actions above the tabs guide missing picks/total → snapshot review → explicit official submission → versioned server receipt.
- Saving shares a draft; it is not official. The entire card locks at the weekly deadline, when your row shows only the official card.
- Unsaved changes recover locally by backend/account/week. Cross-device conflicts require an explicit choice; identical uncertain submission retries retain their key even after the server revision advances.
- Shared-board polling runs only while Picks is active, foregrounded, and unlocked. Refreshes preserve local work.

### Local verification

From the repository root, select an available simulator ID:

```sh
xcodebuild -project ios/AnyGivenPick.xcodeproj -scheme AnyGivenPick -showdestinations
xcodebuild -project ios/AnyGivenPick.xcodeproj -scheme AnyGivenPick -destination 'platform=iOS Simulator,id=SIMULATOR_UDID' CODE_SIGNING_ALLOWED=NO test
npm test
```

DEBUG launch arguments: `-preview-picks -picks-mode draft`; also `submitted`, `locked`, `no-official`, `empty`, `no-week`, or `blocked`. Add `-picks-narrow` for 320pt or `-picks-large-type` for accessibility3. Review and submit interactively to exercise the simulated receipt; fixture actions do not send production entries.

September 23, 2026 validation: simulator build, 32 native tests, 230 web/server tests, and standard/320pt/large-text/review/receipt/locked fixture checks passed. This is not physical-device or production verification.

### Remaining signed-device acceptance

- Deploy the updated shared entry-action conflict guard before treating the full release as live. The native client targets `https://anygivenpick.app` through the existing mobile entry routes and `/api/picks/live`.
- Install a signed build and verify sign-in, approved-account access, shared-board synchronization, and official receipt persistence using an authorized test card.
- Verify offline/relaunch recovery, both conflict choices, interrupted-response retry, and account/week isolation.
- Check keyboard dismissal, VoiceOver, large text, tab-safe actions, and whole-card locking on the iPhone. No production changes or physical install were performed during this validation.

## Face ID app unlock

This is an optional, device-local privacy gate for an existing Clerk session, not a replacement for account sign-in or server authorization. It is off by default. Profile → App Security → Use Face ID asks iOS to verify the device owner before enabling (or disabling) it. Devices without Face ID use Touch ID or their passcode.

An enabled account locks after backgrounding and on cold launch. One automatic unlock attempt is made on return; canceling keeps the app locked with an explicit retry. The app-switcher cover hides account content, and notification/Live Activity destinations wait until unlock. Notification previews and Live Activities themselves remain controlled separately and are not hidden by app unlock. No face data or device passcode is collected by the app. This setting does not encrypt local draft files.

Sign out instead is the recovery route to normal Clerk sign-in, with confirmation about unsynced local work. Completed sign-out clears that account's device-local opt-in. No server deployment, migration, or Clerk setting is required; install the updated native build through Xcode.

Tests cover opt-in verification, cold start, background/inactive transitions, cancellation without prompt loops, verified opt-out, account isolation, missing passcode, stale authentication completions, and concurrent attempts. DEBUG-only `-preview-app-unlock` opens an isolated fixture with no player data; add `-unlock-locked`, `-unlock-narrow` (320pt), or `-unlock-large-type` (accessibility3) for UI checks.

The approved Field Green unlock treatment uses solid `field950`, cream Dynamic Type, the exact transparent `AppBrandMark`, maize SF Symbols, and a left-aligned “BACK TO THE GAME.” headline. The separate privacy window reuses this player-data-free design above presented sheets. “Verifying with Face ID…” appears during authentication; otherwise the privacy cover says “Account locked.” Recovery remains scrollable, with a yellow retry, passcode guidance, and confirmed sign-out. Apple's authentication UI is not customized. Add `-unlock-verifying` to the DEBUG unlock fixture to inspect verification, or `-unlock-cover` to exercise the actual privacy window. Neither flag contacts production.

September 23, 2026 Field Green validation: simulator build and 47 native tests passed. The full-width privacy cover, 320pt recovery, and accessibility3 layout were inspected; retry opened the system passcode prompt, and sign-out confirmation could be canceled. The installed app icon is unchanged. No production deployment or physical-device installation was performed for this design change.

Before release, verify on a signed iPhone: enable, successful Face ID, canceled/failed scan, passcode fallback, background/reopen, cold launch, app-switcher privacy while a sheet is presented, notification/Live Activity tap while locked, and sign-out recovery. Simulator tests do not prove physical Face ID recognition.

## App branding

`AppBrandMark` is the shared native logo for Home, Picks, page headers, sign-in, account loading/error, and the app-unlock screen. It uses the transparent vector in `HomeBrandMark.imageset`: the approved `public/favicon.svg` card artwork with only its outer cream tile removed. Keep the white card outlines. Do not use the opaque app-icon PNG inside the app or recreate the mark with system symbols. The installed app icon is unchanged.

`LaunchScreen.storyboard` uses the same asset on the existing paper background; `UILaunchStoryboardName` is declared in both the checked-in plist and `project.yml`. Branding tests verify the bundled asset, transparent outer area, and storyboard image. DEBUG launch arguments `-preview-account-loading` and `-preview-launch-screen` show the actual loading view and bundled launch storyboard without signing out, delaying startup, or changing player data. Reinstall/run the native build from Xcode to see changes; a web deployment does not update these bundled views.

## Production roadmap

- Native activity/archive and editable profile parity
- Score-sync-driven Live Activity updates

## Enable real iPhone notifications

This replaces the local test notification. The four alerts are new weekly card,
deadline approaching (only if no official submission), picks submitted, and final
results. Preferences are per iPhone, independent of email and web push.

1. Apply `drizzle/0018_native_iphone_notifications.sql` through the project's
   normal Drizzle migration workflow **before deploying** this backend version.
2. In Apple Developer, enable **Push Notifications** for `app.anygivenpick.ios`.
   Ensure your Apple Developer team supports push and refresh Xcode's automatic
   provisioning profile. The app target includes the required entitlement.
3. Create APNs signing keys for this topic/environment. Configure server-only
   `APNS_TEAM_ID`, `APNS_SANDBOX_KEY_ID`, and `APNS_SANDBOX_PRIVATE_KEY` for Xcode
   Debug testing. Put the complete `.p8` PEM in the private-key variable; literal
   `\n` escapes are also accepted. Never add the key to Xcode, Git, or chat.
4. For TestFlight/App Store builds also configure `APNS_PRODUCTION_KEY_ID` and
   `APNS_PRODUCTION_PRIVATE_KEY`. Use environment-scoped Apple keys. Set
   `APNS_ENABLED=true` only after migration/setup; redeploy the backend.
5. Build/install on your iPhone and open **Profile → Notification settings →
   Enable iPhone alerts**. Accept the system permission prompt. Confirm the
   screen says alerts are on, not that server setup is pending.

Debug sends to the APNs sandbox; Release is configured for production signing.
If installing a development-signed Release build, override both
`APNS_ENVIRONMENT=sandbox` and `APNS_ENTITLEMENT_ENVIRONMENT=development`.
The `APNsEnvironment` Info.plist value must match the signed `aps-environment`.

Publication and submission trigger immediate queue attempts. Score sync and
manual final-score/cancellation changes trigger completed-week results checks
after the response. The hourly GitHub notification workflow handles deadline
reminders, missed events, and retries, with the daily Vercel cron as a fallback.
The workflow must be on `main` to schedule; manually dispatch with the default
`dry_run=true` to verify configuration without sending player alerts. Scheduler
and provider delays mean delivery is not guaranteed at an exact minute. Native alert workers are disabled
without `APNS_ENABLED=true`; email/web push continue as before.

Delivery rechecks account state, current preference, deadline/submission state,
and the registered Clerk session. Sign-out unregisters the phone; expired or
revoked sessions stop delivery even if offline deregistration failed. Anonymizing
an account removes its native devices and delivery rows. No tokens or private
keys are included in operational logs. APNs acceptance is not proof the person
saw an alert (Focus mode, connectivity, and OS policies can delay delivery).

### Physical-device acceptance checklist

- Enable/deny permissions; change preferences; relaunch and verify persistence.
- Publish a test week with an approved, opted-in test account; receive exactly
  one alert on that device. Do not publish test data to the public production board.
- Submit/update a card; each official version gets one confirmation. A submitted
  card must not receive a pending deadline reminder.
- Finalize a test slate, run the authenticated notification job, and tap results;
  verify the correct week opens, including when launched from a closed app.
- Retry the same event; check dedupe, then sign out/switch accounts and confirm
  the old account gets no new device alerts.
- Test sandbox and production separately. Simulator UI and unit tests alone do
  not verify real APNs delivery on Brian's iPhone.

References: [APNs registration](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns),
[APNs token authentication](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns).

## Native admin tools

Administrators enter through **Profile → Admin tools**. Native approvals, announcements, official pick-card reports, and read-only operations/privacy views live in `AnyGivenPick/Features/Admin/`; week management, imports, score changes, and privacy processing remain labeled browser handoffs. See [Native admin](../docs/native-admin.md) for the parity inventory, security boundary, fixture arguments, and validation status. This extension needs no migration, but the updated backend must be deployed before installing/running the native build from Xcode. No release was performed.
