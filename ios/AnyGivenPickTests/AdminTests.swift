import XCTest
@testable import AnyGivenPick

@MainActor final class AdminTests: XCTestCase {
  func testAdminAndUnknownIdentityCannotBeManaged() {
    XCTAssertFalse(AdminPreview.commissioner.canManage)
    XCTAssertTrue(AdminPreview.player.canManage)
    let player = AdminPlayer(id: "unverified", email: nil, name: nil, displayName: nil, status: "pending", statusLabel: "Pending",
      isAdmin: false, isSelf: false, identityKnown: false, joinedLabel: "Today", lastSeenLabel: "Today")
    XCTAssertFalse(player.canManage)
  }

  func testEncodeCommandsWithoutInventingActorOrNullOptionals() throws {
    let data = try JSONEncoder().encode(AdminCommand(action: "access", targetUserId: "target", intent: "approve"))
    let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: String])
    XCTAssertEqual(json, ["action": "access", "targetUserId": "target", "intent": "approve"])
  }

  func testProtectedFailureRemainsVisibleAndRefreshesDirectory() async {
    let state = AdminScreenState()
    var loads = 0
    let client = AdminClient(load: { _, _ in loads += 1; return AdminPreview.payload("users") },
      send: { _ in AdminActionResult(ok: false, message: "Administrator accounts are protected.") })
    await state.execute(AdminCommand(action: "access", targetUserId: "admin", intent: "remove"), client: client, view: "users")
    XCTAssertEqual(state.notice, "Administrator accounts are protected.")
    XCTAssertEqual(loads, 1)
    XCTAssertNotNil(state.payload?.directory)
    XCTAssertFalse(state.saving)
  }

  func testUncertainWriteRequiresRefreshAndDoesNotRetry() async {
    let state = AdminScreenState()
    var sends = 0
    let client = AdminClient(load: { _, _ in AdminPreview.payload("users") }, send: { _ in sends += 1; throw URLError(.timedOut) })
    let command = AdminCommand(action: "access", targetUserId: "player", intent: "approve")
    await state.load(client: client, view: "users")
    await state.execute(command, client: client, view: "users")
    XCTAssertNil(state.payload)
    XCTAssertTrue(state.needsRefresh)
    await state.execute(command, client: client, view: "users")
    XCTAssertEqual(sends, 1)
    await state.load(client: client, view: "users")
    XCTAssertFalse(state.needsRefresh)
  }

  func testAccessRevocationClearsCachedPrivateData() async {
    let state = AdminScreenState()
    state.payload = AdminPreview.payload("users")
    let client = AdminClient(load: { _, _ in throw APIError.server(message: "Administrator access required.", statusCode: 403) },
      send: { _ in XCTFail("Must not send"); return AdminActionResult(ok: false, message: "") })
    await state.load(client: client, view: "users")
    XCTAssertNil(state.payload)
    XCTAssertEqual(state.error, "Administrator access required.")
    XCTAssertFalse(state.loading)
  }

  func testOpenBoardDecodesWithoutExposingEntry() throws {
    let json = #"{"board":{"weeks":[],"selectedWeek":null,"revealStatus":"open","players":[{"userId":"p","displayName":"Player","submissionStatus":"submitted","entry":null}],"submittedCount":1,"notSubmittedCount":0,"disqualifiedCount":0}}"#
    let payload = try JSONDecoder().decode(AdminPayload.self, from: Data(json.utf8))
    XCTAssertNil(payload.board?.players.first?.entry)
    XCTAssertEqual(payload.board?.submittedCount, 1)
  }
}
