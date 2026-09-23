import Foundation

/// Shared presentation rules. Only official entries are graded.
struct HomeWeekState {
  let week: MobilePlayerWeek
  let picks: [String: String]
  let prediction: Int?
  let now: Date
  static func date(_ value: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
  }
  var locked: Bool { week.isLocked || (Self.date(week.entryDeadline).map { now >= $0 } ?? true) }
  var hasOfficial: Bool { (week.entry?.currentVersionNumber ?? 0) > 0 && week.entry?.status != "disqualified" }
  var selectedCount: Int { week.games.filter { $0.isValidPick(picks[$0.id]) }.count }
  var missingCount: Int { max(0, week.games.count - selectedCount) }
  var needsPrediction: Bool { week.games.contains(where: \.isMondayTiebreaker) && prediction == nil }
  var hasUnsubmittedChanges: Bool {
    hasOfficial && (picks != week.entry?.officialPicks || prediction != week.entry?.officialMondayPrediction)
  }
  var countdown: String {
    guard let deadline = Self.date(week.entryDeadline), !locked else { return "Card locked" }
    let seconds = max(0, deadline.timeIntervalSince(now))
    if seconds < 60 { return "Locks in under a minute" }
    let minutes = Int(ceil(seconds / 60))
    if minutes >= 1440 { return "Locks in \(minutes / 1440)d \((minutes % 1440) / 60)h" }
    if minutes >= 60 { return "Locks in \(minutes / 60)h \(minutes % 60)m" }
    return "Locks in \(minutes)m"
  }
  var officialOutcomes: [String] {
    guard hasOfficial else { return [] }
    return week.games.map { $0.outcome(for: week.entry?.officialPicks[$0.id]) }
  }
  var correct: Int { officialOutcomes.filter { $0 == "Won" }.count }
  var incorrect: Int { officialOutcomes.filter { $0 == "Lost" }.count }
  var tied: Int { officialOutcomes.filter { $0 == "Tie" }.count }
  var canceled: Int { week.games.filter { $0.status == "canceled" }.count }
  var remaining: Int { week.games.filter { $0.status != "canceled" && ($0.status != "final" || $0.awayScore == nil || $0.homeScore == nil) }.count }
  var liveCount: Int { week.games.filter { $0.status == "in_progress" }.count }
  var finalCount: Int { week.games.filter { $0.status == "final" }.count }
  var upcomingCount: Int { week.games.filter { $0.status == "scheduled" }.count }
  var featured: MobileGame? {
    week.games.filter { $0.status == "in_progress" }.sorted {
      $0.scoreDifference == $1.scoreDifference ? $0.kickoffAt < $1.kickoffAt : $0.scoreDifference < $1.scoreDifference
    }.first ?? week.games.filter { $0.status == "scheduled" }.sorted { $0.kickoffAt < $1.kickoffAt }.first
      ?? week.games.sorted { $0.kickoffAt > $1.kickoffAt }.first
  }
}

extension MobileGame {
  var kickoffDate: Date? { HomeWeekState.date(kickoffAt) }
  var scoreDifference: Int {
    guard let awayScore, let homeScore else { return .max }
    return abs(awayScore - homeScore)
  }
  func isValidPick(_ code: String?) -> Bool {
    guard let code else { return false }
    return code == away.abbreviation || code == home.abbreviation
  }
  func outcome(for code: String?) -> String {
    guard isValidPick(code) else { return "No official pick" }
    if status == "canceled" { return "Canceled · not graded" }
    if status == "postponed" { return "Postponed" }
    guard ["final", "in_progress"].contains(status), let awayScore, let homeScore else { return "Pending" }
    if awayScore == homeScore { return status == "final" ? "Tie" : "Tied" }
    let winning = awayScore > homeScore ? away.abbreviation : home.abbreviation
    if status == "final" { return code == winning ? "Won" : "Lost" }
    return code == winning ? "Leading" : "Trailing"
  }
  var statusLabel: String {
    switch status {
    case "in_progress":
      if let scoreDetail, !scoreDetail.isEmpty { return scoreDetail }
      let period = scorePeriod.map { $0 > 4 ? "OT" : "Q\($0)" }
      let label = [period, scoreClock].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
      return label.isEmpty ? "Live" : label
    case "final": return (scorePeriod ?? 0) > 4 ? "Final · OT" : "Final"
    case "postponed": return "Postponed · awaiting reschedule"
    case "canceled": return "Canceled"
    default: return kickoffDate?.formatted(date: .abbreviated, time: .shortened) ?? "Kickoff to be confirmed"
    }
  }
}

