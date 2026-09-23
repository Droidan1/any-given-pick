import XCTest
@testable import AnyGivenPick

final class MobileModelsTests: XCTestCase {
  @MainActor func testDraftRecoveryIsScopedAndLogoutRemovesCurrentDraft() throws {
    let name = "picks-test-\(UUID())"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
    defer { defaults.removePersistentDomain(forName: name) }
    let store = EntryDraftStore(defaults: defaults)
    let original = HomePreviewFixture.bootstrap("draft")
    let model = AppModel(draftStore: store)
    model.acceptAccount(original)
    model.select(teamCode: "HOU", for: "game-0")
    model.mondayPrediction = 51
    let relaunched = AppModel(draftStore: store)
    relaunched.acceptAccount(original)
    XCTAssertEqual(relaunched.draftPicks["game-0"], "HOU")
    XCTAssertEqual(relaunched.mondayPrediction, 51)
    XCTAssertTrue(relaunched.hasUnsavedDraft)
    let other = MobileBootstrap(serverNow: original.serverNow,
      user: MobileUser(id: "other", displayName: "Other", isAdmin: false, account: original.user.account),
      currentWeek: original.currentWeek, results: nil)
    let otherModel = AppModel(draftStore: store)
    otherModel.acceptAccount(other)
    XCTAssertEqual(otherModel.draftPicks["game-0"], "IND")
    XCTAssertNil(otherModel.mondayPrediction)
    relaunched.clearAuthenticatedAccount()
    let signedInAgain = AppModel(draftStore: store)
    signedInAgain.acceptAccount(original)
    XCTAssertEqual(signedInAgain.draftPicks["game-0"], "IND")
  }

  @MainActor func testConflictPreservesLocalUntilExplicitDecision() throws {
    let model = AppModel(draftStore: nil)
    model.acceptAccount(HomePreviewFixture.bootstrap("draft"))
    model.select(teamCode: "HOU", for: "game-0")
    let server = MobileServerDraft(picks: ["game-0": "IND"], mondayPrediction: 44, draftRevision: 7, updatedAt: "now")
    model.applyEntryResult(MobileEntryActionResult(ok: false, code: "draft_conflict", message: "Conflict",
      syncedAt: nil, draftRevision: nil, serverDraft: server, receipt: nil))
    XCTAssertEqual(model.draftPicks["game-0"], "HOU")
    XCTAssertEqual(model.draftRevision, 3)
    XCTAssertNotNil(model.draftConflict)
    XCTAssertNil(model.makeEntryReview())
    model.resolveDraftConflict(keepMine: true)
    XCTAssertEqual(model.draftPicks["game-0"], "HOU")
    XCTAssertEqual(model.draftRevision, 7)
    XCTAssertTrue(model.hasUnsavedDraft)
    model.applyEntryResult(MobileEntryActionResult(ok: false, code: "draft_conflict", message: "Conflict",
      syncedAt: nil, draftRevision: nil, serverDraft: server, receipt: nil))
    model.resolveDraftConflict(keepMine: false)
    XCTAssertEqual(model.draftPicks, server.picks)
    XCTAssertEqual(model.mondayPrediction, 44)
    XCTAssertFalse(model.hasUnsavedDraft)
  }

  @MainActor func testReviewRequiresCompleteUnchangedEligibleUnlockedCard() throws {
    let model = AppModel(draftStore: nil)
    model.acceptAccount(HomePreviewFixture.bootstrap("draft"))
    XCTAssertNil(model.makeEntryReview())
    model.acceptAccount(HomePreviewFixture.bootstrap("submitted"))
    let review = try XCTUnwrap(model.makeEntryReview())
    XCTAssertTrue(model.reviewIsCurrent(review))
    model.select(teamCode: "HOU", for: "game-0")
    XCTAssertFalse(model.reviewIsCurrent(review))
    model.mondayPrediction = 201
    XCTAssertNil(model.makeEntryReview())
    model.acceptAccount(HomePreviewFixture.bootstrap("locked"))
    XCTAssertNil(model.makeEntryReview())
    let before = model.draftPicks
    model.select(teamCode: "IND", for: "game-0")
    XCTAssertEqual(model.draftPicks, before)
    let blocked = AppModel(draftStore: nil)
    blocked.acceptAccount(HomePreviewFixture.bootstrap("blocked"))
    XCTAssertNil(blocked.makeEntryReview())
  }

