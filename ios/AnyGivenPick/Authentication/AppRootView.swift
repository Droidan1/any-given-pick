import ClerkKit
import ClerkKitUI
import SwiftUI

struct AppRootView: View {
  @Environment(Clerk.self) private var clerk
  @Environment(AppModel.self) private var appModel
  @Environment(NotificationManager.self) private var notifications
  @Environment(LiveActivityManager.self) private var activities
  @Environment(AppLock.self) private var appLock
  @Environment(\.scenePhase) private var scenePhase

  var body: some View {
    Group {
      if !clerk.isLoaded {
        accountLoadingView
      } else if clerk.user == nil {
        NativeAuthenticationView()
      } else if appLock.userID != clerk.user?.id {
        accountLoadingView
      } else if appLock.isLocked {
        AppLockView {
          await notifications.unregisterBeforeSignOut()
          await activities.unregisterBeforeSignOut()
          try await clerk.auth.signOut()
        }
      } else if appModel.bootstrap != nil {
        AppShellView()
      } else {
        accountLoadingView
      }
    }
    .background(AppPrivacyCover(
      visible: appLock.shouldCoverApp,
      status: AppLockStatus(isVerifying: appLock.isBusy, authenticationName: appLock.name, authenticationSymbol: appLock.symbol)
    ))
    .onChange(of: clerk.user?.id, initial: true) { _, id in
      guard clerk.isLoaded else { return }
      if appLock.userID != nil, appLock.userID != id { appModel.clearAuthenticatedAccount() }
      appLock.setAccount(id)
    }
    .onChange(of: clerk.isLoaded, initial: true) { _, loaded in
      if loaded { appLock.setAccount(clerk.user?.id) }
    }
    .onChange(of: appLock.needsAutomaticUnlock, initial: true) { _, needed in
      if needed { Task { await appLock.unlock(automatically: true) } }
    }
    .task(id: "\(clerk.isLoaded)-\(clerk.user?.id ?? "signed-out")-\(appLock.canAccessAccount)") {
      guard clerk.isLoaded else { return }
      guard clerk.user != nil else {
        notifications.disconnect()
        await activities.disconnect()
        appModel.clearAuthenticatedAccount()
        return
      }
      guard appLock.canAccessAccount, appLock.userID == clerk.user?.id else { return }
      if appModel.bootstrap == nil { await loadAccount() }
      else { await connectNotifications() }
    }
    .onChange(of: scenePhase, initial: true) { _, phase in
      appLock.sceneChanged(phase)
      if phase == .active, appLock.canAccessAccount { Task { await connectNotifications() } }
    }
    .onChange(of: notifications.pendingDestination) { _, destination in
      if destination != nil { Task { await openNotification() } }
    }
    .onChange(of: activities.pendingDestination) { _, destination in
      if destination != nil { Task { await openActivity() } }
    }
  }

  private func connectNotifications() async {
    guard appLock.canAccessAccount, let user = clerk.user, appModel.bootstrap?.user.account.accountState == "active" else { return }
    await openNotification()
    await openActivity()
    if let account = appModel.bootstrap?.user {
      await activities.connect(userId: account.id) { try await clerk.auth.getToken() }
    }
    await notifications.connect(accountId: user.id) { try await clerk.auth.getToken() }
  }

  private func openActivity() async {
    guard appLock.canAccessAccount, let destination = activities.pendingDestination, let account = appModel.bootstrap?.user else { return }
    activities.pendingDestination = nil
    guard destination.userId == account.id, let token = try? await clerk.auth.getToken() else { return }
    appModel.navigationPaths = [:]
    if destination.isTest {
      appModel.selectedTab = .profile
      appModel.navigationPaths[.profile] = [.liveActivities]
    } else if destination.kind == .race {
      appModel.liveRaceWeekId = destination.weekId
      appModel.selectedTab = .home
      appModel.navigationPaths[.home] = [.liveRace]
    } else if destination.kind == .deadline, destination.weekId == appModel.bootstrap?.currentWeek?.id,
      appModel.bootstrap?.currentWeek?.isLocked == false {
      appModel.selectedTab = .picks
    } else {
      appModel.notificationResultsWeekId = destination.weekId
      appModel.selectedTab = .results
      await appModel.refreshResults(token: token)
    }
  }