extension MobilePlayerWeek {
  func withPlayers(_ players: [MobileLivePlayerPicks]) -> MobilePlayerWeek {
    .init(id: id, season: season, seasonPhase: seasonPhase, weekNumber: weekNumber, label: label,
      entryDeadline: entryDeadline, deadlineLabel: deadlineLabel, isLocked: isLocked, games: games, entry: entry, livePlayerPicks: players)
  }
}

#if DEBUG
enum HomePreviewFixture {
  static func bootstrap(_ mode: String = "draft", now: Date = Date()) -> MobileBootstrap {
    let locked = ["locked", "no-official", "stale"].contains(mode)
    let official = ["submitted", "locked", "stale"].contains(mode)
    let pairs = [("IND", "Indianapolis Colts", "HOU", "Houston Texans"), ("PIT", "Pittsburgh Steelers", "CLE", "Cleveland Browns"),
      ("BUF", "Buffalo Bills", "MIA", "Miami Dolphins"), ("DET", "Detroit Lions", "GB", "Green Bay Packers"),
      ("SF", "San Francisco 49ers", "LAR", "Los Angeles Rams"), ("SEA", "Seattle Seahawks", "ARI", "Arizona Cardinals"),
      ("DAL", "Dallas Cowboys", "NYG", "New York Giants"), ("KC", "Kansas City Chiefs", "LAC", "Los Angeles Chargers"),
      ("NYJ", "New York Jets", "NE", "New England Patriots"), ("BAL", "Baltimore Ravens", "CIN", "Cincinnati Bengals"),
      ("PHI", "Philadelphia Eagles", "WAS", "Washington Commanders"), ("NO", "New Orleans Saints", "ATL", "Atlanta Falcons"),
      ("CAR", "Carolina Panthers", "TB", "Tampa Bay Buccaneers"), ("JAX", "Jacksonville Jaguars", "TEN", "Tennessee Titans"),
      ("MIN", "Minnesota Vikings", "CHI", "Chicago Bears"), ("DEN", "Denver Broncos", "LV", "Las Vegas Raiders")]
    let games: [MobileGame] = mode == "empty" ? [] : pairs.enumerated().map { i, teams in
      let live = locked && i == 0
      let final = locked && (1...10).contains(i)
      return MobileGame(id: "game-\(i)", kickoffAt: now.addingTimeInterval(live ? -7200 : final ? -86400 : 7200 + Double(i) * 3600).ISO8601Format(), status: live ? "in_progress" : final ? "final" : "scheduled",
        day: "Thu", time: "8:15 PM ET", away: .init(abbreviation: teams.0, name: teams.1), home: .init(abbreviation: teams.2, name: teams.3),
        awayScore: live || final ? (i > 7 ? 10 : 20) : nil, homeScore: live || final ? 17 : nil, isMondayTiebreaker: i == 15,
        odds: .init(awayMoneyline: 120, homeMoneyline: -140, overUnder: i == 15 ? 44.5 : nil, provider: "Example lines", updatedAt: now.ISO8601Format()),
        scorePeriod: live ? 3 : final ? 4 : nil, scoreClock: live ? "4:12" : nil, scoreDetail: live ? "Q3 · 4:12" : nil, scoreCheckedAt: now.ISO8601Format())
    }
    let allPicks = Dictionary(uniqueKeysWithValues: games.map { ($0.id, $0.away.abbreviation) })
    let picks = official ? allPicks : Dictionary(uniqueKeysWithValues: games.prefix(14).map { ($0.id, $0.away.abbreviation) })
    let deadline = now.addingTimeInterval(locked ? -10800 : 5040)
    let entry = MobileEntry(id: "entry", status: official ? "submitted" : "draft", draftPicks: picks, draftRevision: 3,
      officialPicks: official ? allPicks : [:], mondayPrediction: official ? 45 : nil, officialMondayPrediction: official ? 45 : nil,
      currentVersionNumber: official ? 2 : 0, submittedAt: official ? now.addingTimeInterval(-18000).ISO8601Format() : nil, updatedAt: now.ISO8601Format())
    let account = MobileAccountSummary(displayName: "Napalm", accountState: mode == "blocked" ? "pending" : "active", stateReason: nil, verifiedAuth: true, ageEligible: true,
      overallResult: mode == "blocked" ? "read_only" : "eligible", reason: "preview", reasonLabel: "Waiting for commissioner approval.", profileComplete: true)
    return MobileBootstrap(serverNow: now.ISO8601Format(), user: .init(id: "preview-player", displayName: "Napalm", isAdmin: false, account: account),
      currentWeek: mode == "no-week" ? nil : .init(id: "preview-week", season: 2026, seasonPhase: "regular", weekNumber: 3, label: "Week 3",
        entryDeadline: deadline.ISO8601Format(), deadlineLabel: deadline.formatted(date: .abbreviated, time: .shortened), isLocked: locked, games: games, entry: entry, livePlayerPicks: []), results: nil)
  }
}
#endif
