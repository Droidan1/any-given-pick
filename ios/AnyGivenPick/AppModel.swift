import Foundation
import Observation

@MainActor
@Observable
final class AppModel {
  enum HealthState: Equatable {
    case idle
    case loading
    case healthy(HealthStatus)
    case failed(String)
  }

  enum LivePicksFeedState: Equatable {
    case idle
    case refreshing
    case live(Date)
    case stale
  }

  enum StandingsState {
    case idle
    case loading
    case loaded(MobileStandingsSnapshot)
    case failed(String)
  }

  enum AchievementsState {
    case idle
    case loading
    case loaded(MobilePlayerAchievements)
    case failed(String)
  }

  var selectedTab: AppTab = .home
  private(set) var healthState: HealthState = .idle
  private(set) var bootstrap: MobileBootstrap?
  private(set) var isLoadingAccount = false
  private(set) var accountError: String?
  private(set) var entryActionMessage: String?
  private(set) var isSavingEntry = false
  private(set) var livePicksFeedState: LivePicksFeedState = .idle
  private(set) var standingsState: StandingsState = .idle
  private(set) var achievementsState: AchievementsState = .idle
  var draftPicks: [String: String] = [:]
  var mondayPrediction: Int?
  var draftRevision = 0

  private let apiClient: APIClient

  init(apiClient: APIClient = .production) {
    self.apiClient = apiClient
  }

  func refreshHealth() async {
    healthState = .loading
    do {
      healthState = .healthy(try await apiClient.fetchHealth())
    } catch is CancellationError {
      return
    } catch {
      healthState = .failed("The server could not be reached. Pull to try again.")
    }
  }

  func loadAuthenticatedAccount(token: String) async {
    isLoadingAccount = true
    accountError = nil
    defer { isLoadingAccount = false }
    do {
      let response = try await apiClient.fetchBootstrap(token: token)
      bootstrap = response
      configureDraft(from: response.currentWeek)
      if response.currentWeek != nil {
        livePicksFeedState = .live(Date())
      }
    } catch is CancellationError {
      return
    } catch {
      accountError = error.localizedDescription
    }
  }

  func showAccountError(_ message: String) {
    accountError = message
  }

  func showEntryError(_ message: String) {
    entryActionMessage = message
  }

  func clearAuthenticatedAccount() {
    bootstrap = nil
    accountError = nil
    entryActionMessage = nil
    draftPicks = [:]
    mondayPrediction = nil
    draftRevision = 0
    livePicksFeedState = .idle
    standingsState = .idle
    achievementsState = .idle
    selectedTab = .home
  }

  func refreshLivePicks(token: String, weekId: String) async {
    guard bootstrap?.currentWeek?.id == weekId else { return }

    livePicksFeedState = .refreshing
    do {
      let players = try await apiClient.fetchLivePicks(token: token, weekId: weekId)
      guard let current = bootstrap,
            let week = current.currentWeek,
            week.id == weekId else { return }
      let refreshedWeek = MobilePlayerWeek(
        id: week.id,
        season: week.season,
        seasonPhase: week.seasonPhase,
        weekNumber: week.weekNumber,
        label: week.label,
        entryDeadline: week.entryDeadline,
        deadlineLabel: week.deadlineLabel,
        isLocked: week.isLocked,
        games: week.games,
        entry: week.entry,
        livePlayerPicks: players
      )
      bootstrap = MobileBootstrap(
        serverNow: current.serverNow,
        user: current.user,
        currentWeek: refreshedWeek,
        results: current.results
      )
      livePicksFeedState = .live(Date())
    } catch is CancellationError {
      return
    } catch {
      livePicksFeedState = .stale
    }
  }

  func markLivePicksStale() {
    livePicksFeedState = .stale
  }

  func select(teamCode: String, for gameId: String) {
    draftPicks[gameId] = teamCode
    entryActionMessage = nil
  }

  func saveDraft(token: String) async {
    guard let week = bootstrap?.currentWeek else { return }
    isSavingEntry = true
    entryActionMessage = "Saving your calls…"
    defer { isSavingEntry = false }
    do {
      let result = try await apiClient.saveDraft(
        token: token,
        payload: EntryMutationPayload(
          weekId: week.id,
          picks: draftPicks,
          mondayPrediction: mondayPrediction,
          baseDraftRevision: draftRevision
        )
      )
      applyEntryResult(result)
    } catch {
      entryActionMessage = error.localizedDescription
    }
  }

