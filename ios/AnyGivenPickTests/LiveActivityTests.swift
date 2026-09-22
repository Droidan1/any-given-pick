import XCTest
@testable import AnyGivenPick

final class LiveActivityTests: XCTestCase {
  func testServerUnixDatesAndNullFieldsDecode() throws {
    let json = """
      {"title":"Card deadline","detail":"12/16 picks saved","updatedAt":1790100000,"staleAt":1790100180,"deadline":1790101800,"picksSaved":12,"totalGames":16,"correct":0,"remaining":0,"rank":null,"playerCount":0,"behind":0,"awayCode":"","homeCode":"","awayScore":null,"homeScore":null,"gameStatus":"scheduled","clock":"","selectedTeam":""}
      """
    let state = try JSONDecoder().decode(PickActivityAttributes.ContentState.self, from: Data(json.utf8))
    XCTAssertEqual(state.deadlineDate.timeIntervalSince1970, 1790101800)
    XCTAssertEqual(state.staleDate.timeIntervalSince1970, 1790100180)
    XCTAssertNil(state.awayScore); XCTAssertNil(state.rank)
    XCTAssertEqual(state.picksSaved, 12)
  }
  func testEachActivityUsesAnAccountScopedDestination() {
    for kind in [PickActivityAttributes.Kind.deadline, .game, .race] {
      let attributes = PickActivityAttributes.example(kind)
      let destination = ActivityDestination(url: attributes.destinationURL!)
      XCTAssertEqual(destination?.userId, attributes.userId)
      XCTAssertEqual(destination?.weekId, attributes.weekId)
      XCTAssertEqual(destination?.kind, kind)
    }
    XCTAssertNil(ActivityDestination(url: URL(string: "https://example.com/activity")!))
    XCTAssertNil(ActivityDestination(url: URL(string: "anygivenpick://activity?kind=admin&week=123&user=123")!))
  }
  func testTokenRemovalEncodesNullAndCommandsDoNotInjectUnknownFields() throws {
    let registration = LiveActivityRegistration(installationId: UUID().uuidString, environment: "sandbox", pushToStartToken: nil, authorized: true, preferences: .init())
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(registration)) as? [String: Any])
    XCTAssertTrue(object["pushToStartToken"] is NSNull)
    let command = LiveActivityCommand(installationId: UUID().uuidString, gameId: UUID().uuidString)
    let commandObject = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(command)) as? [String: Any])
    XCTAssertEqual(Set(commandObject.keys), ["installationId", "gameId"])
  }
  @MainActor func testPreviewSettingsAreIndependentOfOrdinaryPush() async {
    let model = LiveActivityManager.preview()
    var preferences = model.preferences; preferences.deadline = false
    await model.save(preferences)
    XCTAssertFalse(model.preferences.deadline); XCTAssertTrue(model.preferences.race)
    await model.disconnect()
    XCTAssertFalse(model.preferences.enabled); XCTAssertFalse(model.registered)
  }
}
