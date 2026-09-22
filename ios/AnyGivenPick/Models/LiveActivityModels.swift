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
  var id: String { sessionId }
}
struct LiveActivitySettings: Codable, Sendable {
  let registered: Bool
  let deliveryConfigured: Bool
  let preferences: LiveActivityPreferences
  let sessions: [LiveActivitySessionSummary]
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