  @MainActor func testSubmissionKeySurvivesRelaunchButChangesWithReviewedPayload() throws {
    let name = "picks-test-\(UUID())"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
    defer { defaults.removePersistentDomain(forName: name) }
    let store = EntryDraftStore(defaults: defaults)
    let response = HomePreviewFixture.bootstrap("submitted")
    let first = AppModel(draftStore: store)
    first.acceptAccount(response)
    let review = try XCTUnwrap(first.makeEntryReview())
    let key = first.submissionAttempt(for: review).key
    XCTAssertEqual(key, first.submissionAttempt(for: review).key)
    let second = AppModel(draftStore: store)
    second.acceptAccount(response)
    XCTAssertEqual(key, second.submissionAttempt(for: try XCTUnwrap(second.makeEntryReview())).key)
    second.mondayPrediction = 52
    XCTAssertNotEqual(key, second.submissionAttempt(for: try XCTUnwrap(second.makeEntryReview())).key)
  }

  @MainActor func testLostResponseKeepsSubmissionKeyAfterServerRevisionAdvances() throws {
    let name = "picks-test-\(UUID())"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
    defer { defaults.removePersistentDomain(forName: name) }
    let store = EntryDraftStore(defaults: defaults)
    let response = HomePreviewFixture.bootstrap("submitted")
    let first = AppModel(draftStore: store)
    first.acceptAccount(response)
    first.select(teamCode: "HOU", for: "game-0")
    first.mondayPrediction = 51
    let review = try XCTUnwrap(first.makeEntryReview())
    let pendingKey = first.submissionAttempt(for: review).key
    let week = try XCTUnwrap(response.currentWeek)
    let entry = try XCTUnwrap(week.entry)
    // The server committed these values, but this phone never received its response.
    let committed = MobileEntry(id: entry.id, status: "submitted", draftPicks: review.picks,
      draftRevision: review.revision + 1, officialPicks: review.picks,
      mondayPrediction: review.prediction, officialMondayPrediction: review.prediction,
      currentVersionNumber: entry.currentVersionNumber + 1,
      submittedAt: response.serverNow, updatedAt: response.serverNow)
    let advancedWeek = MobilePlayerWeek(id: week.id, season: week.season, seasonPhase: week.seasonPhase,
      weekNumber: week.weekNumber, label: week.label, entryDeadline: week.entryDeadline,
      deadlineLabel: week.deadlineLabel, isLocked: false, games: week.games,
      entry: committed, livePlayerPicks: week.livePlayerPicks)
    let relaunched = AppModel(draftStore: store)
    relaunched.acceptAccount(MobileBootstrap(serverNow: response.serverNow, user: response.user,
      currentWeek: advancedWeek, results: response.results))
    let retry = try XCTUnwrap(relaunched.makeEntryReview())
    XCTAssertEqual(retry.revision, review.revision + 1)
    XCTAssertEqual(relaunched.submissionAttempt(for: retry).key, pendingKey)
    XCTAssertEqual(relaunched.draftStatus, "Official card received")
    relaunched.mondayPrediction = 52
    XCTAssertNotEqual(relaunched.submissionAttempt(for: try XCTUnwrap(relaunched.makeEntryReview())).key, pendingKey)
  }

