import ClerkKit
import SwiftUI

struct StandingsView: View {
  @Environment(Clerk.self) private var clerk
  @Environment(AppModel.self) private var appModel

  var body: some View {
    ZStack {
      CallSheetBackground()

      ScrollView {
        LazyVStack(spacing: 0) {
          BrandHeader(
            eyebrow: "Season standings",
            title: "The league table",
            message: "Regular-season calls determine the order. Preseason results stay off the official board."
          )

          standingsContent
        }
      }
      .refreshable {
        await refresh()
      }
    }
    .navigationTitle("Standings")
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
  private var standingsContent: some View {
    switch appModel.standingsState {
    case .idle, .loading:
      LoadingCallSheet(label: "Loading season standings")
    case .failed(let message):
      RetryCallSheet(
        symbol: "exclamationmark.triangle",
        label: "Standings unavailable",
        message: message,
        retry: refresh
      )
    case .loaded(let standings):
      if standings.status == "waiting" {
        waitingContent(standings)
      } else if standings.rows.isEmpty {
        FeatureStatusPanel(
          symbol: "person.3.sequence",
          label: "Regular season",
          title: "No official entries",
          message: "The standings will fill in after official Week 1 cards receive final results."
        )
      } else {
        standingsTable(standings)
      }
    }
  }

  private func waitingContent(_ standings: MobileStandingsSnapshot) -> some View {
    VStack(alignment: .leading, spacing: 18) {
      Image(systemName: "flag.checkered")
        .font(.system(size: 34, weight: .bold))
        .foregroundStyle(AGPTheme.ink)

      Text("REGULAR SEASON \(String(standings.season))")
        .font(AGPTheme.label())
        .foregroundStyle(AGPTheme.clay)

      Text("THE BOARD OPENS AFTER WEEK 1")
        .font(AGPTheme.display(34))
        .foregroundStyle(AGPTheme.ink)

      Text("\(standings.weekOneFinalGames) of \(standings.weekOneGameCount) Week 1 games are final. Rankings begin when every countable Week 1 game is complete.")
        .foregroundStyle(AGPTheme.inkSoft)
        .fixedSize(horizontal: false, vertical: true)

      ProgressView(
        value: Double(standings.weekOneFinalGames),
        total: Double(max(standings.weekOneGameCount, 1))
      )
      .tint(AGPTheme.maizeDeep)
      .scaleEffect(y: 2)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(24)
  }

  private func standingsTable(_ standings: MobileStandingsSnapshot) -> some View {
    VStack(spacing: 0) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 4) {
          Text("\(String(standings.season)) REGULAR SEASON")
            .font(AGPTheme.label())
            .foregroundStyle(AGPTheme.clay)
          Text("THROUGH WEEK \(standings.throughWeek ?? 1)")
            .font(AGPTheme.display(29))
            .foregroundStyle(AGPTheme.ink)
        }
        Spacer()
        Text("\(standings.rows.count) PLAYERS")
          .font(AGPTheme.label(11))
      }
      .padding(20)
      .overlay(alignment: .bottom) { rule }

      HStack(spacing: 10) {
        Text("RK").frame(width: 34, alignment: .leading)
        Text("PLAYER")
        Spacer()
        Text("RIGHT")
        Text("PICKS").frame(width: 42, alignment: .trailing)
      }
      .font(AGPTheme.label(10))
      .foregroundStyle(AGPTheme.inkSoft)
      .padding(.horizontal, 16)
      .padding(.vertical, 10)
      .overlay(alignment: .bottom) { rule }

      ForEach(standings.rows) { row in
        StandingRowView(
          row: row,
          isCurrentUser: row.userId == appModel.bootstrap?.user.id
        )
      }
    }
  }

  private var rule: some View {
    Rectangle().fill(AGPTheme.sage).frame(height: 1)
  }

  private var shouldLoad: Bool {
    if case .idle = appModel.standingsState { return true }
    return false
  }

  private func refresh() async {
    do {
      guard let token = try await clerk.auth.getToken() else { return }
      await appModel.refreshStandings(token: token)
    } catch {
      return
    }
  }
}

private struct StandingRowView: View {
  let row: MobileStandingRow
  let isCurrentUser: Bool

  var body: some View {
    HStack(spacing: 10) {
      VStack(alignment: .leading, spacing: 1) {
        Text("\(row.rank)")
          .font(AGPTheme.display(25))
        if let rankChange = row.rankChange, rankChange != 0 {
          Label(
            "\(abs(rankChange))",
            systemImage: rankChange > 0 ? "arrow.up" : "arrow.down"
          )
          .font(AGPTheme.label(9))
          .foregroundStyle(rankChange > 0 ? AGPTheme.field800 : AGPTheme.clay)
        }
      }
      .frame(width: 34, alignment: .leading)

      PlayerAvatar(photoURL: row.profilePhotoUrl, displayName: row.displayName)

      VStack(alignment: .leading, spacing: 2) {
        Text(row.displayName)
          .font(AGPTheme.label(16))
          .lineLimit(1)
        Text(isCurrentUser ? "YOU" : tiebreakerLabel)
          .font(AGPTheme.label(9))
          .foregroundStyle(isCurrentUser ? AGPTheme.clay : AGPTheme.inkSoft)
      }

      Spacer(minLength: 4)

      Text("\(row.correctPicks)")
        .font(AGPTheme.display(25))

      Text("/ \(row.gradedPicks)")
        .font(AGPTheme.label(13))
        .foregroundStyle(AGPTheme.inkSoft)
        .frame(width: 42, alignment: .trailing)
    }
    .foregroundStyle(AGPTheme.ink)
    .padding(.horizontal, 16)
    .padding(.vertical, 14)
    .background(isCurrentUser ? AGPTheme.maize.opacity(0.28) : Color.clear)
    .overlay(alignment: .bottom) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Rank \(row.rank), \(row.displayName), \(row.correctPicks) correct of \(row.gradedPicks) graded picks")
  }

  private var tiebreakerLabel: String {
    guard let difference = row.tiebreakerDiff else { return "NO TIEBREAK" }
    return "TIEBREAK ±\(difference)"
  }
}

private struct PlayerAvatar: View {
  let photoURL: String?
  let displayName: String

  var body: some View {
    Group {
      if let photoURL, let url = URL(string: photoURL) {
        AsyncImage(url: url) { phase in
          switch phase {
          case .success(let image):
            image.resizable().scaledToFill()
          default:
            initials
          }
        }
      } else {
        initials
      }
    }
    .frame(width: 38, height: 38)
    .clipShape(Circle())
    .overlay(Circle().stroke(AGPTheme.sage, lineWidth: 1))
    .accessibilityHidden(true)
  }

  private var initials: some View {
    Text(displayName.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined())
      .font(AGPTheme.label(12))
      .foregroundStyle(AGPTheme.paper100)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(AGPTheme.field800)
  }
}

#Preview {
  NavigationStack {
    StandingsView()
  }
  .environment(AppModel(apiClient: .preview))
  .environment(Clerk.preview())
}

#if DEBUG
struct StandingsDebugHost: View {
  @Environment(AppModel.self) private var appModel

  var body: some View {
    NavigationStack {
      StandingsView()
    }
    .task {
      appModel.loadStandingsPreview()
    }
  }
}
#endif
