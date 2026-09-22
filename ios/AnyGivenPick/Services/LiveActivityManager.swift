import ActivityKit
import Foundation
import Observation

@MainActor
@Observable
final class LiveActivityManager {
  private(set) var statusMessage = "No demo is running."
  private(set) var hasActiveActivity = false
  private var updateStep = 0

  func startDemo() async {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      statusMessage = "Live Activities are disabled for this device or app."
      return
    }

    if let current = Activity<WeekRaceAttributes>.activities.first {
      updateStep += 1
      let state = WeekRaceAttributes.ContentState(
        correctPicks: 8 + updateStep,
        completedGames: min(16, 11 + updateStep),
        totalGames: 16,
        rank: max(1, 4 - updateStep),
        liveSummary: "IND 24 · HOU 20 · 4th"
      )
      await current.update(ActivityContent(state: state, staleDate: Date().addingTimeInterval(300)))
      hasActiveActivity = true
      statusMessage = "The demo Live Activity was updated."
      return
    }

    let attributes = WeekRaceAttributes(
      weekID: "demo-week",
      weekLabel: "Week 3",
      playerName: "Your card"
    )
    let state = WeekRaceAttributes.ContentState(
      correctPicks: 8,
      completedGames: 11,
      totalGames: 16,
      rank: 4,
      liveSummary: "IND 17 · HOU 20 · 3rd"
    )

    do {
      _ = try Activity.request(
        attributes: attributes,
        content: ActivityContent(state: state, staleDate: Date().addingTimeInterval(300)),
        pushType: nil
      )
      hasActiveActivity = true
      statusMessage = "Demo started. Lock the phone or check the Dynamic Island."
    } catch {
      statusMessage = "The demo could not start: \(error.localizedDescription)"
    }
  }

  func endDemo() async {
    let finalState = WeekRaceAttributes.ContentState(
      correctPicks: 12,
      completedGames: 16,
      totalGames: 16,
      rank: 2,
      liveSummary: "Week complete"
    )

    for activity in Activity<WeekRaceAttributes>.activities {
      await activity.end(
        ActivityContent(state: finalState, staleDate: nil),
        dismissalPolicy: .immediate
      )
    }

    hasActiveActivity = false
    updateStep = 0
    statusMessage = "The demo Live Activity ended."
  }
}

