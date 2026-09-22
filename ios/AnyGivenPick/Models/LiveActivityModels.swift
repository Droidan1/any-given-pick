import Foundation

struct LiveActivityPreferences: Codable, Equatable, Sendable {
  var enabled = false
  var deadline = true
  var race = true
}
struct LiveActivitySessionSummary: Codable, Identifiable, Sendable {
  let sessionId: String
  let kind: String
  let gameId: String?
  let status: String
  var isTest: Bool? = nil
  var failureCount: Int? = nil
  var id: String { sessionId }
  var isRunning: Bool { ["pending", "starting", "active", "ending"].contains(status) }
  var title: String { kind == "deadline" ? "Card deadline" : kind == "race" ? "Daily race" : "Followed game" }
  var testStatus: String {
    if (failureCount ?? 0) > 0 && isRunning { return "Delivery retry pending. Refresh shortly." }
    switch status {
    case "pending": return "Queued — lock your iPhone"
    case "starting": return "Start requested — waiting for iPhone registration"
    case "active": return "Registered on iPhone — check the Lock Screen"
    case "ending": return "Ending — waiting for delivery"
    case "ended": return "Test finished"
    case "dismissed": return "Test stopped"
    case "failed": return "Delivery failed — refresh, then try again"
    default: return "Refresh to check the test"
    }
  }
}
struct LiveActivitySettings: Codable, Sendable {
  let registered: Bool
  let deliveryConfigured: Bool
  let preferences: LiveActivityPreferences
  let sessions: [LiveActivitySessionSummary]
  var canTest: Bool? = nil
}
struct LiveActivityRegistration: Encodable {
  let installationId: String
  let environment: String
  let pushToStartToken: String?
  let authorized: Bool
  let preferences: LiveActivityPreferences
  enum CodingKeys: CodingKey { case installationId, environment, pushToStartToken, authorized, preferences }
  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    try c.encode(installationId, forKey: .installationId)
    try c.encode(environment, forKey: .environment)
    if let pushToStartToken { try c.encode(pushToStartToken, forKey: .pushToStartToken) }
    else { try c.encodeNil(forKey: .pushToStartToken) }
    try c.encode(authorized, forKey: .authorized)
    try c.encode(preferences, forKey: .preferences)
  }
}
struct LiveActivityCommand: Encodable {
  let installationId: String
  var sessionId: String?
  var gameId: String?
  var activityId: String?
  var updateToken: String?
  var status: String?
}
struct LiveActivitySeed: Decodable {
  let attributes: PickActivityAttributes
  let state: PickActivityAttributes.ContentState
}
struct LiveActivityOK: Decodable { let ok: Bool }
struct LiveActivityTestCommand: Encodable {
  let installationId: String
  let kind: PickActivityAttributes.Kind
  let requestId: String
}
struct LiveActivityTestResponse: Decodable {
  let sessionId: String
  let mode: String
  let endsAt: String
  let seed: LiveActivitySeed?
}
