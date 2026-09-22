import ActivityKit
import Foundation
import Observation

@MainActor @Observable
final class LiveActivityManager {
  private(set) var statusMessage = "Enable Live Activities to follow your card from the Lock Screen."
  private(set) var preferences = LiveActivityPreferences()
  private(set) var sessions: [LiveActivitySessionSummary] = []
  private(set) var busy = false
  private(set) var registered = false
  private(set) var deliveryConfigured = false
  private(set) var canTest = false
  private(set) var testMessage = "Choose one test, then lock your iPhone. No real picks, scores, or deadlines will change."
  private(set) var authorized = ActivityAuthorizationInfo().areActivitiesEnabled
  var pendingDestination: ActivityDestination?
  var supportsAutomaticStarts: Bool { if #available(iOS 17.2, *) { true } else { false } }
  private let api: APIClient
  private let installationId: String
  private var userId: String?
  private var tokenProvider: (@MainActor () async throws -> String?)?
  private var startToken: String?
  private var loaded = false
  private var generation = UUID()
  private var tasks: [Task<Void, Never>] = []
  private var activityTasks: [String: [Task<Void, Never>]] = [:]
  private var needsRegistration = false
  private var pendingTest: (kind: PickActivityAttributes.Kind, requestId: String)?
  var tests: [LiveActivitySessionSummary] { sessions.filter { $0.isTest == true } }
  var hasRunningTest: Bool { tests.contains { $0.isRunning } }

  init(api: APIClient = .production, observe: Bool = true) {
    self.api = api
    let key = "live-activity-installation"
    installationId = UserDefaults.standard.string(forKey: key) ?? UUID().uuidString
    UserDefaults.standard.set(installationId, forKey: key)
    if observe { watchActivityKit() }
  }
  private func watchActivityKit() {
    if #available(iOS 17.2, *) {
      if let token = Activity<PickActivityAttributes>.pushToStartToken { startToken = hex(token) }
      tasks.append(Task { [weak self] in
        for await token in Activity<PickActivityAttributes>.pushToStartTokenUpdates {
          guard let self, !Task.isCancelled else { return }
          startToken = hex(token); await refresh()
        }
      })
    }
    tasks.append(Task { [weak self] in
      for await activity in Activity<PickActivityAttributes>.activityUpdates {
        guard let self, !Task.isCancelled else { return }
        observeActivity(activity)
      }
    })
    tasks.append(Task { [weak self] in
      for await allowed in ActivityAuthorizationInfo().activityEnablementUpdates {
        guard let self, !Task.isCancelled else { return }
        authorized = allowed; await refresh()
      }
    })
    for activity in Activity<PickActivityAttributes>.activities { observeActivity(activity) }
  }
  func connect(userId: String, tokenProvider: @escaping @MainActor () async throws -> String?) async {
    if self.userId != userId {
      generation = UUID(); self.userId = userId; loaded = false; registered = false
      preferences = .init(); sessions = []
      canTest = false; pendingTest = nil
      await endLocal(exceptUser: userId)
    }
    self.tokenProvider = tokenProvider
    await refresh()
  }
  func refresh() async {
    guard let tokenProvider, let userId else { return }
    if busy { needsRegistration = true; return }
    busy = true
    let requestGeneration = generation
    defer {
      busy = false
      if needsRegistration { needsRegistration = false; Task { await refresh() } }
    }
    do {
      guard let token = try await tokenProvider(), generation == requestGeneration else { return }
      if !loaded {
        let settings = try await api.liveActivitySettings(token: token, installationId: installationId)
        guard generation == requestGeneration else { return }
        preferences = settings.preferences; loaded = true
      }
      authorized = ActivityAuthorizationInfo().areActivitiesEnabled
      let environment = Bundle.main.object(forInfoDictionaryKey: "APNsEnvironment") as? String == "production" ? "production" : "sandbox"
      let settings = try await api.registerLiveActivities(token: token, input: .init(installationId: installationId,
        environment: environment, pushToStartToken: startToken, authorized: authorized, preferences: preferences))
      guard generation == requestGeneration else { return }
      registered = settings.registered; deliveryConfigured = settings.deliveryConfigured; sessions = settings.sessions
      canTest = settings.canTest == true
      statusMessage = !authorized ? "Live Activities are disabled in iPhone Settings."
        : !preferences.enabled ? "Live Activities are off on this iPhone."
        : !deliveryConfigured ? "Saved. Apple push delivery still needs server configuration."
        : supportsAutomaticStarts && startToken == nil ? "Waiting for Apple's automatic-start token. Refresh after a moment."
        : "Connected. Your chosen activities can appear on your Lock Screen."
      for activity in Activity<PickActivityAttributes>.activities {
        guard generation == requestGeneration else { return }
        if activity.attributes.userId != userId || !preferences.enabled
          || (activity.attributes.kind == .deadline && !preferences.deadline)
          || (activity.attributes.kind == .race && !preferences.race) {
          await Self.endActivity(id: activity.id)
        } else {
          observeActivity(activity)
          if let pushToken = activity.pushToken { await upload(activity, token: pushToken) }
        }
      }
    } catch { if generation == requestGeneration { statusMessage = error.localizedDescription } }
  }
  func save(_ value: LiveActivityPreferences) async {
    guard !busy, loaded else { return }
    preferences = value; await refresh()
  }
  func testNow(_ kind: PickActivityAttributes.Kind) async {
    guard canTest, !busy, !hasRunningTest, authorized, preferences.enabled, let tokenProvider, let userId else { return }
    busy = true
    let requestGeneration = generation
    // Preserve this key after an uncertain network response; a retry cannot queue a second test.
    let request = pendingTest?.kind == kind ? pendingTest! : (kind: kind, requestId: UUID().uuidString)
    pendingTest = request
    defer {
      busy = false
      if needsRegistration { needsRegistration = false; Task { await refresh() } }
    }
    do {
      guard let token = try await tokenProvider(), generation == requestGeneration else { return }
      let result = try await api.testLiveActivity(token: token, input: .init(installationId: installationId, kind: kind, requestId: request.requestId))
      guard generation == requestGeneration else { return }
      if result.mode == "local" {
        guard let seed = result.seed, seed.attributes.userId == userId, seed.attributes.isTest == true else { throw APIError.invalidResponse }
        if !Activity<PickActivityAttributes>.activities.contains(where: { $0.attributes.sessionId == result.sessionId }) {
          do {
            let activity = try Activity.request(attributes: seed.attributes,
              content: ActivityContent(state: seed.state, staleDate: seed.state.staleDate), pushType: .token)
            observeActivity(activity)
            if let pushToken = activity.pushToken { await upload(activity, token: pushToken) }
          } catch {
            _ = try? await api.updateLiveActivity(token: token, input: .init(installationId: installationId, sessionId: result.sessionId), stop: true)
            throw error
          }
        }
        testMessage = "Sample game started. Lock your iPhone to watch server score updates. It ends after about 5 minutes."
      } else {
        testMessage = "Test queued. Lock your iPhone now. The scheduler can start it after 20 seconds, usually within 2 minutes. Sample values update until it ends after about 5 minutes."
      }
      pendingTest = nil
      let settings = try await api.liveActivitySettings(token: token, installationId: installationId)
      guard generation == requestGeneration else { return }
      sessions = settings.sessions; canTest = settings.canTest == true
    } catch {
      if generation == requestGeneration {
        if case APIError.server(_, let code) = error, (400..<500).contains(code) { pendingTest = nil }
        testMessage = "\(error.localizedDescription) Refresh the connection before retrying."
      }
    }
  }
  func follow(gameId: String) async {
    guard !busy, authorized, preferences.enabled, let tokenProvider, let userId else { return }
    busy = true
    let requestGeneration = generation
    defer { busy = false }
    do {
      guard let token = try await tokenProvider() else { return }
      let seed = try await api.followLiveGame(token: token, input: .init(installationId: installationId, gameId: gameId))
      guard generation == requestGeneration, seed.attributes.userId == userId else { return }
      if Activity<PickActivityAttributes>.activities.contains(where: { $0.attributes.sessionId == seed.attributes.sessionId }) {
        statusMessage = "You're already following this game."; return
      }
      let activity = try Activity.request(attributes: seed.attributes,
        content: ActivityContent(state: seed.state, staleDate: seed.state.staleDate), pushType: .token)
      observeActivity(activity)
      if let pushToken = activity.pushToken { await upload(activity, token: pushToken) }
      let settings = try await api.liveActivitySettings(token: token, installationId: installationId)
      guard generation == requestGeneration else { return }
      sessions = settings.sessions; statusMessage = "Following this game. Check your Lock Screen or Dynamic Island."
    } catch { if generation == requestGeneration { statusMessage = error.localizedDescription } }
  }
  func stop(sessionId: String) async {
    for activity in Activity<PickActivityAttributes>.activities where activity.attributes.sessionId == sessionId {
      await Self.endActivity(id: activity.id)
    }
    do {
      if let token = try await tokenProvider?() {
        _ = try await api.updateLiveActivity(token: token, input: .init(installationId: installationId, sessionId: sessionId), stop: true)
      }
      sessions.removeAll { $0.sessionId == sessionId }
      statusMessage = "Activity stopped. It won't restart in this window."
    } catch { statusMessage = "Stopped on this iPhone. Reconnect to finish syncing the change." }
  }
  private func observeActivity(_ activity: Activity<PickActivityAttributes>) {
    guard activityTasks[activity.id] == nil else { return }
    activityTasks[activity.id] = [
      Task { [weak self] in
        for await token in activity.pushTokenUpdates {
          guard let self, !Task.isCancelled else { return }
          await upload(activity, token: token)
        }
      },
      Task { [weak self] in
        for await state in activity.activityStateUpdates {
          guard let self, !Task.isCancelled else { return }
          if state == .dismissed || state == .ended {
            if activity.attributes.userId == userId, let token = try? await tokenProvider?() {
              _ = try? await api.updateLiveActivity(token: token, input: .init(installationId: installationId,
                sessionId: activity.attributes.sessionId, activityId: activity.id, status: state == .dismissed ? "dismissed" : "ended"))
            }
            sessions.removeAll { $0.sessionId == activity.attributes.sessionId }
            activityTasks.removeValue(forKey: activity.id)?.forEach { $0.cancel() }; return
          }
        }
      }
    ]
    if let token = activity.pushToken { Task { await upload(activity, token: token) } }
  }
  private func upload(_ activity: Activity<PickActivityAttributes>, token: Data) async {
    guard activity.attributes.userId == userId, let tokenProvider else { return }
    let requestGeneration = generation
    do {
      guard let authToken = try await tokenProvider(), generation == requestGeneration else { return }
      _ = try await api.updateLiveActivity(token: authToken, input: .init(installationId: installationId,
        sessionId: activity.attributes.sessionId, activityId: activity.id, updateToken: hex(token), status: "active"))
    } catch {
      if generation == requestGeneration { statusMessage = "The activity is waiting to sync. Open this screen to retry." }
      // ActivityKit retains the latest token for foreground retries. Never log it.
    }
  }
  func unregisterBeforeSignOut() async {
    if let token = try? await tokenProvider?() { _ = try? await api.removeLiveActivities(token: token, installationId: installationId) }
    await disconnect()
  }
  func disconnect() async {
    generation = UUID(); userId = nil; tokenProvider = nil; loaded = false; registered = false; sessions = []; preferences = .init()
    pendingDestination = nil; await endLocal()
    canTest = false; pendingTest = nil
  }
  private func endLocal(exceptUser: String? = nil) async {
    for activity in Activity<PickActivityAttributes>.activities where activity.attributes.userId != exceptUser { await Self.endActivity(id: activity.id) }
    for activity in Activity<WeekRaceAttributes>.activities { await activity.end(nil, dismissalPolicy: .immediate) }
  }
  private func hex(_ data: Data) -> String { data.map { String(format: "%02x", $0) }.joined() }
  // Resolve inside the nonisolated operation rather than sending the observed MainActor instance across actors.
  nonisolated private static func endActivity(id: String) async {
    if let activity = Activity<PickActivityAttributes>.activities.first(where: { $0.id == id }) {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }
  #if DEBUG
  static func preview() -> LiveActivityManager {
    let model = LiveActivityManager(observe: false)
    model.loaded = true; model.registered = true; model.deliveryConfigured = true; model.authorized = true
    model.preferences.enabled = true; model.statusMessage = "Preview only. No notifications will be sent."
    model.canTest = true
    return model
  }
  #endif
}
