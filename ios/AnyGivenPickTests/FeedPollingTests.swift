import XCTest
@testable import AnyGivenPick

@MainActor final class FeedPollingTests: XCTestCase {
  func testBothBackoffSchedulesCapAtFiveMinutesAndResetOnSuccess() async {
    for base in [15.0, 30.0] {
      var now = Date(timeIntervalSince1970: 1_000)
      let polling = FeedPolling(baseInterval: base, now: { now })
      for attempt in 0..<9 {
        await polling.refresh { .retry(after: nil) }
        let delay = min(300, base * pow(2, Double(attempt)))
        XCTAssertEqual(polling.retryAt, now.addingTimeInterval(delay))
        XCTAssertEqual(polling.failures, attempt + 1)
        now = polling.retryAt!
      }
      await polling.refresh { .success }
      XCTAssertEqual(polling.failures, 0)
      XCTAssertNil(polling.retryAt)
      XCTAssertEqual(polling.lastSuccessAt, now)
    }
  }

  func testRetryAfterSurvivesResumeAndManualRefresh() async {
    var now = Date(timeIntervalSince1970: 1_000)
    let polling = FeedPolling(baseInterval: 15, now: { now })
    polling.prepare(context: "same-account-week")
    await polling.refresh { .retry(after: 600) }
    polling.prepare(context: "same-account-week")
    var requests = 0
    let outcome = await polling.refresh(manual: true) { requests += 1; return .success }
    XCTAssertEqual(outcome, .skipped)
    XCTAssertEqual(requests, 0)
    XCTAssertEqual(polling.retryAt, now.addingTimeInterval(600))
    now = now.addingTimeInterval(600)
    await polling.refresh { requests += 1; return .success }
    XCTAssertEqual(requests, 1)
    polling.prepare(context: "different-account-week")
    XCTAssertNil(polling.lastSuccessAt)
  }

  func testNoOverlappingAutomaticAndManualRefresh() async {
    let polling = FeedPolling(baseInterval: 15)
    var calls = 0
    await polling.refresh {
      calls += 1
      let duplicate = await polling.refresh(manual: true) { calls += 1; return .success }
      XCTAssertEqual(duplicate, .skipped)
      return .success
    }
    XCTAssertEqual(calls, 1)
    XCTAssertFalse(polling.isRefreshing)
  }

  func testInactiveLoopMakesNoRequestsAndResumeFetchesOnce() async {
    let polling = FeedPolling(baseInterval: 15)
    var calls = 0
    await polling.run(context: "week", shouldContinue: { false }, interval: { 15 }) { calls += 1; return .success }
    XCTAssertEqual(calls, 0)
    XCTAssertEqual(polling.status(), .paused)
    await polling.run(context: "week", shouldContinue: { true }, interval: { nil }) { calls += 1; return .success }
    XCTAssertEqual(calls, 1)
    XCTAssertFalse(polling.isPaused)
  }

  func testBackgroundDuringSleepPreventsNextRequest() async {
    var now = Date(timeIntervalSince1970: 1_000)
    var active = true
    var requests = 0
    let polling = FeedPolling(baseInterval: 30, now: { now })
    await polling.run(context: "race", shouldContinue: { active }, interval: { 30 }, sleep: { seconds in
      now = now.addingTimeInterval(seconds)
      active = false
    }) { requests += 1; return .success }
    XCTAssertEqual(requests, 1)
    XCTAssertTrue(polling.isPaused)
  }

  func testIdleRaceTransitionsToLiveAndThenFinishes() async {
    var now = Date(timeIntervalSince1970: 1_000)
    var calls = 0
    var sleeps: [TimeInterval] = []
    var interval: TimeInterval? = 300
    let polling = FeedPolling(baseInterval: 30, now: { now })
    await polling.run(context: "race", shouldContinue: { true }, interval: { interval }, sleep: { seconds in
      sleeps.append(seconds)
      now = now.addingTimeInterval(seconds)
    }) {
      calls += 1
      if calls == 2 { interval = 30 }
      if calls == 3 { interval = nil }
      return .success
    }
    XCTAssertEqual(calls, 3)
    XCTAssertEqual(sleeps, [300, 30])
  }

  func testFailureLoopRetriesAndRecoveryRestoresCadence() async {
    var now = Date(timeIntervalSince1970: 1_000)
    var calls = 0
    var sleeps: [TimeInterval] = []
    let polling = FeedPolling(baseInterval: 15, now: { now })
    await polling.run(context: "picks", shouldContinue: { calls < 4 }, interval: { 15 }, sleep: { seconds in
      sleeps.append(seconds)
      now = now.addingTimeInterval(seconds)
    }) {
      calls += 1
      return calls < 3 ? .retry(after: nil) : .success
    }
    XCTAssertEqual(sleeps, [15, 30, 15])
    XCTAssertEqual(polling.failures, 0)
  }

  func testSkippedRefreshDoesNotPermanentlyStopLoop() async {
    var now = Date(timeIntervalSince1970: 1_000)
    var calls = 0
    let polling = FeedPolling(baseInterval: 15, now: { now })
    await polling.run(context: "picks", shouldContinue: { calls < 2 }, interval: { 15 }, sleep: { seconds in
      now = now.addingTimeInterval(seconds)
    }) { calls += 1; return calls == 1 ? .skipped : .success }
    XCTAssertEqual(calls, 2)
  }

  func testCancelledRequestDoesNotBackOffOrUpdateFreshness() async {
    let polling = FeedPolling(baseInterval: 15)
    await polling.refresh { .cancelled }
    XCTAssertEqual(polling.failures, 0)
    XCTAssertNil(polling.lastSuccessAt)
    XCTAssertEqual(FeedRefreshOutcome.failure(URLError(.cancelled)), .cancelled)
  }

