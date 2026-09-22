import ActivityKit
import Foundation

struct PickActivityAttributes: ActivityAttributes, Sendable {
  enum Kind: String, Codable, Hashable, Sendable { case deadline, game, race }
  struct ContentState: Codable, Hashable, Sendable {
    var title: String
    var detail: String
    var updatedAt: Double
    var staleAt: Double
    var deadline: Double
    var picksSaved: Int
    var totalGames: Int
    var correct: Int
    var remaining: Int
    var rank: Int?
    var playerCount: Int
    var behind: Int
    var awayCode: String
    var homeCode: String
    var awayScore: Int?
    var homeScore: Int?
    var gameStatus: String
    var clock: String
    var selectedTeam: String

    var deadlineDate: Date { Date(timeIntervalSince1970: deadline) }
    var staleDate: Date { Date(timeIntervalSince1970: staleAt) }
  }
  let sessionId: String
  let userId: String
  let weekId: String
  let weekLabel: String
  let kind: Kind
  let gameId: String

  var destinationURL: URL? {
    var url = URLComponents()
    url.scheme = "anygivenpick"
    url.host = "activity"
    url.queryItems = [URLQueryItem(name: "kind", value: kind.rawValue), URLQueryItem(name: "week", value: weekId), URLQueryItem(name: "user", value: userId)]
    return url.url
  }
}

struct ActivityDestination: Equatable {
  let kind: PickActivityAttributes.Kind
  let weekId: String
  let userId: String
  init?(url: URL) {
    guard url.scheme == "anygivenpick", url.host == "activity", let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
    let items = parts.queryItems ?? []
    func value(_ key: String) -> String? { items.first(where: { $0.name == key })?.value }
    guard let kind = value("kind").flatMap(PickActivityAttributes.Kind.init(rawValue:)),
      let week = value("week"), UUID(uuidString: week) != nil,
      let user = value("user"), UUID(uuidString: user) != nil else { return nil }
    self.kind = kind; weekId = week; userId = user
  }
}

extension PickActivityAttributes {
  static func example(_ kind: Kind) -> Self {
    .init(sessionId: "00000000-0000-4000-8000-000000000001", userId: "00000000-0000-4000-8000-000000000002",
      weekId: "00000000-0000-4000-8000-000000000003", weekLabel: "Week 3", kind: kind, gameId: "")
  }
  static var exampleState: ContentState {
    let now = Date().timeIntervalSince1970
    return .init(title: "Live week race", detail: "4 live · Projected position, not final standings", updatedAt: now, staleAt: now + 180,
      deadline: now + 29 * 60, picksSaved: 12, totalGames: 16, correct: 8, remaining: 5, rank: 3, playerCount: 24, behind: 2,
      awayCode: "IND", homeCode: "HOU", awayScore: 24, homeScore: 20, gameStatus: "in_progress", clock: "4th · 05:42", selectedTeam: "")
  }
}
