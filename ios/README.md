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
- Commissioner approval and account-state handling
- Versioned `/api/mobile/v1` bootstrap, results, draft-save, and official-submit endpoints
- Native scoreboard entry matrix with an editable player row and draft-conflict recovery
- Live saved picks for every active player, real team marks, moneylines, and Monday over/under reference
- Native revealed results and player scorecards
- Native season standings and player achievement pages
- Dedicated native Live Race page from Home
- Native iPhone push settings, authenticated device registration, and week-aware notification taps (requires APNs setup below)
- Production health check and demo Live Activity

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
