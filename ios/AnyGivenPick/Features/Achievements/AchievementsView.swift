import ClerkKit
import SwiftUI

struct AchievementsView: View {
  @Environment(Clerk.self) private var clerk
  @Environment(AppModel.self) private var appModel

  var body: some View {
    ZStack {
      CallSheetBackground()

      ScrollView {
        LazyVStack(spacing: 0) {
          BrandHeader(
            eyebrow: "Player achievements",
            title: "Build your legacy",
            message: "Every official card can unlock a new patch. Keep calling winners to complete the set."
          )

          achievementsContent
        }
      }
      .refreshable {
        await refresh()
      }
    }
    .navigationTitle("Achievements")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar(.visible, for: .navigationBar)
    .toolbarBackground(AGPTheme.field950, for: .navigationBar)
    .toolbarBackground(.visible, for: .navigationBar)
    .toolbarColorScheme(.dark, for: .navigationBar)
    .tint(AGPTheme.maize)
    .task {
      if shouldLoad {
        await refresh()
      }
    }
  }

  @ViewBuilder
  private var achievementsContent: some View {
    switch appModel.achievementsState {
    case .idle, .loading:
      LoadingCallSheet(label: "Loading player achievements")
    case .failed(let message):
      RetryCallSheet(
        symbol: "medal",
        label: "Achievements unavailable",
        message: message,
        retry: refresh
      )
    case .loaded(let data):
      achievementLedger(data)
    }
  }

  private func achievementLedger(_ data: MobilePlayerAchievements) -> some View {
    VStack(spacing: 0) {
      HStack(alignment: .center, spacing: 16) {
        ZStack {
          Rectangle().fill(AGPTheme.field950)
          Image(systemName: "medal.fill")
            .font(.system(size: 28, weight: .bold))
            .foregroundStyle(AGPTheme.maize)
        }
        .frame(width: 62, height: 62)

        VStack(alignment: .leading, spacing: 4) {
          Text("PATCH LEDGER")
            .font(AGPTheme.label())
            .foregroundStyle(AGPTheme.clay)
          Text("\(data.earnedCount) OF \(data.totalCount) EARNED")
            .font(AGPTheme.display(29))
            .foregroundStyle(AGPTheme.ink)
        }

        Spacer()
      }
      .padding(20)
      .overlay(alignment: .bottom) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }

      ForEach(data.achievements) { achievement in
        AchievementRow(achievement: achievement)
      }
    }
  }

  private var shouldLoad: Bool {
    if case .idle = appModel.achievementsState { return true }
    return false
  }

  private func refresh() async {
    do {
      guard let token = try await clerk.auth.getToken() else { return }
      await appModel.refreshAchievements(token: token)
    } catch {
      return
    }
  }
}

private struct AchievementRow: View {
  let achievement: MobilePlayerAchievement

  var body: some View {
    HStack(alignment: .top, spacing: 16) {
      VStack(spacing: 3) {
        Text("AGP")
          .font(AGPTheme.label(8))
        Text(achievement.symbol)
          .font(AGPTheme.display(22))
          .minimumScaleFactor(0.7)
          .lineLimit(1)
      }
      .foregroundStyle(achievement.earned ? AGPTheme.field950 : AGPTheme.inkSoft)
      .frame(width: 58, height: 58)
      .background(achievement.earned ? AGPTheme.maize : AGPTheme.paper200)
      .overlay(Rectangle().stroke(AGPTheme.ink, lineWidth: achievement.earned ? 2 : 1))

      VStack(alignment: .leading, spacing: 7) {
        HStack(alignment: .firstTextBaseline) {
          Text(achievement.title.uppercased())
            .font(AGPTheme.label(17))
          Spacer()
          Text(achievement.earned ? "EARNED" : "IN PROGRESS")
            .font(AGPTheme.label(9))
            .foregroundStyle(achievement.earned ? AGPTheme.field800 : AGPTheme.clay)
        }

        Text(achievement.description)
          .font(.subheadline)
          .foregroundStyle(AGPTheme.inkSoft)
          .fixedSize(horizontal: false, vertical: true)

        ProgressView(
          value: Double(min(achievement.progress, achievement.target)),
          total: Double(max(achievement.target, 1))
        )
        .tint(achievement.earned ? AGPTheme.field800 : AGPTheme.maizeDeep)

        Text(achievement.earned ? "Unlocked · \(achievement.earnedOn ?? "Official card")" : achievement.progressLabel)
          .font(AGPTheme.label(10))
          .foregroundStyle(AGPTheme.inkSoft)
      }
    }
    .padding(18)
    .background(achievement.earned ? AGPTheme.maize.opacity(0.12) : Color.clear)
    .overlay(alignment: .bottom) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(achievement.title). \(achievement.earned ? "Earned" : achievement.progressLabel). \(achievement.description)")
  }
}

struct LoadingCallSheet: View {
  let label: String

  var body: some View {
    HStack(spacing: 14) {
      ProgressView().tint(AGPTheme.ink)
      Text(label.uppercased())
        .font(AGPTheme.label())
        .foregroundStyle(AGPTheme.ink)
    }
    .frame(maxWidth: .infinity, minHeight: 150)
  }
}

struct RetryCallSheet: View {
  let symbol: String
  let label: String
  let message: String
  let retry: () async -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Image(systemName: symbol)
        .font(.system(size: 30, weight: .bold))
      Text(label.uppercased())
        .font(AGPTheme.display(30))
      Text(message)
        .foregroundStyle(AGPTheme.inkSoft)

      Button {
        Task { await retry() }
      } label: {
        HStack {
          Text("Try again")
          Spacer()
          Image(systemName: "arrow.clockwise")
        }
      }
      .buttonStyle(CallSheetActionStyle())
    }
    .foregroundStyle(AGPTheme.ink)
    .padding(24)
  }
}

#Preview {
  NavigationStack {
    AchievementsView()
  }
  .environment(AppModel(apiClient: .preview))
  .environment(Clerk.preview())
}

#if DEBUG
struct AchievementsDebugHost: View {
  @Environment(AppModel.self) private var appModel

  var body: some View {
    NavigationStack {
      AchievementsView()
    }
    .task {
      appModel.loadAchievementsPreview()
    }
  }
}
#endif