  @MainActor func testOfficialReceiptSurvivesFollowupRefreshFailure() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [EntryReceiptURLProtocol.self]
    let session = URLSession(configuration: configuration)
    defer { session.invalidateAndCancel() }
    let model = AppModel(apiClient: APIClient(baseURL: URL(string: "https://entry-test.invalid")!, session: session), draftStore: nil)
    model.acceptAccount(HomePreviewFixture.bootstrap("submitted"))
    let review = try XCTUnwrap(model.makeEntryReview())
    let success = await model.submitEntry(token: "test-token", review: review)
    XCTAssertTrue(success)
    XCTAssertEqual(model.bootstrap?.currentWeek?.entry?.currentVersionNumber, 4)
    XCTAssertEqual(model.entryReceipt?.versionNumber, 4)
    XCTAssertTrue(model.entryActionMessage?.contains("receipt is safe") == true)
    XCTAssertFalse(model.isSavingEntry)
  }

  func testHomeCountdownLocksAtDeadlineWithoutNegativeTime() throws {
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let week = try XCTUnwrap(HomePreviewFixture.bootstrap("draft", now: now).currentWeek)
    let deadline = try XCTUnwrap(HomeWeekState.date(week.entryDeadline))
    let open = HomeWeekState(week: week, picks: [:], prediction: nil, now: deadline.addingTimeInterval(-20))
    XCTAssertFalse(open.locked)
    XCTAssertEqual(open.countdown, "Locks in under a minute")
    let locked = HomeWeekState(week: week, picks: [:], prediction: nil, now: deadline)
    XCTAssertTrue(locked.locked)
    XCTAssertEqual(locked.countdown, "Card locked")
  }
  func testHomeCountsOnlyValidCurrentWeekPicks() throws {
    let week = try XCTUnwrap(HomePreviewFixture.bootstrap().currentWeek)
    var picks = week.entry!.draftPicks
    picks["old-game"] = "IND"
    picks[week.games[0].id] = "NOT-A-TEAM"
    let state = HomeWeekState(week: week, picks: picks, prediction: nil, now: Date())
    XCTAssertEqual(state.selectedCount, 13)
    XCTAssertEqual(state.missingCount, 3)
    XCTAssertTrue(state.needsPrediction)
  }
  func testHomeGradesOnlyOfficialPicksNotUnsavedSelections() throws {
    let week = try XCTUnwrap(HomePreviewFixture.bootstrap("locked").currentWeek)
    let wrongDraft = Dictionary(uniqueKeysWithValues: week.games.map { ($0.id, $0.home.abbreviation) })
    let state = HomeWeekState(week: week, picks: wrongDraft, prediction: nil, now: Date())
    XCTAssertTrue(state.hasOfficial)
    XCTAssertEqual(state.correct, 7)
    XCTAssertEqual(state.incorrect, 3)
    XCTAssertEqual(state.remaining, 6)
    let noEntry = try XCTUnwrap(HomePreviewFixture.bootstrap("no-official").currentWeek)
    XCTAssertFalse(HomeWeekState(week: noEntry, picks: wrongDraft, prediction: nil, now: Date()).hasOfficial)
  }
  func testLiveScoresAreNotFinalOutcomes() throws {
    let week = try XCTUnwrap(HomePreviewFixture.bootstrap("locked").currentWeek)
    let live = week.games[0]
    XCTAssertEqual(live.outcome(for: "IND"), "Leading")
    XCTAssertEqual(live.outcome(for: "HOU"), "Trailing")
    XCTAssertEqual(live.outcome(for: nil), "No official pick")
    XCTAssertEqual(live.statusLabel, "Q3 · 4:12")
    XCTAssertEqual(week.games[15].outcome(for: "DEN"), "Pending")
  }
  @MainActor func testHomeRefreshPreservesDirtyDraftAndRevision() throws {
    let model = AppModel(draftStore: nil)
    model.acceptAccount(HomePreviewFixture.bootstrap("draft"))
    model.select(teamCode: "HOU", for: "game-0")
    model.mondayPrediction = 51
    XCTAssertTrue(model.hasUnsavedDraft)
    model.acceptAccount(HomePreviewFixture.bootstrap("submitted"), compact: true)
    XCTAssertEqual(model.draftPicks["game-0"], "HOU")
    XCTAssertEqual(model.mondayPrediction, 51)
    XCTAssertEqual(model.draftRevision, 3)
    XCTAssertTrue(model.hasUnsavedDraft)
    XCTAssertEqual(model.bootstrap?.currentWeek?.entry?.currentVersionNumber, 2)
  }
  @MainActor func testCleanDraftCanRefreshAndLogoutClearsState() {
    let model = AppModel(draftStore: nil)
    model.acceptAccount(HomePreviewFixture.bootstrap("draft"))
    XCTAssertFalse(model.hasUnsavedDraft)
    model.acceptAccount(HomePreviewFixture.bootstrap("submitted"), compact: true)
    XCTAssertEqual(model.draftPicks.count, 16)
    XCTAssertEqual(model.mondayPrediction, 45)
    XCTAssertFalse(model.hasUnsavedDraft)
    model.clearAuthenticatedAccount()
    XCTAssertNil(model.bootstrap)
    XCTAssertNil(model.liveGamesWeek)
    XCTAssertTrue(model.draftPicks.isEmpty)
  }
  @MainActor func testHomeNetworkFailureKeepsDataAndBacksOff() async {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [HomeUnavailableURLProtocol.self]
    let session = URLSession(configuration: configuration)
    defer { session.invalidateAndCancel() }
    let model = AppModel(apiClient: APIClient(baseURL: URL(string: "https://home-test.invalid")!, session: session), draftStore: nil)
    model.acceptAccount(HomePreviewFixture.bootstrap("draft"))
    model.select(teamCode: "HOU", for: "game-0")
    XCTAssertEqual(model.homeRefreshDelay, 30)
    await model.refreshHome(token: "test-token")
    XCTAssertEqual(model.bootstrap?.currentWeek?.games.count, 16)
    XCTAssertEqual(model.draftPicks["game-0"], "HOU")
    XCTAssertNotNil(model.homeFeedError)
    XCTAssertFalse(model.isRefreshingHome)
    XCTAssertEqual(model.homeRefreshDelay, 60)
    await model.refreshHome(token: "test-token")
    XCTAssertEqual(model.homeRefreshDelay, 120)
    model.clearAuthenticatedAccount()
    XCTAssertNil(model.homeFeedError)
    XCTAssertEqual(model.homeRefreshDelay, 30)
  }
  @MainActor func testDifferentAccountCannotInheritUnsavedDraft() {
    let model = AppModel(draftStore: nil)
    let original = HomePreviewFixture.bootstrap("draft")
    model.acceptAccount(original)
    model.select(teamCode: "HOU", for: "game-0")
    let next = MobileBootstrap(serverNow: original.serverNow,
      user: MobileUser(id: "different-player", displayName: "Different player", isAdmin: false, account: original.user.account),
      currentWeek: nil, results: nil)
    model.acceptAccount(next, compact: true)
    XCTAssertTrue(model.draftPicks.isEmpty)
    XCTAssertNil(model.mondayPrediction)
    XCTAssertFalse(model.hasUnsavedDraft)
  }
  @MainActor func testPublishedWeekChangeWaitsForExplicitConfirmation() async {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [HomeNewWeekURLProtocol.self]
    let session = URLSession(configuration: configuration)
    defer { session.invalidateAndCancel() }
    let model = AppModel(apiClient: APIClient(baseURL: URL(string: "https://home-test.invalid")!, session: session), draftStore: nil)
    model.acceptAccount(HomePreviewFixture.bootstrap("draft"))
    model.select(teamCode: "HOU", for: "game-0")
    await model.refreshHome(token: "test-token")
    XCTAssertEqual(model.bootstrap?.currentWeek?.id, "preview-week")
    XCTAssertEqual(model.draftPicks["game-0"], "HOU")
    XCTAssertEqual(model.pendingHomeWeek?.currentWeek?.id, "next-week")
    let serverTimeBeforeSwitch = model.estimatedServerNow
    model.switchToPendingHomeWeek()
    XCTAssertEqual(model.bootstrap?.currentWeek?.id, "next-week")
    XCTAssertTrue(model.draftPicks.isEmpty)
    XCTAssertNil(model.pendingHomeWeek)
    XCTAssertNil(model.homeFeedError)
    XCTAssertLessThan(abs(model.estimatedServerNow.timeIntervalSince(serverTimeBeforeSwitch)), 1)
  }
  func testDecodesNativeNotificationPreferences() throws {
    let data = Data("""
      {"registered":true,"deliveryConfigured":false,"preferences":{"enabled":true,"weekPublished":true,"deadlineApproaching":false,"picksSubmitted":true,"resultsAvailable":true}}
      """.utf8)
    let settings = try JSONDecoder().decode(NativeNotificationSettings.self, from: data)
    XCTAssertTrue(settings.registered)
    XCTAssertFalse(settings.deliveryConfigured)
    XCTAssertFalse(settings.preferences.deadlineApproaching)
  }

  func testNotificationRoutesToMatchingWeek() {
    let week = "2d1972af-b99e-4f8c-b6c3-5340a02c641f"
    let user = "3d1972af-b99e-4f8c-b6c3-5340a02c641f"
    for kind in ["week_published", "deadline_approaching", "picks_submitted"] {
      let route = NativeNotificationDestination(userInfo: ["kind": kind, "weekId": week, "userId": user])
      XCTAssertEqual(route?.tab(currentWeekId: week), .picks)
      XCTAssertEqual(route?.tab(currentWeekId: "old-week"), .results)
    }
    let route = NativeNotificationDestination(userInfo: ["kind": "results_available", "weekId": week, "userId": user])
    XCTAssertEqual(route?.tab(currentWeekId: week), .results)
    XCTAssertEqual(route?.userId, user)
  }

  func testRejectsUnknownOrMalformedNotificationRoutes() {
    XCTAssertNil(NativeNotificationDestination(userInfo: ["url": "https://unknown.example"]))
    XCTAssertNil(NativeNotificationDestination(userInfo: ["kind": "results_available", "weekId": "not-an-id", "userId": "not-an-id"]))
    XCTAssertNil(NativeNotificationDestination(userInfo: ["kind": "admin", "weekId": UUID().uuidString, "userId": UUID().uuidString]))
  }

  func testDecodesAuthenticatedBootstrapPayload() throws {
    let data = Data(
      """
      {
        "serverNow": "2026-09-22T14:00:00.000Z",
        "user": {
          "id": "user-1",
          "displayName": "Napalm",
          "isAdmin": true,
          "account": {
            "signedIn": true,
            "displayName": "Napalm",
            "accountState": "active",
            "stateReason": null,
            "verifiedAuth": true,
            "ageEligible": true,
            "overallResult": "eligible",
            "reason": "eligible",
            "reasonLabel": "Eligible to participate",
            "profileComplete": true
          }
        },
        "currentWeek": {
          "id": "week-1",
          "season": 2026,
          "seasonPhase": "regular",
          "weekNumber": 3,
          "label": "Week 3",
          "entryDeadline": "2026-09-24T22:00:00.000Z",
          "deadlineLabel": "Thu, Sep 24, 6:00 PM EDT",
          "isLocked": false,
          "games": [{
            "id": "game-1",
            "kickoffAt": "2026-09-25T00:15:00.000Z",
            "status": "scheduled",
            "day": "Thu",
            "time": "8:15 PM",
            "away": {"abbreviation": "IND", "name": "Indianapolis Colts"},
            "home": {"abbreviation": "HOU", "name": "Houston Texans"},
            "awayScore": null,
            "homeScore": null,
            "isMondayTiebreaker": false,
            "odds": {
              "awayMoneyline": 120,
              "homeMoneyline": -140,
              "overUnder": null,
              "provider": "The Odds API",
              "updatedAt": "2026-09-22T13:50:00.000Z"
            }
          }],
          "entry": null,
          "livePlayerPicks": []
        },
        "results": {
          "weeks": [],
          "selectedWeek": null,
          "revealStatus": "no_week",
          "serverNow": "2026-09-22T14:00:00.000Z",
          "games": [],
          "entries": [],
          "distributions": []
        }
      }
      """.utf8
    )

    let bootstrap = try JSONDecoder().decode(MobileBootstrap.self, from: data)

    XCTAssertEqual(bootstrap.user.displayName, "Napalm")
    XCTAssertTrue(bootstrap.user.account.canParticipate)
    XCTAssertEqual(bootstrap.currentWeek?.games.first?.away.abbreviation, "IND")
    XCTAssertEqual(bootstrap.currentWeek?.games.first?.odds?.homeMoneyline, -140)
  }

  func testDecodesDraftConflictResult() throws {
    let data = Data(
      """
      {
        "result": {
          "ok": false,
          "code": "draft_conflict",
          "message": "A newer draft exists.",
          "serverDraft": {
            "picks": {"game-1": "IND"},
            "mondayPrediction": 47,
            "draftRevision": 3,
            "updatedAt": "2026-09-22T14:00:00.000Z"
          }
        }
      }
      """.utf8
    )

    let envelope = try JSONDecoder().decode(EntryActionEnvelope.self, from: data)

    XCTAssertEqual(envelope.result.code, "draft_conflict")
    XCTAssertEqual(envelope.result.serverDraft?.draftRevision, 3)
    XCTAssertEqual(envelope.result.serverDraft?.picks["game-1"], "IND")
  }

  func testDecodesLivePlayerPicksEnvelope() throws {
    let data = Data(
      """
      {
        "players": [{
          "userId": "user-2",
          "displayName": "Fourth Down",
          "picks": {"game-1": "HOU"},
          "updatedAt": "2026-09-22T14:00:00.000Z"
        }]
      }
      """.utf8
    )

    let envelope = try JSONDecoder().decode(MobileLivePicksEnvelope.self, from: data)

    XCTAssertEqual(envelope.players.count, 1)
    XCTAssertEqual(envelope.players.first?.displayName, "Fourth Down")
    XCTAssertEqual(envelope.players.first?.picks["game-1"], "HOU")
  }

  func testBuildsCanonicalESPNTeamLogoURLs() {
    XCTAssertEqual(NFLTeamLogo.canonicalCode("wsh"), "WAS")
    XCTAssertEqual(
      NFLTeamLogo.url(for: "WAS")?.absoluteString,
      "https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png"
    )
    XCTAssertNil(NFLTeamLogo.url(for: "UNKNOWN"))
  }

  func testDecodesStandingsEnvelope() throws {
    let data = Data(
      """
      {
        "standings": {
          "status": "ready",
          "season": 2026,
          "weekOneFinalGames": 16,
          "weekOneGameCount": 16,
          "throughWeek": 3,
          "rows": [{
            "rank": 1,
            "rankChange": 2,
            "userId": "user-1",
            "displayName": "Napalm",
            "profilePhotoUrl": null,
            "correctPicks": 31,
            "gradedPicks": 48,
            "tiebreakerDiff": 4
          }]
        }
      }
      """.utf8
    )

    let envelope = try JSONDecoder().decode(MobileStandingsEnvelope.self, from: data)

    XCTAssertEqual(envelope.standings.throughWeek, 3)
    XCTAssertEqual(envelope.standings.rows.first?.rank, 1)
    XCTAssertEqual(envelope.standings.rows.first?.correctPicks, 31)
  }

  func testDecodesLiveRaceEnvelope() throws {
    let data = Data(
      """
      {
        "race": {
          "status": "ready",
          "week": {
            "id": "week-3",
            "season": 2026,
            "seasonPhase": "regular",
            "weekNumber": 3,
            "label": "Week 3",
            "entryDeadline": "2026-09-24T22:00:00.000Z"
          },
          "serverNow": "2026-09-25T01:30:00.000Z",
          "finalCount": 5,
          "liveCount": 3,
          "waitingCount": 8,
          "gamesToFeature": [{
            "id": "game-1",
            "kickoffAt": "2026-09-25T00:15:00.000Z",
            "awayTeamCode": "IND",
            "awayTeamName": "Indianapolis Colts",
            "homeTeamCode": "HOU",
            "homeTeamName": "Houston Texans",
            "awayScore": 20,
            "homeScore": 17,
            "status": "in_progress",
            "isMondayTiebreaker": false,
            "displayStatus": "Live"
          }],
          "players": [{
            "userId": "user-1",
            "displayName": "Napalm",
            "profilePhotoUrl": null,
            "isCurrentUser": true,
            "rank": 1,
            "baselineRank": 2,
            "rankChange": 1,
            "correct": 5,
            "incorrect": 1,
            "live": 2,
            "pending": 8,
            "projectedCorrect": 7,
            "maxCorrect": 15,
            "mondayPrediction": 47,
            "tiebreakerDiff": null,
            "livePickCodes": ["IND", "PIT"],
            "unresolvedPickCodes": ["IND", "PIT", "DAL"],
            "pathLabel": "Projected first",
            "pathCopy": "Napalm holds the projected lead."
          }]
        }
      }
      """.utf8
    )

    let envelope = try JSONDecoder().decode(MobileLiveRaceEnvelope.self, from: data)

    XCTAssertEqual(envelope.race.liveCount, 3)
    XCTAssertEqual(envelope.race.gamesToFeature.first?.awayTeamCode, "IND")
    XCTAssertEqual(envelope.race.players.first?.projectedCorrect, 7)
    XCTAssertTrue(envelope.race.players.first?.isCurrentUser == true)
  }

  func testDecodesAchievementsEnvelope() throws {
    let data = Data(
      """
      {
        "achievements": {
          "earnedCount": 1,
          "totalCount": 6,
          "achievements": [{
            "id": "first_call",
            "symbol": "1",
            "title": "First call",
            "description": "Submit your first official weekly card.",
            "earned": true,
            "earnedOn": "2026 Week 1",
            "progress": 1,
            "target": 1,
            "progressLabel": "1 of 1 official card"
          }]
        }
      }
      """.utf8
    )

    let envelope = try JSONDecoder().decode(MobileAchievementsEnvelope.self, from: data)

    XCTAssertEqual(envelope.achievements.earnedCount, 1)
    XCTAssertEqual(envelope.achievements.achievements.first?.title, "First call")
    XCTAssertTrue(envelope.achievements.achievements.first?.earned == true)
  }
}

