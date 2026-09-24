import ClerkKit
import SwiftUI

struct ProfileView: View {
  @Environment(Clerk.self) private var clerk
  @Environment(AppModel.self) private var appModel
  @Environment(LiveActivityManager.self) private var liveActivityManager
  @Environment(NotificationManager.self) private var notificationManager
  @State private var isSigningOut = false
  @State private var signOutError: String?

  var body: some View {
    ZStack {
      CallSheetBackground()

      ScrollView {
        LazyVStack(spacing: 0) {
          BrandHeader(
            eyebrow: "Player profile",
            title: appModel.bootstrap?.user.displayName ?? "Your account",
            message: appModel.bootstrap?.user.account.reasonLabel ?? "Your approved Any Given Pick identity is shared with the web app."
          )

          accountSection

          if appModel.bootstrap?.user.isAdmin == true {
            NavigationLink(value: AppRoute.admin) {
              Label("Admin tools", systemImage: "person.badge.shield.checkmark")
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(CallSheetActionStyle())
            .padding(20)
            .accessibilityIdentifier("profile-admin-tools")
          }

          AppSecuritySection()

          deviceTestSection(
            number: "1",
            title: "Live Activity",
            message: liveActivityManager.statusMessage
          ) {
            NavigationLink(value: AppRoute.liveActivities) {
              HStack {
                Text("Live Activity settings")
                Spacer()
                Image(systemName: "bolt.fill")
              }
            }
            .buttonStyle(CallSheetActionStyle())

          }

          VStack(alignment: .leading, spacing: 12) {
            Text("IPHONE ALERTS")
              .font(AGPTheme.label())
              .foregroundStyle(AGPTheme.clay)
            Text("Your weekly game plan, delivered.")
              .font(.body)
              .foregroundStyle(AGPTheme.ink)
            NavigationLink(value: AppRoute.notifications) {
              HStack {
                Text("Notification settings")
                Spacer()
                Image(systemName: "bell.badge")
              }
            }
            .buttonStyle(CallSheetActionStyle())
          }
          .padding(20)

          VStack(spacing: 12) {
            NavigationLink(value: AppRoute.achievements) {
              HStack {
                Text("View player achievements")
                Spacer()
                Image(systemName: "medal.fill")
              }
            }
            .buttonStyle(CallSheetSecondaryActionStyle())

            Link(destination: URL(string: "https://anygivenpick.app/profile")!) {
              HStack {
                Text("Edit player card and photo")
                Spacer()
                Image(systemName: "arrow.up.right")
              }
            }
            .buttonStyle(CallSheetSecondaryActionStyle())

            Button(role: .destructive) {
              guard !isSigningOut else { return }
              isSigningOut = true
              signOutError = nil
              Task {
                defer { isSigningOut = false }
                await notificationManager.unregisterBeforeSignOut()
                await liveActivityManager.unregisterBeforeSignOut()
                do { try await clerk.auth.signOut() }
                catch { signOutError = "Sign-out could not finish. Check your connection and try again." }
              }
            } label: {
              HStack {
                Text(isSigningOut ? "Signing out…" : "Sign out")
                Spacer()
                Image(systemName: "rectangle.portrait.and.arrow.right")
              }
            }
            .buttonStyle(CallSheetSecondaryActionStyle())
            .disabled(isSigningOut)
            if let signOutError { Text(signOutError).foregroundStyle(AGPTheme.paper100) }
          }
          .padding(20)
          .background(AGPTheme.field950)
        }
      }
    }
    .toolbar(.hidden, for: .navigationBar)
  }

  private var accountSection: some View {
    let account = appModel.bootstrap?.user.account
    return VStack(alignment: .leading, spacing: 14) {
      Text("ACCOUNT STATUS")
        .font(AGPTheme.label())
        .foregroundStyle(AGPTheme.clay)
      HStack {
        VStack(alignment: .leading, spacing: 4) {
          Text(account?.canParticipate == true ? "APPROVED PLAYER" : "COMMISSIONER REVIEW")
            .font(AGPTheme.display(27))
            .foregroundStyle(AGPTheme.ink)
          Text(account?.reasonLabel ?? "Loading account status…")
            .foregroundStyle(AGPTheme.inkSoft)
        }
        Spacer()
        Image(systemName: account?.canParticipate == true ? "checkmark.shield.fill" : "clock.badge")
          .font(.system(size: 30))
          .foregroundStyle(AGPTheme.ink)
      }
    }
    .padding(20)
    .overlay(alignment: .bottom) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }
  }

  private func deviceTestSection<Actions: View>(
    number: String,
    title: String,
    message: String,
    @ViewBuilder actions: () -> Actions
  ) -> some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .top, spacing: 14) {
        Text(number)
          .font(AGPTheme.display(26))
          .foregroundStyle(AGPTheme.maize)
          .frame(width: 44, height: 44)
          .background(AGPTheme.field950)

        VStack(alignment: .leading, spacing: 5) {
          Text(title.uppercased())
            .font(AGPTheme.display(28))
            .foregroundStyle(AGPTheme.ink)
          Text(message)
            .font(.body)
            .foregroundStyle(AGPTheme.inkSoft)
            .fixedSize(horizontal: false, vertical: true)
        }
      }

      actions()
    }
    .padding(20)
    .overlay(alignment: .bottom) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }
  }
}

