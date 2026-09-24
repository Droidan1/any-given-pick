import SwiftUI
import UIKit

// THESIS: Field Green turns the privacy gate into a branded return to the game.
// OWN-WORLD: Solid field950, paper type, maize SF Symbols, exact transparent cards.
// STORY: Account content stays hidden; native authentication opens it; cancellation offers retry.
// FIRST VIEWPORT: Clear system-prompt space, centered wordmark/cards, large left headline,
// status, then a ruled privacy footer. Recovery controls appear only when not verifying.
// FORM: User-selected Field Green, option 2; semantic SwiftUI and Dynamic Type.
// FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md

/// Presentation contains no player data, so it can also be used in app-switcher snapshots.
struct AppLockStatus: Equatable {
  let isVerifying: Bool
  let authenticationName: String
  let authenticationSymbol: String

  var title: String { isVerifying ? "Verifying with \(authenticationName)…" : "Account locked" }
  var symbol: String { isVerifying ? authenticationSymbol : "lock.fill" }
}

struct FieldGreenLockScreen<Recovery: View>: View {
  let status: AppLockStatus
  var hasRecovery = false
  @ViewBuilder let recovery: () -> Recovery
  @ScaledMetric(relativeTo: .largeTitle) private var headlineSize = 64.0
  @ScaledMetric(relativeTo: .largeTitle) private var compactHeadlineSize = 48.0

  var body: some View {
    GeometryReader { geometry in
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          VStack(spacing: 24) {
            Text("ANY \(Text("GIVEN").foregroundStyle(AGPTheme.maize)) PICK")
            AppBrandMark()
              .frame(width: hasRecovery ? 88 : 144, height: hasRecovery ? 88 : 144)
              .accessibilityHidden(true)
          }
          .font(.title.bold().width(.condensed))
          .multilineTextAlignment(.center)
          .frame(maxWidth: .infinity)
          .padding(.bottom, hasRecovery ? 24 : 40)

          Text("BACK TO\nTHE GAME.")
            .font(.system(size: hasRecovery || geometry.size.width < 350 ? compactHeadlineSize : headlineSize, weight: .heavy).width(.condensed))
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)

          Label {
            Text(status.title).font(.body)
              .fixedSize(horizontal: false, vertical: true)
          } icon: {
            Image(systemName: status.symbol)
              .font(.title).foregroundStyle(AGPTheme.maize).accessibilityHidden(true)
          }
          .labelStyle(.titleAndIcon)
          .padding(.top, 24)
          .accessibilityIdentifier("app-lock-status")

          if hasRecovery { recovery().padding(.top, 24) }
          Spacer(minLength: hasRecovery ? 32 : 64)

          VStack(alignment: .leading, spacing: 12) {
            Rectangle().fill(AGPTheme.paper100.opacity(0.3)).frame(height: 1).accessibilityHidden(true)
            Text("Your account stays hidden\nuntil you unlock.")
              .font(.footnote).fixedSize(horizontal: false, vertical: true)
          }
        }
        .padding(.horizontal, geometry.size.width < 350 ? 24 : 32)
        .padding(.top, hasRecovery ? 24 : min(112, max(48, geometry.size.height * 0.14)))
        .padding(.bottom, 32)
        .frame(maxWidth: 520, minHeight: geometry.size.height, alignment: .topLeading)
        .frame(maxWidth: .infinity)
      }
      .scrollBounceBehavior(.basedOnSize)
    }
    .foregroundStyle(AGPTheme.paper100)
    .background(AGPTheme.field950.ignoresSafeArea())
    .tint(AGPTheme.maize)
    .preferredColorScheme(.dark)
  }
}

struct AppLockView: View {
  @Environment(AppLock.self) private var lock
  let signOut: () async throws -> Void
  @State private var confirmSignOut = false
  @State private var signingOut = false
  @State private var signOutError: String?

