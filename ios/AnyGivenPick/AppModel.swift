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
  var draftPicks: [String: String] = [:] { didSet { persistDraft() } }
  var mondayPrediction: Int? { didSet { persistDraft() } }
  var draftRevision = 0
  private(set) var draftConflict: MobileServerDraft?
  private(set) var entryReceipt: MobileEntryReceipt?
  private var configuringDraft = false
  private var pendingSubmission: PendingEntrySubmission?
  private let draftStore: EntryDraftStore?
  private(set) var homeFeedError: String?
  private(set) var isRefreshingHome = false
  private(set) var homeRefreshedAt: Date?
  private(set) var homeFailureCount = 0
  private(set) var liveGamesWeek: MobilePlayerWeek?
  private(set) var homeRace: MobileLiveRace?
  private(set) var pendingHomeWeek: MobileBootstrap?
  private var homeRaceCheckedAt: Date?
  private(set) var isPreview = false
  private var savedPicks: [String: String] = [:]
  private var savedPrediction: Int?
  private var accountGeneration = UUID()
  private var homeRequestID = UUID()
  private var homeRequestKey: String?
  private var serverDate: Date?
  private var clockAnchor = ContinuousClock.now

  var hasUnsavedDraft: Bool { draftPicks != savedPicks || mondayPrediction != savedPrediction }
  var estimatedServerNow: Date {
    guard let serverDate else { return Date() }
    let elapsed = clockAnchor.duration(to: .now).components
    return serverDate.addingTimeInterval(Double(elapsed.seconds) + Double(elapsed.attoseconds) / 1e18)
  }
  func isLocked(_ week: MobilePlayerWeek) -> Bool {
    week.isLocked || (HomeWeekState.date(week.entryDeadline).map { estimatedServerNow >= $0 } ?? true)
  }

  private let apiClient: APIClient
  private var resultsRequestID = UUID()

  init(apiClient: APIClient = .production, draftStore: EntryDraftStore? = .persistent) {
    self.apiClient = apiClient
    self.draftStore = draftStore
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
    let generation = accountGeneration
    isLoadingAccount = true
    accountError = nil
    defer { if generation == accountGeneration { isLoadingAccount = false } }
    do {
      let response = try await apiClient.fetchBootstrap(token: token)
      guard generation == accountGeneration, !Task.isCancelled else { return }
      acceptAccount(response)
      if response.currentWeek != nil {
        livePicksFeedState = .live(Date())
      }
    } catch is CancellationError {
      return
    } catch {
      if generation == accountGeneration { accountError = error.localizedDescription }
    }
  }

  func showAccountError(_ message: String) {
    accountError = message
  }

  func showEntryError(_ message: String) {
    entryActionMessage = message
  }

  func clearAuthenticatedAccount() {
    if let key = draftStorageKey { draftStore?.remove(key) }
    configuringDraft = true
    defer { configuringDraft = false }
    draftConflict = nil
    entryReceipt = nil
    pendingSubmission = nil
    accountGeneration = UUID()
    homeRequestID = UUID()
    homeRequestKey = nil
    isRefreshingHome = false
    homeFeedError = nil
    homeRefreshedAt = nil
    homeFailureCount = 0
    liveGamesWeek = nil
    homeRace = nil
    pendingHomeWeek = nil
    homeRaceCheckedAt = nil
    serverDate = nil
    savedPicks = [:]
    savedPrediction = nil
    navigationPaths = [:]
    liveRaceWeekId = nil
    bootstrap = nil
    isLoadingAccount = false
    isSavingEntry = false
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
    let generation = accountGeneration

    livePicksFeedState = .refreshing
    do {
      let players = try await apiClient.fetchLivePicks(token: token, weekId: weekId)
      guard generation == accountGeneration, !Task.isCancelled, let current = bootstrap,
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
      if generation == accountGeneration { livePicksFeedState = .stale }
    }
  }

  func markLivePicksStale() {
    livePicksFeedState = .stale
  }

  func select(teamCode: String, for gameId: String) {
    guard let week = bootstrap?.currentWeek, !isLocked(week), !isSavingEntry,
      bootstrap?.user.account.canParticipate == true,
      let game = week.games.first(where: { $0.id == gameId }),
      teamCode == game.away.abbreviation || teamCode == game.home.abbreviation else { return }
    draftPicks[gameId] = teamCode
    entryActionMessage = nil
  }

  private func invalidateHomeRefresh() {
    homeRequestID = UUID()
    homeRequestKey = nil
    isRefreshingHome = false
  }

  func saveDraft(token: String) async {
    guard let week = bootstrap?.currentWeek, !isSavingEntry, !isLocked(week),
      bootstrap?.user.account.canParticipate == true, draftConflict == nil else { return }
    let generation = accountGeneration
    let submittedPicks = draftPicks
    let submittedPrediction = mondayPrediction
    invalidateHomeRefresh()
    isSavingEntry = true
    entryActionMessage = "Saving your calls…"
    defer { if generation == accountGeneration { isSavingEntry = false } }
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
      guard generation == accountGeneration, bootstrap?.currentWeek?.id == week.id else { return }
      applyEntryResult(result)
      if result.ok {
        savedPicks = submittedPicks; savedPrediction = submittedPrediction
        entryActionMessage = "Saved to the live board. Review and submit to make this card official."
        persistDraft()
      }
    } catch {
      if generation == accountGeneration { entryActionMessage = error.localizedDescription }
    }
  }

  func submitEntry(token: String, review: EntryReviewSnapshot) async -> Bool {
    guard reviewIsCurrent(review), let week = bootstrap?.currentWeek else {
      entryActionMessage = "This card changed or locked. Close review and check the current card before submitting."
      return false
    }
    let generation = accountGeneration
    let submittedPicks = review.picks
    let submittedPrediction = review.prediction
    let attempt = submissionAttempt(for: review)
    invalidateHomeRefresh()
    isSavingEntry = true
    entryActionMessage = "Submitting your official card…"
    defer { if generation == accountGeneration { isSavingEntry = false } }
    do {
      let result = try await apiClient.submitEntry(
        token: token,
        payload: EntrySubmissionPayload(
          weekId: week.id,
          picks: draftPicks,
          mondayPrediction: mondayPrediction,
          baseDraftRevision: review.revision,
          submissionKey: attempt.key
        )
      )
      guard generation == accountGeneration, bootstrap?.currentWeek?.id == week.id else { return false }
      applyEntryResult(result)
      if result.ok, let receipt = result.receipt {
        savedPicks = submittedPicks; savedPrediction = submittedPrediction
        entryReceipt = receipt
        pendingSubmission = nil
        installReceipt(receipt, week: week)
        persistDraft()
        // A refresh failure cannot undo an acknowledged official submission.
        do {
          let refreshed = try await apiClient.fetchBootstrap(token: token)
          guard generation == accountGeneration, !Task.isCancelled else { return false }
          acceptAccount(refreshed)
          if let currentWeek = bootstrap?.currentWeek, currentWeek.id == week.id,
            (currentWeek.entry?.currentVersionNumber ?? 0) < receipt.versionNumber {
            installReceipt(receipt, week: currentWeek)
          }
        } catch {
          if generation == accountGeneration {
            entryActionMessage = "Official card received. The board could not refresh; your receipt is safe."
          }
        }
        return true
      }
    } catch {
      if generation == accountGeneration { entryActionMessage = error.localizedDescription }
    }
    return false
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
    configuringDraft = true
    defer { configuringDraft = false }
    draftConflict = nil
    draftPicks = week?.entry?.draftPicks ?? [:]
    mondayPrediction = week?.entry?.mondayPrediction
    draftRevision = week?.entry?.draftRevision ?? 0
    savedPicks = draftPicks
    savedPrediction = mondayPrediction
    entryActionMessage = nil
    guard let week, !isLocked(week), let key = draftStorageKey,
      let local = draftStore?.load(key) else { return }
    let valid = local.picks.filter { id, code in
      week.games.contains { $0.id == id && ($0.away.abbreviation == code || $0.home.abbreviation == code) }
    }
    pendingSubmission = local.pendingSubmission
    guard valid != savedPicks || local.prediction != savedPrediction else { return }
    draftPicks = valid
    mondayPrediction = local.prediction.flatMap { (0...200).contains($0) ? $0 : nil }
    if local.revision != draftRevision {
      draftConflict = MobileServerDraft(picks: savedPicks, mondayPrediction: savedPrediction,
        draftRevision: draftRevision, updatedAt: week.entry?.updatedAt ?? "")
    }
    draftRevision = local.revision
    savedPicks = local.savedPicks
    savedPrediction = local.savedPrediction
    entryActionMessage = valid.count == local.picks.count
      ? "Recovered your changes on this iPhone. They have not been submitted."
      : "The schedule changed. Recovered matching picks; review the remaining games."
  }

  func applyEntryResult(_ result: MobileEntryActionResult) {
    entryActionMessage = result.message
    if let revision = result.draftRevision ?? result.receipt?.draftRevision {
      draftRevision = revision
    }
    if let serverDraft = result.serverDraft {
      draftConflict = serverDraft
      entryActionMessage = "Another device saved a different card. Your changes are still here. Choose which version to keep."
    }
  }

  // A score refresh must never replace work in progress or merge data from different accounts/weeks.
  func acceptAccount(_ response: MobileBootstrap, compact: Bool = false) {
    let sameAccount = bootstrap?.user.id == response.user.id
    let sameWeek = sameAccount && bootstrap?.currentWeek?.id == response.currentWeek?.id
    let preserveDraft = sameWeek && (hasUnsavedDraft || isSavingEntry)
    var week = response.currentWeek
    if compact, sameWeek, let incoming = week, let previous = bootstrap?.currentWeek {
      week = incoming.withPlayers(previous.livePlayerPicks)
    }
    if !sameWeek { entryReceipt = nil; pendingSubmission = nil }
    bootstrap = MobileBootstrap(serverNow: response.serverNow, user: response.user, currentWeek: week,
      results: compact && sameAccount ? bootstrap?.results : response.results)
    serverDate = HomeWeekState.date(response.serverNow)
    clockAnchor = .now
    if !preserveDraft { configureDraft(from: week) }
    else if let week {
      let valid = draftPicks.filter { id, code in
        week.games.contains { $0.id == id && ($0.away.abbreviation == code || $0.home.abbreviation == code) }
      }
      if valid != draftPicks {
        draftPicks = valid
        pendingSubmission = nil
        entryActionMessage = "The schedule changed. Kept matching picks; review the remaining games."
        persistDraft()
      }
    }
  }

  var draftStatus: String {
    if hasUnsavedDraft { return "Changes on this iPhone · not shared yet" }
    if let week = bootstrap?.currentWeek, (week.entry?.currentVersionNumber ?? 0) > 0 {
      return draftPicks == week.entry?.officialPicks && mondayPrediction == week.entry?.officialMondayPrediction
        ? "Official card received" : "Saved to board · changes not submitted"
    }
    return "Saved to board · not submitted"
  }

  func resolveDraftConflict(keepMine: Bool) {
    guard let conflict = draftConflict, let week = bootstrap?.currentWeek, !isLocked(week), !isSavingEntry else { return }
    configuringDraft = true
    draftRevision = conflict.draftRevision
    savedPicks = conflict.picks
    savedPrediction = conflict.mondayPrediction
    if !keepMine { draftPicks = conflict.picks; mondayPrediction = conflict.mondayPrediction }
    configuringDraft = false
    draftConflict = nil
    pendingSubmission = nil
    entryActionMessage = keepMine ? "Your changes are kept here. Save or review to send them."
      : "The saved board version is loaded. Review it before submitting."
    persistDraft()
  }

  func makeEntryReview() -> EntryReviewSnapshot? {
    guard let week = bootstrap?.currentWeek, let user = bootstrap?.user else { return nil }
    let snapshot = EntryReviewSnapshot(userId: user.id, week: week, picks: draftPicks,
      prediction: mondayPrediction, revision: draftRevision)
    return reviewIsCurrent(snapshot) ? snapshot : nil
  }

  func reviewIsCurrent(_ review: EntryReviewSnapshot) -> Bool {
    guard let week = bootstrap?.currentWeek, bootstrap?.user.id == review.userId,
      bootstrap?.user.account.canParticipate == true, !isSavingEntry, !isLocked(week),
      draftConflict == nil, !week.games.isEmpty, week.id == review.week.id,
      EntryReviewSnapshot.slateKey(week) == EntryReviewSnapshot.slateKey(review.week),
      draftRevision == review.revision, draftPicks == review.picks, mondayPrediction == review.prediction,
      let prediction = review.prediction, (0...200).contains(prediction) else { return false }
    return week.games.allSatisfy { review.picks[$0.id] == $0.away.abbreviation || review.picks[$0.id] == $0.home.abbreviation }
      && review.picks.count == week.games.count
  }

  func submissionAttempt(for review: EntryReviewSnapshot) -> PendingEntrySubmission {
    if let pendingSubmission, pendingSubmission.matches(review) { return pendingSubmission }
    let attempt = PendingEntrySubmission(key: UUID().uuidString.lowercased(), weekId: review.week.id,
      picks: review.picks, prediction: review.prediction, revision: review.revision)
    pendingSubmission = attempt
    persistDraft()
    return attempt
  }

  private var draftStorageKey: String? {
    guard let user = bootstrap?.user.id, let week = bootstrap?.currentWeek?.id else { return nil }
    return "agp.entry.v1.\(apiClient.baseURL.absoluteString).\(user).\(week)"
  }

  private func persistDraft() {
    guard !configuringDraft, !isPreview, let key = draftStorageKey else { return }
    if !hasUnsavedDraft && pendingSubmission == nil { draftStore?.remove(key); return }
    draftStore?.save(LocalEntryDraft(picks: draftPicks, prediction: mondayPrediction,
      savedPicks: savedPicks, savedPrediction: savedPrediction, revision: draftRevision,
      pendingSubmission: pendingSubmission), key: key)
  }

  private func installReceipt(_ receipt: MobileEntryReceipt, week: MobilePlayerWeek) {
    guard let current = bootstrap else { return }
    let entry = MobileEntry(id: week.entry?.id ?? "", status: "submitted", draftPicks: receipt.officialPicks,
      draftRevision: receipt.draftRevision, officialPicks: receipt.officialPicks,
      mondayPrediction: receipt.mondayPrediction, officialMondayPrediction: receipt.mondayPrediction,
      currentVersionNumber: receipt.versionNumber, submittedAt: receipt.committedAt, updatedAt: receipt.committedAt)
    let updatedWeek = MobilePlayerWeek(id: week.id, season: week.season, seasonPhase: week.seasonPhase,
      weekNumber: week.weekNumber, label: week.label, entryDeadline: week.entryDeadline,
      deadlineLabel: week.deadlineLabel, isLocked: week.isLocked, games: week.games, entry: entry,
      livePlayerPicks: week.livePlayerPicks)
    bootstrap = MobileBootstrap(serverNow: current.serverNow, user: current.user, currentWeek: updatedWeek, results: current.results)
  }

  func refreshHome(token: String, weekId: String? = nil) async {
    guard let accountId = bootstrap?.user.id, !isPreview, !isSavingEntry else { return }
    let key = weekId ?? "current"
    if isRefreshingHome && homeRequestKey == key { return }
    let requestID = UUID()
    let generation = accountGeneration
    homeRequestID = requestID
    homeRequestKey = key
    isRefreshingHome = true
    defer { if homeRequestID == requestID { isRefreshingHome = false } }
    do {
      let response = try await apiClient.fetchHome(token: token, weekId: weekId)
      guard !Task.isCancelled, homeRequestID == requestID, generation == accountGeneration,
        bootstrap?.user.id == accountId, response.user.id == accountId else { return }
      if response.user.account.accountState != "active" && !response.user.isAdmin {
        acceptAccount(response)
        liveGamesWeek = nil
        homeRace = nil
        pendingHomeWeek = nil
        homeFeedError = "Account access has changed. Return to Home to review your account status."
        return
      }
      if let weekId, response.currentWeek?.id != weekId { throw APIError.invalidResponse }
      if weekId == nil, hasUnsavedDraft, response.currentWeek?.id != bootstrap?.currentWeek?.id {
        pendingHomeWeek = response
        homeFeedError = "The published week changed. Your unsaved picks are still on the Picks page. Review that card or choose to switch weeks."
        return
      }
      if weekId == nil || response.currentWeek?.id == bootstrap?.currentWeek?.id {
        acceptAccount(response, compact: true)
      }
      liveGamesWeek = response.currentWeek
      if weekId == nil { pendingHomeWeek = nil }
      homeRefreshedAt = Date()
      homeFeedError = nil
      homeFailureCount = 0
      if weekId == nil, let week = response.currentWeek, isLocked(week),
        homeRace?.week?.id != week.id || (homeRaceCheckedAt?.timeIntervalSinceNow ?? -121) < -120 {
        let race = try? await apiClient.fetchLiveRace(token: token, weekId: week.id)
        guard !Task.isCancelled, homeRequestID == requestID, generation == accountGeneration,
          bootstrap?.currentWeek?.id == week.id else { return }
        homeRace = race?.week?.id == week.id ? race : nil
        homeRaceCheckedAt = Date()
      }
    } catch {
      guard !Task.isCancelled, homeRequestID == requestID, generation == accountGeneration else { return }
      homeFeedError = "Couldn't refresh scores. Showing the last available game data. Pull down or tap Retry to try again."
      homeFailureCount = min(homeFailureCount + 1, 4)
    }
  }

  var homeRefreshDelay: Double {
    homeFailureCount == 0 ? 30 : min(240, 30 * pow(2, Double(homeFailureCount)))
  }

  // Called only after the player confirms that unsaved changes may be discarded.
  func switchToPendingHomeWeek() {
    guard let response = pendingHomeWeek, response.user.id == bootstrap?.user.id else { return }
    let currentServerTime = estimatedServerNow
    invalidateHomeRefresh()
    acceptAccount(response, compact: true)
    serverDate = currentServerTime
    clockAnchor = .now
    liveGamesWeek = response.currentWeek
    homeRace = nil
    homeRaceCheckedAt = nil
    pendingHomeWeek = nil
    homeFeedError = nil
    homeRefreshedAt = nil
    homeFailureCount = 0
  }

  #if DEBUG
  func loadPicksPreview(_ mode: String) {
    loadHomePreview(mode)
    guard let current = bootstrap, let week = current.currentWeek else { return }
    let players = ["Fourth Down", "Sunday Driver", "Pick Six"].enumerated().map { index, name in
      MobileLivePlayerPicks(userId: "sample-\(index)", displayName: name,
        picks: Dictionary(uniqueKeysWithValues: week.games.enumerated().map { offset, game in
          (game.id, (offset + index).isMultiple(of: 2) ? game.away.abbreviation : game.home.abbreviation)
        }), updatedAt: current.serverNow)
    }
    bootstrap = MobileBootstrap(serverNow: current.serverNow, user: current.user,
      currentWeek: week.withPlayers(players), results: current.results)
    livePicksFeedState = .live(.now)
  }
  func previewSaveEntry() {
    guard isPreview else { return }
    savedPicks = draftPicks; savedPrediction = mondayPrediction
    entryActionMessage = "Preview: saved to live board. Not submitted."
  }
  func previewSubmitEntry(_ review: EntryReviewSnapshot) -> Bool {
    guard isPreview, reviewIsCurrent(review) else { return false }
    let receipt = MobileEntryReceipt(versionNumber: (review.week.entry?.currentVersionNumber ?? 0) + 1,
      committedAt: Date().ISO8601Format(), action: "submit", officialPicks: review.picks,
      mondayPrediction: review.prediction!, draftRevision: draftRevision + 1)
    entryReceipt = receipt
    savedPicks = review.picks; savedPrediction = review.prediction
    installReceipt(receipt, week: review.week)
    entryActionMessage = "Preview receipt only. No production data was sent."
    return true
  }
  func loadHomePreview(_ mode: String) {
    isPreview = true
    acceptAccount(HomePreviewFixture.bootstrap(mode))
    homeRefreshedAt = Date()
    if let week = bootstrap?.currentWeek, isLocked(week), (week.entry?.currentVersionNumber ?? 0) > 0 {
      homeRace = MobileLiveRace(status: "ready",
        week: MobileResultsWeek(id: week.id, season: week.season, seasonPhase: week.seasonPhase, weekNumber: week.weekNumber, label: week.label, entryDeadline: week.entryDeadline),
        serverNow: Date().ISO8601Format(), finalCount: 10, liveCount: 1, waitingCount: 5, gamesToFeature: [],
        players: [MobileLiveRacePlayer(userId: "preview-player", displayName: "Napalm", profilePhotoUrl: nil, isCurrentUser: true, rank: 1, baselineRank: 2, rankChange: 1, correct: 7, incorrect: 3, live: 1, pending: 5, projectedCorrect: 8, maxCorrect: 13, mondayPrediction: 45, tiebreakerDiff: nil, livePickCodes: ["IND"], unresolvedPickCodes: ["IND"], pathLabel: "Projected first", pathCopy: "Example race position")])
    }
    if mode == "stale" { homeFeedError = "Couldn't refresh scores. Showing the last available game data. Pull down to try again." }
  }

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

