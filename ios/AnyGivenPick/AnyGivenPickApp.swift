import SwiftUI
import UserNotifications
import ClerkKit

@main
struct AnyGivenPickApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @State private var appModel = AppModel()
  @State private var liveActivityManager = LiveActivityManager()
  @State private var notificationManager = NotificationManager.shared

  init() {
    Clerk.configure(
      publishableKey: AppConfiguration.clerkPublishableKey,
      options: .init(proxyUrl: AppConfiguration.clerkProxyURL)
    )
  }

  var body: some Scene {
    WindowGroup {
      rootContent
        .environment(appModel)
        .environment(liveActivityManager)
        .environment(notificationManager)
        .environment(Clerk.shared)
        .onOpenURL { liveActivityManager.pendingDestination = ActivityDestination(url: $0) }
        .preferredColorScheme(.light)
    }
  }

  @ViewBuilder
  private var rootContent: some View {
    #if DEBUG
    if ProcessInfo.processInfo.arguments.contains("-preview-live-activity-tests") {
      NavigationStack { LiveActivityPrivateTestView() }.environment(LiveActivityManager.preview())
    } else if ProcessInfo.processInfo.arguments.contains("-preview-live-activity-settings") {
      NavigationStack { LiveActivitySettingsView() }.environment(LiveActivityManager.preview())
    } else if ProcessInfo.processInfo.arguments.contains("-preview-live-activities") {
      LiveActivitiesDebugHost()
    } else if ProcessInfo.processInfo.arguments.contains("-preview-notifications") {
      NotificationSettingsDebugHost()
    } else if ProcessInfo.processInfo.arguments.contains("-preview-picks-matrix") {
      ScoreboardEntryMatrixDebugHost()
    } else if ProcessInfo.processInfo.arguments.contains("-preview-live-race") {
      LiveRaceDebugHost()
    } else if ProcessInfo.processInfo.arguments.contains("-preview-standings") {
      StandingsDebugHost()
    } else if ProcessInfo.processInfo.arguments.contains("-preview-achievements") {
      AchievementsDebugHost()
    } else {
      AppRootView()
    }
    #else
    AppRootView()
    #endif
  }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    NotificationManager.shared.receivedDeviceToken(deviceToken)
  }

  func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    NotificationManager.shared.registrationFailed()
  }

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    UNUserNotificationCenter.current().delegate = self
    return true
  }

  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound])
  }

  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let destination = NativeNotificationDestination(userInfo: response.notification.request.content.userInfo)
    Task { @MainActor in
      NotificationManager.shared.pendingDestination = destination
    }
    completionHandler()
  }
}
