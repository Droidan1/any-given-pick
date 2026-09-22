import XCTest
@testable import AnyGivenPick

final class MobileModelsTests: XCTestCase {
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
}
