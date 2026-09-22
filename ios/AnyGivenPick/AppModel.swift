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

  enum LiveRaceState {
    case idle
    case loading
    case loaded(MobileLiveRace)
    case failed(String)
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
  var navigationPaths: [AppTab: [AppRoute]] = [:]
  var notificationNavigationID = UUID()
  var notificationResultsWeekId: String?
  var liveRaceWeekId: String?
  private(set) var isLoadingResults = false
  private(set) var resultsError: String?
  private(set) var healthState: HealthState = .idle
  private(set) var bootstrap: MobileBootstrap?
  private(set) var isLoadingAccount = false
  private(set) var accountError: String?
  private(set) var entryActionMessage: String?
  private(set) var isSavingEntry = false
  private(set) var livePicksFeedState: LivePicksFeedState = .idle
  private(set) var liveRaceState: LiveRaceState = .idle
  private(set) var standingsState: StandingsState = .idle
  private(set) var achievementsState: AchievementsState = .idle
  var draftPicks: [String: String] = [:]
  var mondayPrediction: Int?
  var draftRevision = 0

  private let apiClient: APIClient
  private var resultsRequestID = UUID()

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
    navigationPaths = [:]
    liveRaceWeekId = nil
    bootstrap = nil
    accountError = nil
    entryActionMessage = nil
    draftPicks = [:]
    mondayPrediction = nil
    draftRevision = 0
    livePicksFeedState = .idle
    liveRaceState = .idle
    standingsState = .idle
    achievementsState = .idle
    selectedTab = .home
    notificationResultsWeekId = nil
    resultsRequestID = UUID()
    resultsError = nil
    isLoadingResults = false
    notificationNavigationID = UUID()
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

  func refreshWeekForNotification(token: String, weekId: String) async {
    guard let current = bootstrap else { return }
    do {
      let refreshed = try await apiClient.fetchBootstrap(token: token)
      guard refreshed.user.id == current.user.id,
        bootstrap?.user.id == current.user.id,
        refreshed.currentWeek?.id == weekId, bootstrap?.currentWeek?.id != weekId else { return }
      bootstrap = refreshed
      configureDraft(from: refreshed.currentWeek)
    } catch { /* Results remains the safe fallback for a no-longer-current week. */ }
  }

  func refreshResults(token: String) async {
    guard let userId = bootstrap?.user.id else { return }
    let requestID = UUID()
    resultsRequestID = requestID
    isLoadingResults = true
    resultsError = nil
    defer { if resultsRequestID == requestID { isLoadingResults = false } }
    do {
      let results = try await apiClient.fetchResults(token: token, weekId: notificationResultsWeekId)
      guard resultsRequestID == requestID, let current = bootstrap, current.user.id == userId else { return }
      bootstrap = MobileBootstrap(
        serverNow: current.serverNow,
        user: current.user,
        currentWeek: current.currentWeek,
        results: results
      )
    } catch is CancellationError {
      return
    } catch {
      if resultsRequestID == requestID { resultsError = error.localizedDescription }
    }
  }

  func refreshLiveRace(token: String) async {
    let hadLoadedRace: Bool
    if case .loaded = liveRaceState {
      hadLoadedRace = true
    } else {
      hadLoadedRace = false
      liveRaceState = .loading
    }

    do {
      let accountId = bootstrap?.user.id
      let weekId = liveRaceWeekId
      let race = try await apiClient.fetchLiveRace(token: token, weekId: weekId)
      guard bootstrap?.user.id == accountId, liveRaceWeekId == weekId else { return }
      liveRaceState = .loaded(race)
    } catch is CancellationError {
      return
    } catch {
      if !hadLoadedRace {
        liveRaceState = .failed(error.localizedDescription)
      }
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
  func loadLiveRacePreview() {
    liveRaceState = .loaded(
      MobileLiveRace(
        status: "ready",
        week: MobileResultsWeek(id: "week-3", season: 2026, seasonPhase: "regular", weekNumber: 3, label: "Week 3", entryDeadline: "2026-09-24T22:00:00.000Z"),
        serverNow: "2026-09-25T01:30:00.000Z",
        finalCount: 5,
        liveCount: 3,
        waitingCount: 8,
        gamesToFeature: [
          MobileLiveRaceGame(id: "game-1", kickoffAt: "2026-09-25T00:15:00.000Z", awayTeamCode: "IND", awayTeamName: "Indianapolis Colts", homeTeamCode: "HOU", homeTeamName: "Houston Texans", awayScore: 20, homeScore: 17, status: "in_progress", isMondayTiebreaker: false, displayStatus: "Live"),
          MobileLiveRaceGame(id: "game-2", kickoffAt: "2026-09-25T00:20:00.000Z", awayTeamCode: "PIT", awayTeamName: "Pittsburgh Steelers", homeTeamCode: "CLE", homeTeamName: "Cleveland Browns", awayScore: 13, homeScore: 10, status: "in_progress", isMondayTiebreaker: false, displayStatus: "Live"),
          MobileLiveRaceGame(id: "game-3", kickoffAt: "2026-09-28T00:20:00.000Z", awayTeamCode: "DAL", awayTeamName: "Dallas Cowboys", homeTeamCode: "NYG", homeTeamName: "New York Giants", awayScore: nil, homeScore: nil, status: "scheduled", isMondayTiebreaker: false, displayStatus: "Upcoming"),
        ],
        players: [
          MobileLiveRacePlayer(userId: "player-1", displayName: "Napalm", profilePhotoUrl: nil, isCurrentUser: true, rank: 1, baselineRank: 2, rankChange: 1, correct: 5, incorrect: 1, live: 2, pending: 8, projectedCorrect: 7, maxCorrect: 15, mondayPrediction: 47, tiebreakerDiff: nil, livePickCodes: ["IND", "PIT"], unresolvedPickCodes: ["IND", "PIT", "DAL"], pathLabel: "Projected first", pathCopy: "Napalm holds the projected lead. Open calls: IND, PIT, and DAL."),
          MobileLiveRacePlayer(userId: "player-2", displayName: "Fourth Down", profilePhotoUrl: nil, isCurrentUser: false, rank: 2, baselineRank: 1, rankChange: -1, correct: 6, incorrect: 0, live: 1, pending: 8, projectedCorrect: 6, maxCorrect: 15, mondayPrediction: 44, tiebreakerDiff: nil, livePickCodes: ["HOU"], unresolvedPickCodes: ["HOU", "PIT", "NYG"], pathLabel: "2 swing calls", pathCopy: "Fourth Down is 1 projected call back. Key differences: HOU and NYG."),
          MobileLiveRacePlayer(userId: "player-3", displayName: "Hail Mary", profilePhotoUrl: nil, isCurrentUser: false, rank: 3, baselineRank: 3, rankChange: 0, correct: 4, incorrect: 2, live: 2, pending: 8, projectedCorrect: 6, maxCorrect: 14, mondayPrediction: 51, tiebreakerDiff: nil, livePickCodes: ["IND", "CLE"], unresolvedPickCodes: ["IND", "CLE", "DAL"], pathLabel: "1 swing call", pathCopy: "Hail Mary is 1 projected call back. Key difference: CLE."),
        ]
      )
    )
  }

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
