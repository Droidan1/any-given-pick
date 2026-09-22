import SwiftUI
import UserNotifications
import ClerkKit

@main
struct AnyGivenPickApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @State private var appModel = AppModel()
  @State private var liveActivityManager = LiveActivityManager()
  @State private var notificationManager = NotificationManager()

  init() {
    Clerk.configure(
      publishableKey: AppConfiguration.clerkPublishableKey,
      options: .init(proxyUrl: AppConfiguration.clerkProxyURL)
    )
  }

  var body: some Scene {
    WindowGroup {
      AppRootView()
        .environment(appModel)
        .environment(liveActivityManager)
        .environment(notificationManager)
        .environment(Clerk.shared)
        .preferredColorScheme(.light)
    }
  }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
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
}