private final class EntryReceiptURLProtocol: URLProtocol, @unchecked Sendable {
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    let isSubmission = request.httpMethod == "POST"
    let picks = HomePreviewFixture.bootstrap("submitted").currentWeek!.entry!.officialPicks
    let object: [String: Any] = ["result": ["ok": true, "code": "submitted", "message": "Received",
      "receipt": ["versionNumber": 4, "committedAt": Date().ISO8601Format(), "action": "edit",
        "officialPicks": picks, "mondayPrediction": 45, "draftRevision": 4]]]
    let data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data()
    client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: isSubmission ? 200 : 503, httpVersion: nil,
      headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: isSubmission ? data : Data("{}".utf8))
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}

private final class HomeUnavailableURLProtocol: URLProtocol, @unchecked Sendable {
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 503, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Data("{}".utf8))
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}

private final class HomeNewWeekURLProtocol: URLProtocol, @unchecked Sendable {
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    let data = Data("""
      {"serverNow":"2026-01-01T00:00:00Z","user":{"id":"preview-player","displayName":"Napalm","isAdmin":false,
        "account":{"displayName":"Napalm","accountState":"active","verifiedAuth":true,"ageEligible":true,"overallResult":"eligible","reason":"eligible","reasonLabel":"Eligible","profileComplete":true}},
        "currentWeek":{"id":"next-week","season":2026,"seasonPhase":"regular","weekNumber":4,"label":"Week 4","entryDeadline":"2026-10-01T22:00:00Z","deadlineLabel":"Thursday","isLocked":false,"games":[],"entry":null,"livePlayerPicks":[]},"results":null}
      """.utf8)
    client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: data)
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}