  func testSupersededRefreshAfterFailureDoesNotSpinOrStopPolling() async {
    var now = Date(timeIntervalSince1970: 1_000)
    var calls = 0
    var sleeps: [TimeInterval] = []
    let polling = FeedPolling(baseInterval: 15, now: { now })
    await polling.run(context: "picks", shouldContinue: { calls < 4 }, interval: { 15 }, sleep: { seconds in
      sleeps.append(seconds)
      now = now.addingTimeInterval(seconds)
    }) {
      calls += 1
      switch calls {
      case 1: return .retry(after: nil)
      case 2: return .cancelled
      case 3: return .skipped
      default: return .success
      }
    }
    XCTAssertEqual(sleeps, [15, 15, 15])
    XCTAssertEqual(polling.failures, 0)
  }

  func testManualSuccessWhileSleepingDoesNotCauseImmediateDuplicate() async {
    var now = Date(timeIntervalSince1970: 1_000)
    var calls = 0
    var sleeps: [TimeInterval] = []
    let polling = FeedPolling(baseInterval: 15, now: { now })
    await polling.run(context: "picks", shouldContinue: { calls < 3 }, interval: { 15 }, sleep: { seconds in
      sleeps.append(seconds)
      now = now.addingTimeInterval(seconds)
      if sleeps.count == 1 {
        await polling.refresh(manual: true) { calls += 1; return .success }
      }
    }) { calls += 1; return .success }
    XCTAssertEqual(sleeps, [15, 15])
    XCTAssertEqual(calls, 3)
  }

  func testContextChangeDiscardsOldRequestOutcome() async {
    let polling = FeedPolling(baseInterval: 15)
    polling.prepare(context: "old")
    let result = await polling.refresh {
      polling.prepare(context: "new")
      return .retry(after: nil)
    }
    XCTAssertEqual(result, .cancelled)
    XCTAssertEqual(polling.failures, 0)
  }

  func testAccessErrorsStopAutomaticRequestsButAllowExplicitRecovery() async {
    let polling = FeedPolling(baseInterval: 15)
    await polling.refresh { .failure(APIError.server(message: "Sign in again", statusCode: 401)) }
    var calls = 0
    await polling.refresh { calls += 1; return .success }
    XCTAssertEqual(calls, 0)
    XCTAssertEqual(polling.blockedReason, "Sign in again")
    await polling.refresh(manual: true) { calls += 1; return .success }
    XCTAssertEqual(calls, 1)
    XCTAssertNil(polling.blockedReason)
    XCTAssertEqual(FeedRefreshOutcome.failure(APIError.server(message: "Rate limited", statusCode: 429, retryAfter: 90)), .retry(after: 90))
    XCTAssertEqual(FeedRefreshOutcome.failure(APIError.server(message: "Unavailable", statusCode: 503)), .retry(after: nil))
  }

  func testRetryAfterSupportsSecondsAndHTTPDates() {
    let now = Date(timeIntervalSince1970: 0)
    XCTAssertEqual(APIClient.retryAfter("120", now: now), 120)
    XCTAssertEqual(APIClient.retryAfter("Thu, 01 Jan 1970 00:02:00 GMT", now: now), 120)
    XCTAssertNil(APIClient.retryAfter("invalid", now: now))
    XCTAssertNil(APIClient.retryAfter(nil, now: now))
  }

  func testRaceCadenceUsesAggregateCountsEvenWithoutFeaturedGames() {
    func race(_ live: Int, _ waiting: Int, _ final: Int = 0, status: String = "ready") -> MobileLiveRace {
      MobileLiveRace(status: status, week: nil, serverNow: "", finalCount: final, liveCount: live,
        waitingCount: waiting, gamesToFeature: [], players: [])
    }
    XCTAssertEqual(race(1, 0).pollingInterval, 30)
    XCTAssertEqual(race(0, 16).pollingInterval, 300)
    XCTAssertEqual(race(0, 0, status: "sealed").pollingInterval, 300)
    XCTAssertNil(race(0, 0, 16).pollingInterval)
  }

  func testAPIErrorsReachPollingAndPreserveDraft() async {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [PollingUnavailableProtocol.self]
    let session = URLSession(configuration: config)
    defer { session.invalidateAndCancel() }
    let model = AppModel(apiClient: APIClient(baseURL: URL(string: "https://polling-test.invalid")!, session: session), draftStore: nil)
    model.acceptAccount(HomePreviewFixture.bootstrap("draft"))
    model.select(teamCode: "HOU", for: "game-0")
    model.mondayPrediction = 51
    let picks = await model.refreshLivePicks(token: "fixture", weekId: "preview-week")
    let race = await model.refreshLiveRace(token: "fixture")
    let home = await model.refreshHome(token: "fixture", weekId: "preview-week")
    XCTAssertEqual(picks, .retry(after: 90))
    XCTAssertEqual(race, .retry(after: 90))
    XCTAssertEqual(home, .retry(after: 90))
    XCTAssertEqual(model.draftPicks["game-0"], "HOU")
    XCTAssertEqual(model.mondayPrediction, 51)
    XCTAssertTrue(model.hasUnsavedDraft)
    XCTAssertEqual(model.bootstrap?.currentWeek?.games.count, 16)
  }
}

private final class PollingUnavailableProtocol: URLProtocol, @unchecked Sendable {
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    let response = HTTPURLResponse(url: request.url!, statusCode: 503, httpVersion: nil, headerFields: ["Retry-After": "90"])!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Data(#"{"error":"Temporarily unavailable"}"#.utf8))
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}
