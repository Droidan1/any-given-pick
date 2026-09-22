import SwiftUI

struct ScoreboardEntryMatrix: View {
  let games: [MobileGame]
  let players: [MobileLivePlayerPicks]
  let currentUserId: String
  let currentDisplayName: String
  let selections: [String: String]
  let isEnabled: Bool
  let feedState: AppModel.LivePicksFeedState
  let onSelect: (String, String) -> Void

  private enum Metrics {
    static let playerColumnWidth: CGFloat = 122
    static let gameColumnWidth: CGFloat = 142
    static let headerHeight: CGFloat = 146
    static let userRowHeight: CGFloat = 122
    static let playerRowHeight: CGFloat = 62
  }

  private var otherPlayers: [MobileLivePlayerPicks] {
    players.filter { $0.userId != currentUserId }
  }

  private var selectedCount: Int {
    games.reduce(into: 0) { count, game in
      let selection = selections[game.id]
      if selection == game.away.abbreviation || selection == game.home.abbreviation {
        count += 1
      }
    }
  }

  private var boardHeight: CGFloat {
    Metrics.headerHeight
      + Metrics.userRowHeight
      + (CGFloat(otherPlayers.count) * Metrics.playerRowHeight)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      toolbar

      HStack(alignment: .top, spacing: 0) {
        playerColumn

        ScrollView(.horizontal) {
          LazyHStack(alignment: .top, spacing: 0) {
            ForEach(games) { game in
              gameColumn(game)
            }
          }
          .scrollTargetLayout()
        }
        .scrollTargetBehavior(.viewAligned)
        .scrollIndicators(.visible)
        .accessibilityLabel("Games. Swipe left or right to review every matchup.")
      }
      .frame(height: boardHeight, alignment: .top)
      .overlay(Rectangle().stroke(AGPTheme.sage, lineWidth: 1))

      HStack(spacing: 8) {
        Image(systemName: "arrow.left.and.right")
        Text("Swipe across the games. Your yellow row is the only editable row.")
      }
      .font(.caption)
      .foregroundStyle(AGPTheme.inkSoft)
      .padding(.horizontal, 14)
      .padding(.vertical, 11)
    }
    .background(AGPTheme.paper100)
  }

  private var toolbar: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .firstTextBaseline) {
        Text("LIVE PICKS SCOREBOARD")
          .font(AGPTheme.display(24))
          .foregroundStyle(AGPTheme.paper100)

        Spacer()

        FeedStateBadge(state: feedState)
      }

      Text("Make every call in your row and compare it with each player’s latest saved card.")
        .font(.caption)
        .foregroundStyle(AGPTheme.paper200)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(14)
    .background(AGPTheme.field950)
  }

  private var playerColumn: some View {
    VStack(spacing: 0) {
      boardCell(height: Metrics.headerHeight, background: AGPTheme.field900) {
        VStack(alignment: .leading, spacing: 7) {
          Text("PLAYERS")
            .font(AGPTheme.label(13))
            .tracking(1)
            .foregroundStyle(AGPTheme.maize)
          Text("\(games.count) GAMES")
            .font(AGPTheme.display(22))
            .foregroundStyle(AGPTheme.paper100)
          Text("Live saved cards")
            .font(.caption2)
            .foregroundStyle(AGPTheme.paper200)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
      }

      boardCell(height: Metrics.userRowHeight, background: AGPTheme.maize) {
        VStack(alignment: .leading, spacing: 7) {
          Text(currentDisplayName)
            .font(AGPTheme.display(20))
            .foregroundStyle(AGPTheme.field950)
            .lineLimit(2)
          Text("YOU · \(selectedCount)/\(games.count)")
            .font(AGPTheme.label(12))
            .foregroundStyle(AGPTheme.field800)
          Label("EDITABLE", systemImage: "pencil")
            .font(AGPTheme.label(10))
            .foregroundStyle(AGPTheme.clay)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
      }

      ForEach(otherPlayers) { player in
        boardCell(height: Metrics.playerRowHeight, background: AGPTheme.paper100) {
          VStack(alignment: .leading, spacing: 3) {
            Text(player.displayName)
              .font(AGPTheme.label(14))
              .foregroundStyle(AGPTheme.ink)
              .lineLimit(1)
            Text("\(savedPickCount(player))/\(games.count) saved")
              .font(.caption2)
              .foregroundStyle(AGPTheme.inkSoft)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 10)
        }
      }
    }
    .frame(width: Metrics.playerColumnWidth)
    .zIndex(1)
  }

  private func gameColumn(_ game: MobileGame) -> some View {
    VStack(spacing: 0) {
      gameHeader(game)
      yourPickCell(game)
      ForEach(otherPlayers) { player in
        savedPickCell(player.picks[game.id], game: game)
      }
    }
    .frame(width: Metrics.gameColumnWidth)
  }

  private func gameHeader(_ game: MobileGame) -> some View {
    boardCell(height: Metrics.headerHeight, background: AGPTheme.paper200) {
      VStack(spacing: 6) {
        HStack(spacing: 5) {
          teamHeader(game.away)
          Text("@")
            .font(AGPTheme.label(11))
            .foregroundStyle(AGPTheme.inkSoft)
          teamHeader(game.home)
        }

        Text("\(game.day.uppercased()) · \(game.time)")
          .font(AGPTheme.label(10))
          .foregroundStyle(AGPTheme.inkSoft)
          .lineLimit(1)

        HStack(spacing: 7) {
          oddsLabel(game.away.abbreviation, value: game.odds?.awayMoneyline)
          oddsLabel(game.home.abbreviation, value: game.odds?.homeMoneyline)
        }

        if game.isMondayTiebreaker, let total = game.odds?.overUnder {
          Text("O/U \(total.formatted(.number.precision(.fractionLength(1))))")
            .font(AGPTheme.label(10))
            .foregroundStyle(AGPTheme.clay)
        } else {
          Text(" ").font(AGPTheme.label(10))
        }
      }
      .padding(.horizontal, 7)
    }
  }

  private func teamHeader(_ team: MobileTeam) -> some View {
    VStack(spacing: 2) {
      NativeTeamCrest(code: team.abbreviation, size: 30)
      Text(team.abbreviation)
        .font(AGPTheme.label(11))
        .foregroundStyle(AGPTheme.ink)
    }
    .frame(maxWidth: .infinity)
  }

  private func oddsLabel(_ code: String, value: Int?) -> some View {
    Text("\(code) \(moneyline(value))")
      .font(AGPTheme.label(9))
      .foregroundStyle(AGPTheme.ink)
      .lineLimit(1)
  }

  private func yourPickCell(_ game: MobileGame) -> some View {
    let selection = selections[game.id]
    return boardCell(height: Metrics.userRowHeight, background: AGPTheme.maize.opacity(0.22)) {
      VStack(spacing: 0) {
        pickButton(game.away, game: game, selection: selection, moneyline: game.odds?.awayMoneyline)
        Rectangle().fill(AGPTheme.sage).frame(height: 1)
        pickButton(game.home, game: game, selection: selection, moneyline: game.odds?.homeMoneyline)
      }
    }
  }

  private func pickButton(
    _ team: MobileTeam,
    game: MobileGame,
    selection: String?,
    moneyline: Int?
  ) -> some View {
    let isSelected = selection == team.abbreviation
    return Button {
      onSelect(game.id, team.abbreviation)
    } label: {
      HStack(spacing: 7) {
        NativeTeamCrest(code: team.abbreviation, size: 28)
        VStack(alignment: .leading, spacing: 1) {
          Text(team.abbreviation)
            .font(AGPTheme.display(19))
          Text("ML \(self.moneyline(moneyline))")
            .font(AGPTheme.label(9))
        }
        Spacer(minLength: 0)
        if isSelected {
          Image(systemName: "checkmark.circle.fill")
            .font(.system(size: 17, weight: .black))
        }
      }
      .foregroundStyle(AGPTheme.field950)
      .padding(.horizontal, 8)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(isSelected ? AGPTheme.maize : AGPTheme.paper100.opacity(0.72))
    }
    .buttonStyle(.plain)
    .disabled(!isEnabled)
    .accessibilityLabel("Pick \(team.name). Moneyline \(self.moneyline(moneyline)).")
    .accessibilityAddTraits(isSelected ? .isSelected : [])
  }

  private func savedPickCell(_ selection: String?, game: MobileGame) -> some View {
    let validCode: String? = if selection == game.away.abbreviation || selection == game.home.abbreviation {
      selection
    } else {
      nil
    }

    return boardCell(height: Metrics.playerRowHeight, background: AGPTheme.paper100) {
      Group {
        if let validCode {
          HStack(spacing: 7) {
            NativeTeamCrest(code: validCode, size: 28)
            Text(validCode)
              .font(AGPTheme.display(18))
              .foregroundStyle(AGPTheme.ink)
          }
        } else {
          Text("—")
            .font(AGPTheme.display(20))
            .foregroundStyle(AGPTheme.sage)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  private func boardCell<Content: View>(
    height: CGFloat,
    background: Color,
    @ViewBuilder content: () -> Content
  ) -> some View {
    content()
      .frame(maxWidth: .infinity, minHeight: height, maxHeight: height)
      .background(background)
      .overlay(alignment: .trailing) { Rectangle().fill(AGPTheme.sage).frame(width: 1) }
      .overlay(alignment: .bottom) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }
  }

  private func savedPickCount(_ player: MobileLivePlayerPicks) -> Int {
    games.reduce(into: 0) { count, game in
      let selection = player.picks[game.id]
      if selection == game.away.abbreviation || selection == game.home.abbreviation {
        count += 1
      }
    }
  }

  private func moneyline(_ value: Int?) -> String {
    guard let value else { return "—" }
    return value > 0 ? "+\(value)" : String(value)
  }
}

private struct FeedStateBadge: View {
  let state: AppModel.LivePicksFeedState

  var body: some View {
    HStack(spacing: 5) {
      Circle()
        .fill(color)
        .frame(width: 7, height: 7)
      Text(label)
        .font(AGPTheme.label(10))
        .tracking(0.5)
    }
    .foregroundStyle(AGPTheme.paper100)
    .accessibilityLabel(accessibilityLabel)
  }

  private var label: String {
    switch state {
    case .idle: "CONNECTING"
    case .refreshing: "UPDATING"
    case .live: "LIVE BOARD"
    case .stale: "REFRESH PAUSED"
    }
  }

  private var color: Color {
    switch state {
    case .idle, .refreshing: AGPTheme.maize
    case .live: Color.green
    case .stale: AGPTheme.clay
    }
  }

  private var accessibilityLabel: String {
    switch state {
    case .live(let date):
      "Live board updated \(date.formatted(date: .omitted, time: .shortened))"
    default:
      label.lowercased()
    }
  }
}

#if DEBUG
struct ScoreboardEntryMatrixDebugHost: View {
  @State private var selections = [
    "game-1": "IND",
    "game-2": "GB",
  ]

  var body: some View {
    ZStack {
      CallSheetBackground()
      ScrollView {
        VStack(spacing: 0) {
          BrandHeader(
            eyebrow: "Regular season · Week 3",
            title: "Make your picks",
            message: "Make every call in your highlighted row, then compare your card with the live board."
          )
          ScoreboardEntryMatrix(
            games: Self.games,
            players: Self.players,
            currentUserId: "user-1",
            currentDisplayName: "Napalm",
            selections: selections,
            isEnabled: true,
            feedState: .live(.now)
          ) { gameId, teamCode in
            selections[gameId] = teamCode
          }
        }
      }
    }
    .preferredColorScheme(.light)
  }

  private static let games: [MobileGame] = [
    previewGame(
      id: "game-1",
      day: "Thu",
      time: "8:15 PM",
      away: ("IND", "Indianapolis Colts"),
      home: ("HOU", "Houston Texans"),
      awayMoneyline: 120,
      homeMoneyline: -140
    ),
    previewGame(
      id: "game-2",
      day: "Sun",
      time: "1:00 PM",
      away: ("GB", "Green Bay Packers"),
      home: ("PIT", "Pittsburgh Steelers"),
      awayMoneyline: -110,
      homeMoneyline: 105
    ),
    previewGame(
      id: "game-3",
      day: "Sun",
      time: "4:25 PM",
      away: ("SF", "San Francisco 49ers"),
      home: ("LAR", "Los Angeles Rams"),
      awayMoneyline: -125,
      homeMoneyline: 115
    ),
    previewGame(
      id: "game-4",
      day: "Mon",
      time: "8:15 PM",
      away: ("BAL", "Baltimore Ravens"),
      home: ("KC", "Kansas City Chiefs"),
      awayMoneyline: 130,
      homeMoneyline: -150,
      total: 47.5,
      isMonday: true
    ),
  ]

  private static let players: [MobileLivePlayerPicks] = [
    MobileLivePlayerPicks(
      userId: "user-1",
      displayName: "Napalm",
      picks: ["game-1": "IND", "game-2": "GB"],
      updatedAt: nil
    ),
    MobileLivePlayerPicks(
      userId: "user-2",
      displayName: "Fourth Down",
      picks: ["game-1": "HOU", "game-2": "GB", "game-3": "SF", "game-4": "KC"],
      updatedAt: nil
    ),
    MobileLivePlayerPicks(
      userId: "user-3",
      displayName: "Sunday Driver",
      picks: ["game-1": "IND", "game-2": "PIT", "game-3": "LAR"],
      updatedAt: nil
    ),
    MobileLivePlayerPicks(
      userId: "user-4",
      displayName: "Pick Six",
      picks: ["game-1": "HOU", "game-2": "GB", "game-3": "SF", "game-4": "BAL"],
      updatedAt: nil
    ),
  ]

  private static func previewGame(
    id: String,
    day: String,
    time: String,
    away: (String, String),
    home: (String, String),
    awayMoneyline: Int,
    homeMoneyline: Int,
    total: Double? = nil,
    isMonday: Bool = false
  ) -> MobileGame {
    MobileGame(
      id: id,
      kickoffAt: "2026-09-25T00:15:00.000Z",
      status: "scheduled",
      day: day,
      time: time,
      away: MobileTeam(abbreviation: away.0, name: away.1),
      home: MobileTeam(abbreviation: home.0, name: home.1),
      awayScore: nil,
      homeScore: nil,
      isMondayTiebreaker: isMonday,
      odds: MobileOdds(
        awayMoneyline: awayMoneyline,
        homeMoneyline: homeMoneyline,
        overUnder: total,
        provider: "ESPN",
        updatedAt: "2026-09-22T14:00:00.000Z"
      )
    )
  }
}

#Preview("Scoreboard entry matrix") {
  ScoreboardEntryMatrixDebugHost()
}
#endif
