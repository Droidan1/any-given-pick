import Foundation
import Observation
import UIKit
import UserNotifications

struct NativeNotificationPreferences: Codable, Equatable, Sendable {
  var enabled = true
  var weekPublished = true
  var deadlineApproaching = true
  var picksSubmitted = true
  var resultsAvailable = true
}

struct NativeNotificationSettings: Decodable, Sendable {
  let registered: Bool
  let deliveryConfigured: Bool
  let preferences: NativeNotificationPreferences
}

struct NativeDeviceRegistration: Encodable {
  let installationId: String
  let deviceToken: String
  let environment: String
  let preferences: NativeNotificationPreferences
}

struct NativeDeviceRemoval: Encodable { let installationId: String }
struct NativeDeviceRemovalResult: Decodable { let ok: Bool }

struct NativeNotificationDestination: Hashable, Sendable {
  let kind: String
  let weekId: String
  let userId: String

  init?(userInfo: [AnyHashable: Any]) {
    guard let kind = userInfo["kind"] as? String,
      ["week_published", "deadline_approaching", "picks_submitted", "results_available"].contains(kind),
      let weekId = userInfo["weekId"] as? String, UUID(uuidString: weekId) != nil,
      let userId = userInfo["userId"] as? String, UUID(uuidString: userId) != nil else { return nil }
    self.kind = kind
    self.weekId = weekId
    self.userId = userId
  }

  func tab(currentWeekId: String?) -> AppTab {
    kind != "results_available" && currentWeekId == weekId ? .picks : .results
  }
}

@MainActor
@Observable
final class NotificationManager {
  static let shared = NotificationManager()
  private(set) var preferences = NativeNotificationPreferences()
  private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
  private(set) var registered = false
  private(set) var deliveryConfigured = false
  private(set) var isBusy = false
  private(set) var isReady = false
  private(set) var statusMessage = "Choose which alerts you want on this iPhone."
  var pendingDestination: NativeNotificationDestination?
  private var deviceToken: String?
  private var accountId: String?
  private var connectionGeneration = UUID()
  private var tokenProvider: (@MainActor () async throws -> String?)?
  private let apiClient: APIClient
  private let installationId: String

  init(apiClient: APIClient = .production, defaults: UserDefaults = .standard) {
    self.apiClient = apiClient
    if let saved = defaults.string(forKey: "native-push-installation"), UUID(uuidString: saved) != nil {
      installationId = saved
    } else {
      installationId = UUID().uuidString
      defaults.set(installationId, forKey: "native-push-installation")
    }
  }

  var environment: String {
    Bundle.main.object(forInfoDictionaryKey: "APNsEnvironment") as? String == "production" ? "production" : "sandbox"
  }

  var permissionGranted: Bool { authorizationStatus == .authorized || authorizationStatus == .provisional }
  var alertsActive: Bool {
    permissionGranted && registered && preferences.enabled && deliveryConfigured
      && (preferences.weekPublished || preferences.deadlineApproaching || preferences.picksSubmitted || preferences.resultsAvailable)
  }

  func connect(accountId: String, tokenProvider: @escaping @MainActor () async throws -> String?) async {
    if self.accountId != accountId {
      disconnect()
      self.accountId = accountId
    }
    self.tokenProvider = tokenProvider
    await refresh()
  }

  func disconnect() {
    connectionGeneration = UUID()
    accountId = nil
    tokenProvider = nil
    registered = false
    isReady = false
    isBusy = false
    deliveryConfigured = false
    preferences = NativeNotificationPreferences()
    statusMessage = "Sign in to manage your iPhone alerts."
    UNUserNotificationCenter.current().removeAllDeliveredNotifications()
  }

