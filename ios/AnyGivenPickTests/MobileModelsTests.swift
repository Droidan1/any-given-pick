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
