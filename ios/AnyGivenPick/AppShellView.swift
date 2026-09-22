import SwiftUI
import ClerkKit

enum AppRoute: Hashable {
  case liveRace
  case standings
  case achievements
  case notifications
  case liveActivities
  case followGames
}

enum AppTab: Hashable, CaseIterable {
  case home
  case picks
  case results
  case profile

  var title: String {
    switch self {
    case .home: "Home"
    case .picks: "Picks"
    case .results: "Results"
    case .profile: "Profile"
    }
  }

  var symbol: String {
    switch self {
    case .home: "house"
    case .picks: "checklist"
    case .results: "chart.bar"
    case .profile: "person"
    }
  }
}

struct AppShellView: View {
  @Environment(AppModel.self) private var appModel

  var body: some View {
    @Bindable var appModel = appModel

    TabView(selection: $appModel.selectedTab) {
      ForEach(AppTab.allCases, id: \.self) { tab in
        NavigationStack(path: Binding(get: { appModel.navigationPaths[tab] ?? [] }, set: { appModel.navigationPaths[tab] = $0 })) {
          tabContent(tab)
            .navigationDestination(for: AppRoute.self) { route in
              switch route {
              case .liveRace:
                LiveRaceView()
              case .standings:
                StandingsView()
              case .achievements:
                AchievementsView()
              case .notifications:
                NotificationSettingsView()
              case .liveActivities:
                LiveActivitySettingsView()
              case .followGames:
                FollowGamesView()
              }
            }
        }
        .tabItem {
          Label(tab.title, systemImage: tab.symbol)
        }
        .id("\(tab.title)-\(appModel.notificationNavigationID)")
        .tag(tab)
      }
    }
    .tint(AGPTheme.maize)
    .toolbarBackground(AGPTheme.field950, for: .tabBar)
    .toolbarBackground(.visible, for: .tabBar)
  }

  @ViewBuilder
  private func tabContent(_ tab: AppTab) -> some View {
    switch tab {
    case .home:
      HomeView()
    case .picks:
      PicksView()
    case .results:
      ResultsView()
    case .profile:
      ProfileView()
    }
  }
}

#Preview {
  AppShellView()
    .environment(AppModel(apiClient: .preview))
    .environment(LiveActivityManager())
    .environment(NotificationManager())
    .environment(Clerk.preview())
}