  func refresh() async {
    guard !isBusy, let accountId, let tokenProvider else { return }
    let generation = connectionGeneration
    isBusy = true
    defer { if generation == connectionGeneration { isBusy = false } }
    let settings = await UNUserNotificationCenter.current().notificationSettings()
    guard generation == connectionGeneration else { return }
    authorizationStatus = settings.authorizationStatus
    do {
      guard let token = try await tokenProvider() else { return }
      let response = try await apiClient.fetchNotificationSettings(token: token, installationId: installationId, environment: environment)
      guard generation == connectionGeneration, self.accountId == accountId else { return }
      apply(response)
      isReady = true
      if permissionGranted {
        UIApplication.shared.registerForRemoteNotifications()
        if let deviceToken { try await register(token: token, deviceToken: deviceToken, preferences: preferences, generation: generation) }
      } else if registered && preferences.enabled {
        if let deviceToken {
          var disabled = preferences
          disabled.enabled = false
          try await register(token: token, deviceToken: deviceToken, preferences: disabled, generation: generation)
        } else {
          _ = try await apiClient.removeNotificationDevice(token: token, installationId: installationId)
          guard generation == connectionGeneration else { return }
          registered = false
        }
        statusMessage = "Notifications are off in iPhone Settings."
      }
    } catch {
      guard generation == connectionGeneration else { return }
      statusMessage = error.localizedDescription
    }
  }

  func enable() async {
    guard !isBusy, isReady else { return }
    do {
      let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
      authorizationStatus = (await UNUserNotificationCenter.current().notificationSettings()).authorizationStatus
      guard granted else {
        statusMessage = "Notifications are off. Open iPhone Settings to allow alerts."
        return
      }
      preferences.enabled = true
      statusMessage = "Registering this iPhone with Apple…"
      UIApplication.shared.registerForRemoteNotifications()
      if deviceToken != nil { await save(preferences) }
    } catch { statusMessage = "Notification permission could not be requested. Please try again." }
  }

  func receivedDeviceToken(_ token: Data) {
    deviceToken = token.map { String(format: "%02x", $0) }.joined()
    guard isReady, permissionGranted else { return }
    Task { await save(preferences) }
  }

  func registrationFailed() {
    statusMessage = "Apple could not register this iPhone. Check Push Notifications in Xcode Signing & Capabilities, then try again."
  }

  func save(_ next: NativeNotificationPreferences) async {
    guard !isBusy, isReady, let tokenProvider else { return }
    guard let deviceToken else {
      statusMessage = "Still waiting for Apple to register this iPhone. Try Refresh connection."
      return
    }
    let generation = connectionGeneration
    isBusy = true
    defer { if generation == connectionGeneration { isBusy = false } }
    do {
      guard let token = try await tokenProvider() else { return }
      try await register(token: token, deviceToken: deviceToken, preferences: next, generation: generation)
    } catch {
      guard generation == connectionGeneration else { return }
      statusMessage = "Settings were not saved. \(error.localizedDescription)"
    }
  }

  func unregisterBeforeSignOut() async {
    // If offline, server delivery also checks that this Clerk session is still active.
    if let token = try? await tokenProvider?() {
      _ = try? await apiClient.removeNotificationDevice(token: token, installationId: installationId)
    }
    pendingDestination = nil
    disconnect()
  }

  private func register(token: String, deviceToken: String, preferences: NativeNotificationPreferences, generation: UUID) async throws {
    guard generation == connectionGeneration else { return }
    let response = try await apiClient.registerNotificationDevice(token: token, input: NativeDeviceRegistration(
      installationId: installationId, deviceToken: deviceToken, environment: environment, preferences: preferences
    ))
    guard generation == connectionGeneration else { return }
    apply(response)
  }

  private func apply(_ response: NativeNotificationSettings) {
    preferences = response.preferences
    registered = response.registered
    deliveryConfigured = response.deliveryConfigured
    if !deliveryConfigured {
      statusMessage = registered
        ? "Your preferences are saved, but Apple push delivery still needs server setup."
        : "Apple push delivery still needs server setup. You can enable this iPhone when setup is complete."
    } else if alertsActive {
      statusMessage = "Alerts are on for this iPhone."
    } else {
      statusMessage = "Alerts are off for this iPhone. Email and web push settings are unchanged."
    }
  }

  #if DEBUG
  func loadPreview() {
    isReady = true
    registered = true
    deliveryConfigured = true
    authorizationStatus = .authorized
    statusMessage = "Alerts are on for this iPhone."
  }
  #endif
}
