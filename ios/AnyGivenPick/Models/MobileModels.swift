import Foundation

struct MobileBootstrap: Decodable, Sendable {
  let serverNow: String
  let user: MobileUser
  let currentWeek: MobilePlayerWeek?
  let results: MobileWeeklyResults?
}

struct MobileUser: Decodable, Sendable {
  let id: String
  let displayName: String?
  let isAdmin: Bool
  let account: MobileAccountSummary
}

struct MobileAccountSummary: Decodable, Sendable {
  let displayName: String?
  let accountState: String
  let stateReason: String?
  let verifiedAuth: Bool
  let ageEligible: Bool?
  let overallResult: String
  let reason: String
  let reasonLabel: String
  let profileComplete: Bool

  var canParticipate: Bool { overallResult == "eligible" }
}

struct MobilePlayerWeek: Decodable, Sendable, Identifiable {
  let id: String
  let season: Int
  let seasonPhase: String
  let weekNumber: Int
  let label: String
  let entryDeadline: String
  let deadlineLabel: String
  let isLocked: Bool
  let games: [MobileGame]
  let entry: MobileEntry?
  let livePlayerPicks: [MobileLivePlayerPicks]
}

struct MobileGame: Decodable, Sendable, Identifiable {
  let id: String
  let kickoffAt: String
  let status: String
  let day: String
  let time: String
  let away: MobileTeam
  let home: MobileTeam
  let awayScore: Int?
  let homeScore: Int?
  let isMondayTiebreaker: Bool
  let odds: MobileOdds?
  var scorePeriod: Int? = nil
  var scoreClock: String? = nil
  var scoreDetail: String? = nil
  var scoreCheckedAt: String? = nil
}

struct MobileTeam: Decodable, Sendable {
  let abbreviation: String
  let name: String
}

struct MobileOdds: Decodable, Sendable {
  let awayMoneyline: Int?
  let homeMoneyline: Int?
  let overUnder: Double?
  let provider: String
  let updatedAt: String
}

struct MobileEntry: Decodable, Sendable {
  let id: String
  let status: String
  let draftPicks: [String: String]
  let draftRevision: Int
  let officialPicks: [String: String]
  let mondayPrediction: Int?
  let officialMondayPrediction: Int?
  let currentVersionNumber: Int
  let submittedAt: String?
  let updatedAt: String
}

struct MobileLivePlayerPicks: Decodable, Sendable, Identifiable {
  let userId: String
  let displayName: String
  let picks: [String: String]
  let updatedAt: String?

  var id: String { userId }
}

struct MobileLivePicksEnvelope: Decodable, Sendable {
  let players: [MobileLivePlayerPicks]
}

struct MobileWeeklyResults: Decodable, Sendable {
  let weeks: [MobileResultsWeek]
  let selectedWeek: MobileResultsWeek?
  let revealStatus: String
  let serverNow: String
  let games: [MobileResultGame]
  let entries: [MobileResultEntry]
  let distributions: [MobilePickDistribution]
}

struct MobileResultsWeek: Decodable, Sendable, Identifiable {
  let id: String
  let season: Int
  let seasonPhase: String
  let weekNumber: Int
  let label: String
  let entryDeadline: String
}

struct MobileResultGame: Decodable, Sendable, Identifiable {
  let id: String
  let kickoffAt: String
  let awayTeamCode: String
  let awayTeamName: String
  let homeTeamCode: String
  let homeTeamName: String
  let awayScore: Int?
  let homeScore: Int?
  let status: String
  let isMondayTiebreaker: Bool
}

struct MobileResultEntry: Decodable, Sendable, Identifiable {
  let userId: String
  let displayName: String
  let profilePhotoUrl: String?
  let isCurrentUser: Bool
  let versionNumber: Int
  let committedAt: String
  let mondayPrediction: Int
  let correctPicks: Int
  let gradedPicks: Int
  let picks: [MobileResultPick]

  var id: String { userId }
}

struct MobileResultPick: Decodable, Sendable, Identifiable {
  let gameId: String
  let kickoffAt: String
  let awayTeamCode: String
  let awayTeamName: String
  let homeTeamCode: String
  let homeTeamName: String
  let awayScore: Int?
  let homeScore: Int?
  let gameStatus: String
  let isMondayTiebreaker: Bool
  let selectedTeamCode: String
  let selectedTeamName: String
  let outcome: String