  private func openNotification() async {
    guard appLock.canAccessAccount, let destination = notifications.pendingDestination, let account = appModel.bootstrap?.user else { return }
    notifications.pendingDestination = nil
    guard destination.userId == account.id else { return }
    if destination.kind != "results_available", appModel.bootstrap?.currentWeek?.id != destination.weekId,
      let token = try? await clerk.auth.getToken() {
      await appModel.refreshWeekForNotification(token: token, weekId: destination.weekId)
    }
    guard appModel.bootstrap?.user.id == account.id else { return }
    let tab = destination.tab(currentWeekId: appModel.bootstrap?.currentWeek?.id)
    appModel.notificationNavigationID = UUID()
    appModel.navigationPaths = [:]
    appModel.selectedTab = tab
    if tab == .results {
      appModel.notificationResultsWeekId = destination.weekId
      if let token = try? await clerk.auth.getToken() { await appModel.refreshResults(token: token) }
    }
  }

  private var accountLoadingView: some View {
    AccountConnectionView(error: appModel.accountError) {
      Task { await loadAccount() }
    }
  }

  private func loadAccount() async {
    guard appLock.canAccessAccount else { return }
    do {
      guard let token = try await clerk.auth.getToken() else { return }
      await appModel.loadAuthenticatedAccount(token: token)
      await connectNotifications()
    } catch {
      appModel.showAccountError("Your sign-in session could not be verified. Please try again.")
    }
  }
}

struct AccountConnectionView: View {
  let error: String?
  let retry: () -> Void

  var body: some View {
    ZStack {
      CallSheetBackground()
      VStack(spacing: 20) {
        AppBrandMark()
          .frame(width: 64, height: 64)
        if let error {
          Text("ACCOUNT CONNECTION")
            .font(AGPTheme.display(30))
            .foregroundStyle(AGPTheme.ink)
          Text(error)
            .multilineTextAlignment(.center)
            .foregroundStyle(AGPTheme.inkSoft)
          Button("Try again", action: retry)
            .buttonStyle(CallSheetActionStyle())
        } else {
          ProgressView()
            .tint(AGPTheme.field950)
          Text("Loading your call sheet…")
            .font(AGPTheme.label())
            .foregroundStyle(AGPTheme.ink)
        }
      }
      .padding(28)
    }
  }
}

private struct NativeAuthenticationView: View {
  var body: some View {
    VStack(spacing: 0) {
      VStack(alignment: .leading, spacing: 10) {
        HStack(spacing: 12) {
          AppBrandMark()
            .frame(width: 46, height: 46)
          VStack(alignment: .leading, spacing: 0) {
            Text("ANY GIVEN")
              .font(AGPTheme.label(13))
              .foregroundStyle(AGPTheme.sage)
              .tracking(1.4)
            Text("PICK")
              .font(AGPTheme.display(26))
              .foregroundStyle(AGPTheme.maize)
          }
        }
        Text("WELCOME TO THE HUDDLE")
          .font(AGPTheme.display(32))
          .foregroundStyle(AGPTheme.paper100)
        Text("Sign in with the same email you use on anygivenpick.app. New accounts still require commissioner approval.")
          .font(.subheadline)
          .foregroundStyle(AGPTheme.paper200)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(24)
      .background(AGPTheme.field950)

      AuthView(mode: .signInOrUp, isDismissible: false)
        .background(AGPTheme.paper100)
    }
    .background(AGPTheme.paper100)
  }
}

#if DEBUG
/// Inspect the actual bundled storyboard without delaying the real app's startup.
struct LaunchScreenDebugHost: UIViewControllerRepresentable {
  func makeUIViewController(context: Context) -> UIViewController {
    UIStoryboard(name: "LaunchScreen", bundle: .main).instantiateInitialViewController()!
  }
  func updateUIViewController(_ controller: UIViewController, context: Context) { }
}
#endif
