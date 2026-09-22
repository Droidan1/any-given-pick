import XCTest
@testable import AnyGivenPick

final class HealthStatusTests: XCTestCase {
  func testDecodesProductionHealthPayload() throws {
    let data = Data(
      """
      {
        "status": "ok",
        "database": "ok",
        "scoreSync": "ok",
        "scoreSyncRecovery": "not_needed",
        "checkedAt": "2026-09-22T12:00:00.000Z"
      }
      """.utf8
    )

    let status = try JSONDecoder().decode(HealthStatus.self, from: data)

    XCTAssertEqual(status.status, "ok")
    XCTAssertEqual(status.database, "ok")
    XCTAssertEqual(status.scoreSync, "ok")
  }
}

