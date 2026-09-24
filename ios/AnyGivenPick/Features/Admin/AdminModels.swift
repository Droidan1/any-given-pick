import Foundation

struct AdminPayload: Decodable, Sendable {
  var directory: AdminDirectory?
  var approvalRequired: Bool?
  var announcements: [AdminAnnouncement]?
  var board: AdminPicksBoard?
  var operations: AdminOperations?
}

struct AdminDirectory: Decodable, Sendable {
  let users: [AdminPlayer]
  let pendingCount: Int
  let identityDirectoryAvailable: Bool
  let truncated: Bool
}

struct AdminPlayer: Decodable, Identifiable, Sendable {
  let id: String
  let email: String?
  let name: String?
  let displayName: String?
  let status: String
  let statusLabel: String
  let isAdmin: Bool
  let isSelf: Bool
  let identityKnown: Bool
  let joinedLabel: String
  let lastSeenLabel: String
  var title: String { displayName ?? name ?? "Player account" }
  var canManage: Bool { !isAdmin && !isSelf && identityKnown }
}

struct AdminAnnouncement: Decodable, Identifiable, Sendable {
  let id: String
  let title: String
  let body: String
  let status: String
  let displayState: String
  let startsAt: String
  let expiresAt: String?
}

struct AdminPicksBoard: Decodable, Sendable {
  let weeks: [MobileResultsWeek]
  let selectedWeek: MobileResultsWeek?
  let revealStatus: String
  let players: [AdminPickCard]
  let submittedCount: Int
  let notSubmittedCount: Int
  let disqualifiedCount: Int
}

struct AdminPickCard: Decodable, Identifiable, Sendable {
  let userId: String
  let displayName: String
  let submissionStatus: String
  let entry: MobileResultEntry?
  var id: String { userId }
}

struct AdminOperations: Decodable, Sendable {
  let scoreSync: AdminScoreSync
  let alerts: [AdminOperationalAlert]
  let privacyRequests: [AdminPrivacyRequest]
  let alertEmailEnabled: Bool
}

struct AdminScoreSync: Decodable, Sendable {
  let health: AdminScoreHealth
  let ready: Bool
  let freshnessWindowMinutes: Int
}

struct AdminScoreHealth: Decodable, Sendable {
  let status: String
  let lastAttemptAt: String?
  let lastSuccessAt: String?
  let checkedGames: Int
  let updatedGames: Int
  let errorMessage: String?
}

struct AdminOperationalAlert: Decodable, Identifiable, Sendable {
  let fingerprint: String
  let kind: String
  let severity: String
  let message: String
  let occurrenceCount: Int
  let lastSeenAt: String
  var id: String { fingerprint }
}

struct AdminPrivacyRequest: Decodable, Identifiable, Sendable {
  let id: String
  let displayName: String
  let status: String
  let requestedAt: String
}

struct AdminCommand: Encodable, Sendable {
  let action: String
  var targetUserId: String?
  var intent: String?
  var id: String?
  var title: String?
  var body: String?
  var startsAt: String?
  var expiresAt: String?
}

struct AdminActionResult: Decodable, Sendable {
  let ok: Bool
  let message: String
}
