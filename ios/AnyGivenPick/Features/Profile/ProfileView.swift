import ClerkKit
import SwiftUI

struct ProfileView: View {
  @Environment(Clerk.self) private var clerk
  @Environment(AppModel.self) private var appModel
  @Environment(LiveActivityManager.self) private var liveActivityManager
  @Environment(NotificationManager.self) private var notificationManager

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

          deviceTestSection(
            number: "1",
            title: "Live Activity",
            message: liveActivityManager.statusMessage
          ) {
            Button {
              Task { await liveActivityManager.startDemo() }
            } label: {
              HStack {
                Text(liveActivityManager.hasActiveActivity ? "Update demo activity" : "Start demo activity")
                Spacer()
                Image(systemName: "bolt.fill")
              }
            }
            .buttonStyle(CallSheetActionStyle())

            if liveActivityManager.hasActiveActivity {
              Button("End Live Activity") {
                Task { await liveActivityManager.endDemo() }
              }
              .font(AGPTheme.label())
              .foregroundStyle(AGPTheme.clay)
              .frame(minHeight: 44)
            }
          }

          deviceTestSection(
            number: "2",
            title: "Notifications",
            message: notificationManager.statusMessage
          ) {
            Button {
              Task { await notificationManager.requestAndScheduleTest() }
            } label: {
              HStack {
                Text("Send test notification")
                Spacer()
                Image(systemName: "bell.badge")
              }
            }
            .buttonStyle(CallSheetActionStyle())
          }

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
              Task { try? await clerk.auth.signOut() }
            } label: {
              HStack {
                Text("Sign out")
                Spacer()
                Image(systemName: "rectangle.portrait.and.arrow.right")
              }
            }
            .buttonStyle(CallSheetSecondaryActionStyle())
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
