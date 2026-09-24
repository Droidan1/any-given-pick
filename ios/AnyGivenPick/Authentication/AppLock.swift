import LocalAuthentication
import Observation
import SwiftUI

@MainActor
protocol DeviceAuthenticating {
  var name: String { get }
  var symbol: String { get }
  func authenticate(reason: String) async throws -> Bool
  func cancel()
}

@MainActor
final class DeviceAuthenticator: DeviceAuthenticating {
  private var context: LAContext?

  private var biometry: LABiometryType {
    let probe = LAContext()
    _ = probe.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
    return probe.biometryType
  }
  var name: String {
    switch biometry {
    case .faceID: "Face ID"
    case .touchID: "Touch ID"
    default: "Device passcode"
    }
  }
  var symbol: String {
    switch biometry {
    case .faceID: "faceid"
    case .touchID: "touchid"
    default: "lock.shield"
    }
  }

  func authenticate(reason: String) async throws -> Bool {
    let attempt = LAContext()
    attempt.localizedCancelTitle = "Cancel"
    context = attempt
    defer { if context === attempt { context = nil } }
    var error: NSError?
    guard attempt.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
      throw error ?? LAError(.passcodeNotSet)
    }
    return try await attempt.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
  }

  func cancel() { context?.invalidate(); context = nil }
}

/// A device-local privacy gate, not a replacement for Clerk or server authorization.
@MainActor @Observable
final class AppLock {
  private(set) var userID: String?
  private(set) var isEnabled = false
  private(set) var isLocked = true
  private(set) var isBusy = false
  private(set) var errorMessage: String?
  private(set) var phase: ScenePhase = .inactive
  private var autoAttempted = false
  private var generation = UUID()
  private let defaults: UserDefaults
  private let authenticator: any DeviceAuthenticating

  init(defaults: UserDefaults = .standard, authenticator: any DeviceAuthenticating = DeviceAuthenticator()) {
    self.defaults = defaults
    self.authenticator = authenticator
  }

  var name: String { authenticator.name }
  var symbol: String { authenticator.symbol }
  var canAccessAccount: Bool { userID != nil && !isLocked }
  var needsAutomaticUnlock: Bool {
    phase == .active && userID != nil && isEnabled && isLocked && !isBusy && !autoAttempted
  }
  var shouldCoverApp: Bool { isEnabled && userID != nil && phase != .active }
  private func key(_ userID: String) -> String { "agp.app-lock.v1.\(userID)" }

  func setAccount(_ id: String?) {
    guard userID != id else { return }
    invalidateAttempt()
    // A completed Clerk sign-out also clears this account's local opt-in.
    // Signing back in must still pass normal server authentication.
    if id == nil, let userID { defaults.removeObject(forKey: key(userID)) }
    userID = id
    isEnabled = id.map { defaults.bool(forKey: key($0)) } ?? false
    isLocked = isEnabled || id == nil
    autoAttempted = false
    errorMessage = nil
  }

  func sceneChanged(_ next: ScenePhase) {
    phase = next
    if next == .background {
      invalidateAttempt()
      isLocked = isEnabled || userID == nil
      autoAttempted = false
      errorMessage = nil
    }
    // Inactive includes Apple's own authentication prompt. Do not cancel/re-prompt.
  }

  func unlock(automatically: Bool = false) async {
    guard userID != nil, isEnabled, isLocked, !isBusy, phase == .active else { return }
    if automatically && autoAttempted { return }
    autoAttempted = true
    if await verify(reason: "Unlock your picks and player account.") { isLocked = false }
  }

  func setEnabled(_ enabled: Bool) async {
    guard let userID, enabled != isEnabled, !isBusy, !isLocked, phase == .active else { return }
    let reason = enabled ? "Turn on app unlock for your player account." : "Turn off app unlock on this iPhone."
    guard await verify(reason: reason), self.userID == userID else { return }
    defaults.set(enabled, forKey: key(userID))
    isEnabled = enabled
    isLocked = false
    autoAttempted = true
  }

  func lockNow() {
    guard isEnabled else { return }
    invalidateAttempt()
    isLocked = true
    autoAttempted = true // Explicit Lock now waits for the player's Unlock tap.
    errorMessage = nil
  }

  private func invalidateAttempt() {
    generation = UUID()
    authenticator.cancel()
    isBusy = false
  }

  private func verify(reason: String) async -> Bool {
    let attempt = UUID()
    generation = attempt
    isBusy = true
    errorMessage = nil
    defer { if generation == attempt { isBusy = false } }
    do {
      let verified = try await authenticator.authenticate(reason: reason)
      guard generation == attempt, !Task.isCancelled, phase != .background else { return false }
      if !verified { errorMessage = "Could not verify you. Try again or use your iPhone passcode." }
      return verified
    } catch {
      guard generation == attempt else { return false }
      switch (error as? LAError)?.code {
      case .userCancel, .systemCancel, .appCancel:
        errorMessage = "Unlock canceled. Tap Unlock when you’re ready."
      case .passcodeNotSet:
        errorMessage = "Set an iPhone passcode in Settings to use app unlock. You can also sign out and sign in again."
      default:
        errorMessage = "Could not verify you. Try again; your iPhone passcode is available if biometrics cannot be used."
      }
      return false
    }
  }
}