  var body: some View {
    FieldGreenLockScreen(
      status: AppLockStatus(isVerifying: lock.isBusy, authenticationName: lock.name, authenticationSymbol: lock.symbol),
      hasRecovery: !lock.isBusy
    ) {
        VStack(alignment: .leading, spacing: 16) {
          if let message = lock.errorMessage {
            Text(message).font(.body).accessibilityIdentifier("app-lock-error")
          }
          if let signOutError { Text(signOutError).font(.body) }
          Button {
            Task { await lock.unlock() }
          } label: {
            Label("Unlock with \(lock.name)", systemImage: lock.symbol)
              .font(.headline.bold().width(.condensed))
              .fixedSize(horizontal: false, vertical: true).padding(.vertical, 12)
          }
          .buttonStyle(CallSheetActionStyle())
          .disabled(lock.isBusy || signingOut)
          .accessibilityIdentifier("app-unlock")
          Text("Your iPhone passcode can be used if \(lock.name) is unavailable.")
            .font(.footnote).fixedSize(horizontal: false, vertical: true)
          Button(signingOut ? "Signing out…" : "Sign out instead") { confirmSignOut = true }
            .font(.body.weight(.semibold)).frame(minHeight: 44)
            .foregroundStyle(AGPTheme.paper100).underline()
            .disabled(lock.isBusy || signingOut)
          Text("This unlocks this app only. Notification previews and Live Activities use separate iPhone settings.")
            .font(.footnote).foregroundStyle(AGPTheme.paper200)
            .fixedSize(horizontal: false, vertical: true)
        }
    }
    .alert("Sign out of this iPhone?", isPresented: $confirmSignOut) {
      Button("Cancel", role: .cancel) { }
      Button("Sign out", role: .destructive) {
        signingOut = true
        Task {
          defer { signingOut = false }
          signOutError = nil
          do { try await signOut() }
          catch { signOutError = "Sign-out could not finish. Check your connection and try again." }
        }
      }
    } message: {
      Text("You’ll need to sign in again. Unsynced changes on this iPhone will be removed; saved and submitted cards stay on your account.")
    }
  }
}

/// Separate window covers even presented review/account sheets in app-switcher snapshots.
struct AppPrivacyCover: UIViewRepresentable {
  let visible: Bool
  let status: AppLockStatus
  func makeUIView(context: Context) -> CoverAnchor { CoverAnchor() }
  func updateUIView(_ view: CoverAnchor, context: Context) { view.setVisible(visible, status: status) }
  static func dismantleUIView(_ view: CoverAnchor, coordinator: ()) { view.setVisible(false) }

  final class CoverAnchor: UIView {
    private var cover: UIWindow?
    private var needsCover = false
    private var status = AppLockStatus(isVerifying: false, authenticationName: "Face ID", authenticationSymbol: "faceid")
    override func didMoveToWindow() { super.didMoveToWindow(); updateCover() }
    func setVisible(_ visible: Bool, status: AppLockStatus? = nil) {
      needsCover = visible
      if let status { self.status = status }
      updateCover()
    }
    private func updateCover() {
      guard needsCover, let scene = window?.windowScene else {
        cover?.isHidden = true
        cover = nil
        return
      }
      let content = FieldGreenLockScreen(status: status) { EmptyView() }
      if let host = cover?.rootViewController as? PrivacyHostingController {
        host.rootView = content
        return
      }
      let shield = UIWindow(windowScene: scene)
      shield.windowLevel = .alert + 1
      shield.backgroundColor = UIColor(AGPTheme.field950)
      shield.rootViewController = PrivacyHostingController(rootView: content)
      shield.isHidden = false
      cover = shield
    }
  }

  private final class PrivacyHostingController: UIHostingController<FieldGreenLockScreen<EmptyView>> {
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
  }
}

#if DEBUG
struct AppLockDebugHost: View {
  @Environment(\.scenePhase) private var phase
  @State private var lock = AppLock(defaults: UserDefaults(suiteName: "agp-unlock-preview")!)
  var body: some View {
    Group {
      if ProcessInfo.processInfo.arguments.contains("-unlock-verifying") {
        FieldGreenLockScreen(status: AppLockStatus(isVerifying: true, authenticationName: "Face ID", authenticationSymbol: "faceid")) { EmptyView() }
      } else if lock.isLocked { AppLockView(signOut: { lock.setAccount(nil); lock.setAccount("fixture") }) }
      else { ScrollView { AppSecuritySection() } }
    }
    .environment(lock)
    .background(AGPTheme.paper100.ignoresSafeArea())
    .background(AppPrivacyCover(
      visible: lock.shouldCoverApp || ProcessInfo.processInfo.arguments.contains("-unlock-cover"),
      status: AppLockStatus(isVerifying: lock.isBusy || ProcessInfo.processInfo.arguments.contains("-unlock-verifying"), authenticationName: lock.name, authenticationSymbol: lock.symbol)
    ))
    .frame(maxWidth: ProcessInfo.processInfo.arguments.contains("-unlock-narrow") ? 320 : .infinity)
    .dynamicTypeSize(ProcessInfo.processInfo.arguments.contains("-unlock-large-type") ? .accessibility3 : .large)
    .onAppear {
      let startsLocked = ProcessInfo.processInfo.arguments.contains("-unlock-locked")
      UserDefaults(suiteName: "agp-unlock-preview")!.set(startsLocked, forKey: "agp.app-lock.v1.fixture")
      lock.setAccount("fixture")
      if startsLocked { lock.lockNow() }
      lock.sceneChanged(phase)
    }
    .onChange(of: phase) { _, next in lock.sceneChanged(next) }
    .onChange(of: lock.needsAutomaticUnlock, initial: true) { _, needed in
      if needed { Task { await lock.unlock(automatically: true) } }
    }
  }
}
#endif
