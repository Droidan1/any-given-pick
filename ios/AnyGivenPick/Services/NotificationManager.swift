import Foundation
import Observation
import UserNotifications

@MainActor
@Observable
final class NotificationManager {
  private(set) var statusMessage = "Permission has not been requested."

  func requestAndScheduleTest() async {
    do {
      let center = UNUserNotificationCenter.current()
      let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
      guard granted else {
        statusMessage = "Notifications are off. You can enable them in iPhone Settings."
        return
      }

      let content = UNMutableNotificationContent()
      content.title = "Any Given Pick"
      content.body = "Native notifications are ready for weekly reminders."
      content.sound = .default

      let request = UNNotificationRequest(
        identifier: "agp-device-test",
        content: content,
        trigger: UNTimeIntervalNotificationTrigger(timeInterval: 3, repeats: false)
      )
      try await center.add(request)
      statusMessage = "Test scheduled. It should appear in about three seconds."
    } catch {
      statusMessage = "The test notification could not be scheduled."
    }
  }
}

