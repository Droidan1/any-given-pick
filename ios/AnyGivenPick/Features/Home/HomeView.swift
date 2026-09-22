import ClerkKit
import SwiftUI

struct HomeView: View {
  @Environment(Clerk.self) private var clerk
  @Environment(AppModel.self) private var appModel

  var body: some View {
    ZStack {
      CallSheetBackground()

      ScrollView {
        LazyVStack(spacing: 0) {
          BrandHeader(
            eyebrow: appModel.bootstrap?.currentWeek?.label ?? "Any Given Pick",
            title: homeTitle,
            message: homeMessage
          )

          VStack(alignment: .leading, spacing: 22) {
            accountPanel

            if let week = appModel.bootstrap?.currentWeek {
              currentWeekPanel(week)
              liveRaceLink(week)
            } else if appModel.bootstrap?.user.account.canParticipate == true {
              emptyWeekPanel
            }
          }
          .padding(24)
        }
      }
      .refreshable {
        await refreshAccount()
      }
    }
    .toolbar(.hidden, for: .navigationBar)
  }

  private var homeTitle: String {
    guard let week = appModel.bootstrap?.currentWeek else { return "The huddle is open" }
    return week.isLocked ? "Your card is locked" : "Make every call"
  }

  private var homeMessage: String {
    guard let bootstrap = appModel.bootstrap else { return "Loading your player account." }
    if !bootstrap.user.account.canParticipate {
      return bootstrap.user.account.reasonLabel
    }
    guard let week = bootstrap.currentWeek else {
      return "The commissioner has not published the next call sheet yet."
    }
    return week.isLocked
      ? "Follow every result as games finish."
      : "Submit your official card before \(week.deadlineLabel)."
  }

  private var accountPanel: some View {
    let account = appModel.bootstrap?.user.account
    return HStack(spacing: 14) {
      Image(systemName: account?.canParticipate == true ? "checkmark.shield" : "clock.badge")
        .font(.system(size: 22, weight: .bold))
        .foregroundStyle(AGPTheme.ink)
        .frame(width: 44, height: 44)
        .overlay(Rectangle().stroke(AGPTheme.sage, lineWidth: 1))

      VStack(alignment: .leading, spacing: 4) {
        Text(account?.canParticipate == true ? "ELIGIBLE TO PLAY" : "ACCOUNT REVIEW")
          .font(AGPTheme.label())
          .foregroundStyle(AGPTheme.ink)
        Text(account?.reasonLabel ?? "Checking your player access…")
          .font(.subheadline)
          .foregroundStyle(AGPTheme.inkSoft)
      }

      Spacer(minLength: 0)
    }
    .padding(.vertical, 16)
    .overlay(alignment: .top) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }
    .overlay(alignment: .bottom) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }
    .accessibilityElement(children: .combine)
  }

  private func currentWeekPanel(_ week: MobilePlayerWeek) -> some View {
    let submitted = (week.entry?.currentVersionNumber ?? 0) > 0
    let pickCount = appModel.draftPicks.count
    return VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 5) {
          Text("CURRENT CALL SHEET")
            .font(AGPTheme.label())
            .tracking(1.2)
            .foregroundStyle(AGPTheme.clay)
          Text(week.label.uppercased())
            .font(AGPTheme.display(34))
            .foregroundStyle(AGPTheme.ink)
        }
        Spacer()
        Text("\(pickCount)/\(week.games.count)")
          .font(AGPTheme.display(26))
          .foregroundStyle(AGPTheme.ink)
      }

      Text(submitted ? "Official version \(week.entry?.currentVersionNumber ?? 1) is in." : "Your working card saves securely to the same account as the web app.")
        .font(.body)
        .foregroundStyle(AGPTheme.inkSoft)

      Button {
        appModel.selectedTab = week.isLocked ? .results : .picks
      } label: {
        HStack {
          Text(week.isLocked ? "Follow results" : submitted ? "Review your card" : "Make your picks")
          Spacer()
          Image(systemName: "arrow.right")
        }
      }
      .buttonStyle(CallSheetActionStyle())
      .disabled(appModel.bootstrap?.user.account.canParticipate != true)
    }
  }

  private func liveRaceLink(_ week: MobilePlayerWeek) -> some View {
    NavigationLink(value: AppRoute.liveRace) {
      HStack(spacing: 16) {
        Image(systemName: "flag.checkered.2.crossed")
          .font(.system(size: 25, weight: .bold))
          .foregroundStyle(AGPTheme.field950)
          .frame(width: 54, height: 54)
          .background(AGPTheme.maize)

        VStack(alignment: .leading, spacing: 4) {
          Text(week.isLocked ? "LIVE NOW" : "OPENS AFTER LOCK")
            .font(AGPTheme.label(10))
            .foregroundStyle(week.isLocked ? AGPTheme.maize : AGPTheme.paper200)
          Text("LIVE RACE")
            .font(AGPTheme.display(27))
            .foregroundStyle(AGPTheme.paper100)
          Text(week.isLocked ? "See the projected leader and every swing call." : "Preview the race page before official cards are revealed.")
            .font(.caption)
            .foregroundStyle(AGPTheme.paper200)
            .fixedSize(horizontal: false, vertical: true)
        }

        Spacer(minLength: 4)

        Image(systemName: "chevron.right")
          .font(.headline.bold())
          .foregroundStyle(AGPTheme.maize)
      }
      .frame(maxWidth: .infinity, minHeight: 90, alignment: .leading)
      .padding(16)
      .background(AGPTheme.field950)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(appModel.bootstrap?.user.account.canParticipate != true)
    .accessibilityLabel(week.isLocked ? "Open the live week race" : "Open the live race preview. Official cards reveal after lock")
  }

  private var emptyWeekPanel: some View {
    FeatureStatusPanel(
      symbol: "calendar.badge.clock",
      label: "Between weeks",
      title: "Next sheet coming soon",
      message: "This screen will update as soon as the commissioner publishes the next contest week."
    )
    .padding(.horizontal, -24)
  }

  private func refreshAccount() async {
    do {
      guard let token = try await clerk.auth.getToken() else { return }
      await appModel.loadAuthenticatedAccount(token: token)
    } catch {
      return
    }
  }
}

#Preview {
  NavigationStack {
    HomeView()
      .environment(AppModel(apiClient: .preview))
      .environment(Clerk.preview())
  }
}
