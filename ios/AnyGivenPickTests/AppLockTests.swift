import LocalAuthentication
import SwiftUI
import XCTest
@testable import AnyGivenPick

@MainActor
final class AppLockTests: XCTestCase {
  func testPrivacyStatusDistinguishesAuthenticationFromBackgroundLock() {
    let locked = AppLockStatus(isVerifying: false, authenticationName: "Face ID", authenticationSymbol: "faceid")
    XCTAssertEqual(locked.title, "Account locked")
    XCTAssertEqual(locked.symbol, "lock.fill")
    let verifying = AppLockStatus(isVerifying: true, authenticationName: "Touch ID", authenticationSymbol: "touchid")
    XCTAssertEqual(verifying.title, "Verifying with Touch ID…")
    XCTAssertEqual(verifying.symbol, "touchid")
  }

  private func fixture() -> (AppLock, MockDeviceAuthenticator, UserDefaults, String) {
    let suite = "app-lock-test-\(UUID())"
    let defaults = UserDefaults(suiteName: suite)!
    let auth = MockDeviceAuthenticator()
    let lock = AppLock(defaults: defaults, authenticator: auth)
    lock.setAccount("player-one")
    lock.sceneChanged(.active)
    return (lock, auth, defaults, suite)
  }

  func testOffByDefaultAndRequiresVerifiedOptIn() async {
    let (lock, auth, defaults, suite) = fixture()
    defer { defaults.removePersistentDomain(forName: suite) }
    XCTAssertFalse(lock.isEnabled)
    XCTAssertTrue(lock.canAccessAccount)
    auth.error = LAError(.userCancel)
    await lock.setEnabled(true)
    XCTAssertFalse(lock.isEnabled)
    auth.error = nil
    await lock.setEnabled(true)
    XCTAssertTrue(lock.isEnabled)
    XCTAssertTrue(lock.canAccessAccount)
    XCTAssertEqual(auth.attempts, 2)
  }

  func testColdStartRequiresUnlockAndFailedUnlockStaysLocked() async {
    let (lock, auth, defaults, suite) = fixture()
    defer { defaults.removePersistentDomain(forName: suite) }
    await lock.setEnabled(true)
    let cold = AppLock(defaults: defaults, authenticator: auth)
    cold.setAccount("player-one")
    cold.sceneChanged(.active)
    XCTAssertFalse(cold.canAccessAccount)
    auth.result = false
    await cold.unlock()
    XCTAssertTrue(cold.isLocked)
    auth.result = true
    await cold.unlock()
    XCTAssertTrue(cold.canAccessAccount)
  }

  func testInactiveCoversButDoesNotRelockBackgroundDoes() async {
    let (lock, _, defaults, suite) = fixture()
    defer { defaults.removePersistentDomain(forName: suite) }
    await lock.setEnabled(true)
    lock.sceneChanged(.inactive)
    XCTAssertTrue(lock.shouldCoverApp)
    XCTAssertFalse(lock.isLocked)
    lock.sceneChanged(.active)
    XCTAssertFalse(lock.shouldCoverApp)
    XCTAssertFalse(lock.needsAutomaticUnlock)
    lock.sceneChanged(.background)
    XCTAssertTrue(lock.isLocked)
    lock.sceneChanged(.active)
    XCTAssertTrue(lock.needsAutomaticUnlock)
    await lock.unlock(automatically: true)
    XCTAssertFalse(lock.isLocked)
  }

  func testCancelDoesNotCreateAutomaticPromptLoop() async {
    let (lock, auth, defaults, suite) = fixture()
    defer { defaults.removePersistentDomain(forName: suite) }
    await lock.setEnabled(true)
    lock.sceneChanged(.background)
    lock.sceneChanged(.active)
    auth.error = LAError(.userCancel)
    await lock.unlock(automatically: true)
    let attempts = auth.attempts
    lock.sceneChanged(.inactive)
    lock.sceneChanged(.active)
    XCTAssertFalse(lock.needsAutomaticUnlock)
    await lock.unlock(automatically: true)
    XCTAssertEqual(auth.attempts, attempts)
    XCTAssertTrue(lock.isLocked)
    auth.error = nil
    await lock.unlock()
    XCTAssertFalse(lock.isLocked)
  }

