import ActivityKit
import Foundation

struct WeekRaceAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    let correctPicks: Int
    let completedGames: Int
    let totalGames: Int
    let rank: Int?
    let liveSummary: String
  }

  let weekID: String
  let weekLabel: String
  let playerName: String
}