struct AppSecuritySection: View {
  @Environment(AppLock.self) private var lock

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("APP SECURITY").font(AGPTheme.label()).foregroundStyle(AGPTheme.clay)
      Toggle(isOn: Binding(get: { lock.isEnabled }, set: { enabled in
        Task { await lock.setEnabled(enabled) }
      })) {
        Label("Use \(lock.name)", systemImage: lock.symbol)
          .font(.headline).fixedSize(horizontal: false, vertical: true)
      }
      .tint(AGPTheme.field950)
      .disabled(lock.isBusy || lock.userID == nil)
      .accessibilityIdentifier("app-lock-toggle")
      Text("Require an unlock when you reopen the app. Your iPhone passcode is the fallback. Turning this on starts a verification now.")
        .font(.subheadline).foregroundStyle(AGPTheme.inkSoft)
      if lock.isBusy { ProgressView("Verifying…") }
      if let message = lock.errorMessage { Text(message).font(.subheadline) }
      if lock.isEnabled {
        Button("Lock now") { lock.lockNow() }
          .font(.body.weight(.semibold)).frame(minHeight: 44).disabled(lock.isBusy)
          .accessibilityIdentifier("app-lock-now")
      }
      Text("Only on this iPhone. Face data is handled by iOS, not stored by Any Given Pick. Notification previews and Live Activities are separate.")
        .font(.footnote).foregroundStyle(AGPTheme.inkSoft)
    }
    .foregroundStyle(AGPTheme.ink)
    .padding(20)
    .overlay(alignment: .bottom) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }
  }
}

struct NotificationSettingsView: View {
  @Environment(NotificationManager.self) private var notifications
  @Environment(\.openURL) private var openURL

  var body: some View {
    Form {
      Section {
        VStack(alignment: .leading, spacing: 12) {
          Label(notifications.alertsActive ? "ALERTS ARE ON" : "STAY IN THE GAME", systemImage: "bell.badge.fill")
            .font(AGPTheme.label(18))
          Text(notifications.statusMessage)
            .font(.body)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("notification-status")
          if notifications.isBusy {
            ProgressView("Saving settings…")
          } else if notifications.authorizationStatus == .denied {
            Button("Open iPhone notification settings") {
              if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
            }
            .frame(minHeight: 44)
          } else if !notifications.permissionGranted || !notifications.registered || !notifications.preferences.enabled {
            Button("Enable iPhone alerts") { Task { await notifications.enable() } }
              .frame(minHeight: 44)
              .disabled(!notifications.isReady)
              .accessibilityIdentifier("enable-iphone-alerts")
          }
          Button("Refresh connection") { Task { await notifications.refresh() } }
            .disabled(notifications.isBusy)
            .frame(minHeight: 44)
        }
        .padding(.vertical, 8)
      } footer: {
        Text("These settings apply only to this iPhone. Email and web push preferences are separate.")
      }
      .listRowBackground(AGPTheme.paper200)

      Section("Weekly alerts") {
        preference("New weekly card", detail: "When the commissioner publishes a call sheet.", keyPath: \.weekPublished)
        preference("Deadline approaching", detail: "A reminder within 24 hours of lock, only if you haven't submitted.", keyPath: \.deadlineApproaching)
        preference("Picks submitted", detail: "Confirmation when your official card is saved.", keyPath: \.picksSubmitted)
        preference("Results available", detail: "When every game is final or canceled and your results are ready.", keyPath: \.resultsAvailable)
      }
      .listRowBackground(AGPTheme.paper100)
      .disabled(!notifications.registered || !notifications.permissionGranted || !notifications.preferences.enabled || notifications.isBusy)

      if notifications.registered && notifications.preferences.enabled {
        Section {
          Button("Turn off alerts on this iPhone", role: .destructive) {
            var preferences = notifications.preferences
            preferences.enabled = false
            Task { await notifications.save(preferences) }
          }
          .disabled(notifications.isBusy)
          .frame(minHeight: 44)
        }
        .listRowBackground(AGPTheme.paper100)
      }
    }
    .foregroundStyle(AGPTheme.ink)
    .tint(AGPTheme.field950)
    .scrollContentBackground(.hidden)
    .background(AGPTheme.paper100)
    .navigationTitle("iPhone alerts")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar(.visible, for: .navigationBar)
  }

  private func preference(_ title: String, detail: String, keyPath: WritableKeyPath<NativeNotificationPreferences, Bool>) -> some View {
    Toggle(isOn: Binding(
      get: { notifications.preferences[keyPath: keyPath] },
      set: { value in
        var preferences = notifications.preferences
        preferences[keyPath: keyPath] = value
        Task { await notifications.save(preferences) }
      }
    )) {
      VStack(alignment: .leading, spacing: 5) {
        Text(title).font(.headline)
        Text(detail).font(.subheadline).foregroundStyle(AGPTheme.inkSoft)
      }
      .padding(.vertical, 6)
    }
    .accessibilityHint(detail)
  }
}

#if DEBUG
struct NotificationSettingsDebugHost: View {
  @State private var notifications = NotificationManager()
  var body: some View {
    NavigationStack { NotificationSettingsView() }
      .environment(notifications)
      .task { notifications.loadPreview() }
  }
}

#Preview { NotificationSettingsDebugHost() }
#endif