  func testDisablingNeedsVerificationAndLockNowCannotDisable() async {
    let (lock, auth, defaults, suite) = fixture()
    defer { defaults.removePersistentDomain(forName: suite) }
    await lock.setEnabled(true)
    auth.error = LAError(.authenticationFailed)
    await lock.setEnabled(false)
    XCTAssertTrue(lock.isEnabled)
    auth.error = nil
    lock.lockNow()
    await lock.setEnabled(false)
    XCTAssertTrue(lock.isEnabled)
    XCTAssertFalse(lock.needsAutomaticUnlock)
    await lock.unlock()
    await lock.setEnabled(false)
    XCTAssertFalse(lock.isEnabled)
  }

  func testAccountIsolationAndCompletedSignOutClearsOptIn() async {
    let (lock, _, defaults, suite) = fixture()
    defer { defaults.removePersistentDomain(forName: suite) }
    await lock.setEnabled(true)
    lock.setAccount("player-two")
    XCTAssertFalse(lock.isEnabled)
    lock.setAccount("player-one")
    XCTAssertTrue(lock.isLocked)
    lock.setAccount(nil)
    XCTAssertFalse(lock.canAccessAccount)
    lock.setAccount("player-one")
    XCTAssertFalse(lock.isEnabled)
  }

  func testNoPasscodeFailsSafelyWithRecoveryMessage() async {
    let (lock, auth, defaults, suite) = fixture()
    defer { defaults.removePersistentDomain(forName: suite) }
    auth.error = LAError(.passcodeNotSet)
    await lock.setEnabled(true)
    XCTAssertFalse(lock.isEnabled)
    XCTAssertTrue(lock.errorMessage?.contains("Set an iPhone passcode") == true)
  }

  func testLateSuccessCannotUnlockAfterBackgroundOrAccountChange() async {
    for changeAccount in [false, true] {
      let (lock, auth, defaults, suite) = fixture()
      defer { defaults.removePersistentDomain(forName: suite) }
      await lock.setEnabled(true)
      lock.lockNow()
      auth.suspend = true
      let attempt = Task { await lock.unlock() }
      while auth.pending == nil { await Task.yield() }
      if changeAccount { lock.setAccount("player-two"); lock.setAccount("player-one") }
      else { lock.sceneChanged(.background); lock.sceneChanged(.active) }
      auth.pending?.resume(returning: true)
      await attempt.value
      XCTAssertTrue(lock.isLocked)
      XCTAssertFalse(lock.isBusy)
    }
  }

  func testOnlyOneAuthenticationAttemptAtATime() async {
    let (lock, auth, defaults, suite) = fixture()
    defer { defaults.removePersistentDomain(forName: suite) }
    await lock.setEnabled(true)
    lock.lockNow()
    auth.suspend = true
    let first = Task { await lock.unlock() }
    while auth.pending == nil { await Task.yield() }
    await lock.unlock()
    XCTAssertEqual(auth.attempts, 2)
    auth.pending?.resume(returning: true)
    await first.value
    XCTAssertFalse(lock.isLocked)
  }
}

@MainActor
private final class MockDeviceAuthenticator: DeviceAuthenticating {
  let name = "Face ID"
  let symbol = "faceid"
  var result = true
  var error: Error?
  var attempts = 0
  var suspend = false
  var pending: CheckedContinuation<Bool, Never>?
  func authenticate(reason: String) async throws -> Bool {
    attempts += 1
    if let error { throw error }
    if suspend { return await withCheckedContinuation { pending = $0 } }
    return result
  }
  func cancel() { }
}