  func submitEntry(token: String) async {
    guard let week = bootstrap?.currentWeek else { return }
    isSavingEntry = true
    entryActionMessage = "Submitting your official card…"
    defer { isSavingEntry = false }
    do {
      let result = try await apiClient.submitEntry(
        token: token,
        payload: EntrySubmissionPayload(
          weekId: week.id,
          picks: draftPicks,
          mondayPrediction: mondayPrediction,
          baseDraftRevision: draftRevision,
          submissionKey: UUID().uuidString.lowercased()
        )
      )
      applyEntryResult(result)
      if result.ok {
        let refreshed = try await apiClient.fetchBootstrap(token: token)
        bootstrap = refreshed
        configureDraft(from: refreshed.currentWeek)
      }
    } catch {
      entryActionMessage = error.localizedDescription
    }
  }

  func refreshResults(token: String) async {
    guard var current = bootstrap else { return }
    do {
      let results = try await apiClient.fetchResults(token: token)
      current = MobileBootstrap(
        serverNow: current.serverNow,
        user: current.user,
        currentWeek: current.currentWeek,
        results: results
      )
      bootstrap = current
    } catch is CancellationError {
      return
    } catch {
      accountError = error.localizedDescription
    }
  }

  func refreshStandings(token: String) async {
    standingsState = .loading
    do {
      standingsState = .loaded(try await apiClient.fetchStandings(token: token))
    } catch is CancellationError {
      return
    } catch {
      standingsState = .failed(error.localizedDescription)
    }
  }

  func refreshAchievements(token: String) async {
    achievementsState = .loading
    do {
      achievementsState = .loaded(try await apiClient.fetchAchievements(token: token))
    } catch is CancellationError {
      return
    } catch {
      achievementsState = .failed(error.localizedDescription)
    }
  }

  private func configureDraft(from week: MobilePlayerWeek?) {
    draftPicks = week?.entry?.draftPicks ?? [:]
    mondayPrediction = week?.entry?.mondayPrediction
    draftRevision = week?.entry?.draftRevision ?? 0
    entryActionMessage = week?.entry == nil ? nil : "Your saved card is loaded."
  }

  private func applyEntryResult(_ result: MobileEntryActionResult) {
    entryActionMessage = result.message
    if let revision = result.draftRevision ?? result.receipt?.draftRevision {
      draftRevision = revision
    }
    if let serverDraft = result.serverDraft {
      draftPicks = serverDraft.picks
      mondayPrediction = serverDraft.mondayPrediction
      draftRevision = serverDraft.draftRevision
      entryActionMessage = "A newer draft from another device was restored."
    }
  }

  #if DEBUG
  func loadStandingsPreview() {
    standingsState = .loaded(
      MobileStandingsSnapshot(
        status: "ready",
        season: 2026,
        weekOneFinalGames: 16,
        weekOneGameCount: 16,
        throughWeek: 4,
        rows: [
          MobileStandingRow(rank: 1, rankChange: 2, userId: "player-1", displayName: "Napalm", profilePhotoUrl: nil, correctPicks: 43, gradedPicks: 61, tiebreakerDiff: 7),
          MobileStandingRow(rank: 2, rankChange: -1, userId: "player-2", displayName: "Fourth Down", profilePhotoUrl: nil, correctPicks: 41, gradedPicks: 61, tiebreakerDiff: 4),
          MobileStandingRow(rank: 3, rankChange: nil, userId: "player-3", displayName: "Hail Mary", profilePhotoUrl: nil, correctPicks: 38, gradedPicks: 61, tiebreakerDiff: 12),
          MobileStandingRow(rank: 4, rankChange: 1, userId: "player-4", displayName: "Red Zone", profilePhotoUrl: nil, correctPicks: 36, gradedPicks: 61, tiebreakerDiff: nil),
        ]
      )
    )
  }

  func loadAchievementsPreview() {
    achievementsState = .loaded(
      MobilePlayerAchievements(
        achievements: [
          MobilePlayerAchievement(id: "first_call", symbol: "1", title: "First call", description: "Submit your first official weekly card.", earned: true, earnedOn: "2026 Week 1", progress: 1, target: 1, progressLabel: "1 of 1 official card"),
          MobilePlayerAchievement(id: "film_room", symbol: "3", title: "Film room regular", description: "Finish three weeks with an official card on the board.", earned: true, earnedOn: "2026 Week 3", progress: 3, target: 3, progressLabel: "3 of 3 finished weeks"),
          MobilePlayerAchievement(id: "double_digits", symbol: "10", title: "Double digits", description: "Call at least 10 winners on one official card.", earned: false, earnedOn: nil, progress: 8, target: 10, progressLabel: "8 of 10 correct calls in one week"),
          MobilePlayerAchievement(id: "hot_route", symbol: "5×", title: "Hot route", description: "String together five correct calls in a row.", earned: false, earnedOn: nil, progress: 4, target: 5, progressLabel: "4 of 5 straight correct calls"),
        ],
        earnedCount: 2,
        totalCount: 4
      )
    )
  }
  #endif
}