// Review is a value snapshot, not bindings that can change beneath a confirmation.
struct EntryReviewSnapshot: Identifiable {
  let id = UUID()
  let userId: String
  let week: MobilePlayerWeek
  let picks: [String: String]
  let prediction: Int?
  let revision: Int

  static func slateKey(_ week: MobilePlayerWeek) -> String {
    week.entryDeadline + week.games.map {
      "\($0.id):\($0.away.abbreviation):\($0.home.abbreviation):\($0.isMondayTiebreaker)"
    }.joined(separator: "|")
  }
}

struct PendingEntrySubmission: Codable {
  let key: String
  let weekId: String
  let picks: [String: String]
  let prediction: Int?
  let revision: Int

  func matches(_ review: EntryReviewSnapshot) -> Bool {
    // A lost response may be followed by a bootstrap with an advanced revision.
    // Retrying the same account/week/payload must still retrieve the first receipt.
    // Explicit conflict resolution clears the pending attempt before a new write.
    weekId == review.week.id && picks == review.picks && prediction == review.prediction
  }
}

struct LocalEntryDraft: Codable {
  let picks: [String: String]
  let prediction: Int?
  let savedPicks: [String: String]
  let savedPrediction: Int?
  let revision: Int
  let pendingSubmission: PendingEntrySubmission?
}

@MainActor
final class EntryDraftStore {
  static let persistent = EntryDraftStore(defaults: .standard)
  private let defaults: UserDefaults
  init(defaults: UserDefaults) { self.defaults = defaults }
  func load(_ key: String) -> LocalEntryDraft? {
    guard let data = defaults.data(forKey: key) else { return nil }
    return try? JSONDecoder().decode(LocalEntryDraft.self, from: data)
  }
  func save(_ draft: LocalEntryDraft, key: String) {
    guard let data = try? JSONEncoder().encode(draft) else { return }
    defaults.set(data, forKey: key)
  }
  func remove(_ key: String) { defaults.removeObject(forKey: key) }
}