  var id: String { gameId }
}

struct MobilePickDistribution: Decodable, Sendable, Identifiable {
  let gameId: String
  let awayTeamCode: String
  let homeTeamCode: String
  let awayCount: Int
  let homeCount: Int
  let totalPicks: Int
  let awayPercent: Int
  let homePercent: Int

  var id: String { gameId }
}

struct MobileLiveRaceEnvelope: Decodable, Sendable {
  let race: MobileLiveRace
}

struct MobileLiveRace: Decodable, Sendable {
  let status: String
  let week: MobileResultsWeek?
  let serverNow: String
  let finalCount: Int
  let liveCount: Int
  let waitingCount: Int
  let gamesToFeature: [MobileLiveRaceGame]
  let players: [MobileLiveRacePlayer]
}

struct MobileLiveRaceGame: Decodable, Sendable, Identifiable {
  let id: String
  let kickoffAt: String
  let awayTeamCode: String
  let awayTeamName: String
  let homeTeamCode: String
  let homeTeamName: String
  let awayScore: Int?
  let homeScore: Int?
  let status: String
  let isMondayTiebreaker: Bool
  let displayStatus: String
}

struct MobileLiveRacePlayer: Decodable, Sendable, Identifiable {
  let userId: String
  let displayName: String
  let profilePhotoUrl: String?
  let isCurrentUser: Bool
  let rank: Int
  let baselineRank: Int
  let rankChange: Int
  let correct: Int
  let incorrect: Int
  let live: Int
  let pending: Int
  let projectedCorrect: Int
  let maxCorrect: Int
  let mondayPrediction: Int
  let tiebreakerDiff: Int?
  let livePickCodes: [String]
  let unresolvedPickCodes: [String]
  let pathLabel: String
  let pathCopy: String

  var id: String { userId }
}

struct MobileStandingsEnvelope: Decodable, Sendable {
  let standings: MobileStandingsSnapshot
}

struct MobileStandingsSnapshot: Decodable, Sendable {
  let status: String
  let season: Int
  let weekOneFinalGames: Int
  let weekOneGameCount: Int
  let throughWeek: Int?
  let rows: [MobileStandingRow]
}

struct MobileStandingRow: Decodable, Sendable, Identifiable {
  let rank: Int
  let rankChange: Int?
  let userId: String
  let displayName: String
  let profilePhotoUrl: String?
  let correctPicks: Int
  let gradedPicks: Int
  let tiebreakerDiff: Int?

  var id: String { userId }
}

struct MobileAchievementsEnvelope: Decodable, Sendable {
  let achievements: MobilePlayerAchievements
}

struct MobilePlayerAchievements: Decodable, Sendable {
  let achievements: [MobilePlayerAchievement]
  let earnedCount: Int
  let totalCount: Int
}

struct MobilePlayerAchievement: Decodable, Sendable, Identifiable {
  let id: String
  let symbol: String
  let title: String
  let description: String
  let earned: Bool
  let earnedOn: String?
  let progress: Int
  let target: Int
  let progressLabel: String
}

struct EntryMutationPayload: Encodable, Sendable {
  let weekId: String
  let picks: [String: String]
  let mondayPrediction: Int?
  let baseDraftRevision: Int
}

struct EntrySubmissionPayload: Encodable, Sendable {
  let weekId: String
  let picks: [String: String]
  let mondayPrediction: Int?
  let baseDraftRevision: Int
  let submissionKey: String
}

struct EntryActionEnvelope: Decodable, Sendable {
  let result: MobileEntryActionResult
}

struct MobileEntryActionResult: Decodable, Sendable {
  let ok: Bool
  let code: String
  let message: String
  let syncedAt: String?
  let draftRevision: Int?
  let serverDraft: MobileServerDraft?
  let receipt: MobileEntryReceipt?
}

struct MobileServerDraft: Decodable, Sendable {
  let picks: [String: String]
  let mondayPrediction: Int?
  let draftRevision: Int
  let updatedAt: String
}

struct MobileEntryReceipt: Decodable, Sendable {
  let versionNumber: Int
  let committedAt: String
  let action: String
  let officialPicks: [String: String]
  let mondayPrediction: Int
  let draftRevision: Int
}

struct ResultsEnvelope: Decodable, Sendable {
  let results: MobileWeeklyResults
}
