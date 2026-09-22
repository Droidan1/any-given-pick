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
- Production health check, local notification test, and demo Live Activity

## Production roadmap

- Native activity/archive and editable profile parity
- Native live-race view
- APNs registration and server-driven notifications
- Score-sync-driven Live Activity updates
