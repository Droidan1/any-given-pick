import SwiftUI

struct ScoreboardEntryMatrix: View {
  let games: [MobileGame]
  let players: [MobileLivePlayerPicks]
  let currentUserId: String
  let currentDisplayName: String
  let selections: [String: String]
  let isEnabled: Bool
  let feedState: AppModel.LivePicksFeedState
  var isLocked = false
  @Binding var prediction: Int?
  @Binding var visibleGameId: String?
  let onSelect: (String, String) -> Void

  @ScaledMetric(relativeTo: .body) private var gameWidth = 164.0
  @ScaledMetric(relativeTo: .body) private var headerHeight = 124.0
  @ScaledMetric(relativeTo: .body) private var pickHeight = 100.0
  @ScaledMetric(relativeTo: .body) private var totalHeight = 72.0
  @ScaledMetric(relativeTo: .body) private var playerHeight = 64.0
  @Environment(\.dynamicTypeSize) private var typeSize
  @FocusState private var editingTotal: Bool
  private var playerWidth: CGFloat { typeSize.isAccessibilitySize ? 136 : 104 }
  private var userHeight: CGFloat { pickHeight + (games.contains(where: \.isMondayTiebreaker) ? totalHeight : 0) }

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
    headerHeight + userHeight + (CGFloat(otherPlayers.count) * playerHeight)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      toolbar

      GeometryReader { geometry in
      HStack(alignment: .top, spacing: 0) {
        playerColumn

        ScrollView(.horizontal) {
          LazyHStack(alignment: .top, spacing: 0) {
            ForEach(games) { game in
              gameColumn(game, width: min(gameWidth, max(164, geometry.size.width - playerWidth)))
                .id(game.id)
            }
          }
          .scrollTargetLayout()
        }
        .scrollTargetBehavior(.viewAligned)
        .scrollPosition(id: $visibleGameId, anchor: .leading)
        .scrollIndicators(.visible)
        .accessibilityLabel("Games. Swipe left or right to review every matchup.")
      }
      }
      .frame(height: boardHeight, alignment: .top)
      .overlay(Rectangle().stroke(AGPTheme.sage, lineWidth: 1))

      HStack(spacing: 8) {
        Image(systemName: "arrow.left.and.right")
        Text(isLocked ? "Your row shows your official card. Other rows show saved picks."
          : "Swipe across games. Only your yellow row can be edited.")
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
        Text("SAVED PICKS BOARD")
          .font(.headline.weight(.bold).width(.condensed))
          .foregroundStyle(AGPTheme.paper100)

        Spacer()

        if !isLocked { FeedStateBadge(state: feedState) }
      }

      Text("Game \((games.firstIndex { $0.id == visibleGameId } ?? 0) + 1) of \(games.count) · swipe for more")
        .font(.caption)
        .foregroundStyle(AGPTheme.paper200)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(14)
    .background(AGPTheme.field950)
  }

  private var playerColumn: some View {
    VStack(spacing: 0) {
      boardCell(height: headerHeight, background: AGPTheme.field900) {
        VStack(alignment: .leading, spacing: 7) {
          Text("PLAYERS")
            .font(.caption.weight(.bold))
            .tracking(1)
            .foregroundStyle(AGPTheme.maize)
          Text("\(games.count) GAMES")
            .font(.headline.weight(.bold).width(.condensed))
            .foregroundStyle(AGPTheme.paper100)
          Text("Live saved cards")
            .font(.caption2)
            .foregroundStyle(AGPTheme.paper200)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
      }

      boardCell(height: userHeight, background: AGPTheme.maize) {
        VStack(alignment: .leading, spacing: 7) {
          Text(currentDisplayName)
            .font(.headline.weight(.bold).width(.condensed))
            .foregroundStyle(AGPTheme.field950)
            .lineLimit(2)
          Text("YOU · \(selectedCount)/\(games.count)")
            .font(.caption.weight(.bold))
            .foregroundStyle(AGPTheme.field800)
          Label(isLocked ? (selections.isEmpty ? "NO ENTRY" : "OFFICIAL") : "YOUR ROW", systemImage: isLocked ? "lock.fill" : "pencil")
            .font(.caption2.weight(.bold))
            .foregroundStyle(AGPTheme.clay)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
      }

      ForEach(otherPlayers) { player in
        boardCell(height: playerHeight, background: AGPTheme.paper100) {
          VStack(alignment: .leading, spacing: 3) {
            Text(player.displayName)
              .font(.subheadline.weight(.semibold).width(.condensed))
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
    .frame(width: playerWidth)
    .zIndex(1)
  }

  private func gameColumn(_ game: MobileGame, width: CGFloat) -> some View {
    VStack(spacing: 0) {
      gameHeader(game)
      yourPickCell(game)
      ForEach(otherPlayers) { player in
        savedPickCell(player.picks[game.id], game: game)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel("\(player.displayName), \(game.away.name) at \(game.home.name), saved pick: \(player.picks[game.id] ?? "not picked")")
      }
    }
    .frame(width: width)
  }

  private func gameHeader(_ game: MobileGame) -> some View {
    boardCell(height: headerHeight, background: AGPTheme.paper200) {
      VStack(spacing: 4) {
        HStack(spacing: 5) {
          teamHeader(game.away)
          Text("@")
            .font(.caption2.weight(.bold))
            .foregroundStyle(AGPTheme.inkSoft)
          teamHeader(game.home)
        }

        Text("\(game.day.uppercased()) · \(game.time)")
          .font(.caption2.weight(.semibold))
          .foregroundStyle(AGPTheme.inkSoft)
          .lineLimit(1)

        if game.isMondayTiebreaker, let total = game.odds?.overUnder {
          Text("O/U \(total.formatted(.number.precision(.fractionLength(1))))")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(AGPTheme.clay)
        } else {
          Text(" ").font(.caption2)
        }
        Text(oddsSource(game))
          .font(.caption2)
          .foregroundStyle(AGPTheme.inkSoft)
          .multilineTextAlignment(.center)
          .lineLimit(2)
      }
      .padding(.horizontal, 7)
    }
  }

  private func teamHeader(_ team: MobileTeam) -> some View {
    VStack(spacing: 2) {
      NativeTeamCrest(code: team.abbreviation, size: 30)
      Text(team.abbreviation)
        .font(.caption.weight(.bold))
        .foregroundStyle(AGPTheme.ink)
    }
    .frame(maxWidth: .infinity)
  }

  private func yourPickCell(_ game: MobileGame) -> some View {
    let selection = selections[game.id]
    return boardCell(height: userHeight, background: AGPTheme.maize.opacity(0.22)) {
      VStack(spacing: 0) {
        pickButton(game.away, game: game, selection: selection, moneyline: game.odds?.awayMoneyline)
        Rectangle().fill(AGPTheme.sage).frame(height: 1)
        pickButton(game.home, game: game, selection: selection, moneyline: game.odds?.homeMoneyline)
        if games.contains(where: \.isMondayTiebreaker) {
          Group {
            if game.isMondayTiebreaker { mondayTotal }
            else {
              Text(selection == nil ? "Choose a team above" : "Your call: \(selection!)")
                .font(.caption)
                .foregroundStyle(AGPTheme.inkSoft)
                .multilineTextAlignment(.center)
                .padding(8)
            }
          }
          .frame(height: totalHeight)
        }
      }
    }
  }

  private var mondayTotal: some View {
    VStack(spacing: 6) {
      Text("MONDAY TOTAL")
        .font(.caption.weight(.bold).width(.condensed))
      HStack(spacing: 0) {
        Button { prediction = max(0, (prediction ?? 46) - 1) } label: {
          Image(systemName: "minus").frame(minWidth: 44, minHeight: 44)
        }.accessibilityLabel("Decrease Monday total")
        TextField("—", text: Binding(get: { prediction.map(String.init) ?? "" }, set: { value in
          if value.isEmpty { prediction = nil }
          else if let total = Int(value), (0...200).contains(total) { prediction = total }
        }))
        .keyboardType(.numberPad)
        .focused($editingTotal)
        .multilineTextAlignment(.center)
        .font(.title3.bold())
        .frame(minHeight: 44)
        .background(AGPTheme.paper100)
        .accessibilityLabel("Monday combined points prediction")
        .accessibilityValue(prediction.map(String.init) ?? "Not set")
        .accessibilityIdentifier("monday-total-input")
        Button { prediction = min(200, (prediction ?? 44) + 1) } label: {
          Image(systemName: "plus").frame(minWidth: 44, minHeight: 44)
        }.accessibilityLabel("Increase Monday total")
      }
      .buttonStyle(.plain)
      .disabled(!isEnabled)
      .overlay(Rectangle().stroke(AGPTheme.sage, lineWidth: 1))
    }
    .foregroundStyle(AGPTheme.ink)
    .padding(.horizontal, 5)
    .toolbar {
      ToolbarItemGroup(placement: .keyboard) {
        Spacer()
        Button("Done") { editingTotal = false }
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
            .font(.headline.weight(.bold).width(.condensed))
          Text("ML \(self.moneyline(moneyline))")
            .font(.caption2)
        }
        Spacer(minLength: 0)
        if isSelected {
          Image(systemName: "checkmark.circle.fill")
            .font(.system(size: 17, weight: .black))
        }
      }
      .foregroundStyle(AGPTheme.field950)
      .padding(.horizontal, 8)
      .frame(maxWidth: .infinity)
      .frame(height: (pickHeight - 1) / 2)
      .background(isSelected ? AGPTheme.maize : AGPTheme.paper100.opacity(0.72))
    }
    .buttonStyle(.plain)
    .disabled(!isEnabled)
    .accessibilityLabel("Your row, \(game.away.name) at \(game.home.name). Pick \(team.name). Moneyline \(self.moneyline(moneyline)).")
    .accessibilityAddTraits(isSelected ? .isSelected : [])
  }

  private func savedPickCell(_ selection: String?, game: MobileGame) -> some View {
    let validCode: String? = if selection == game.away.abbreviation || selection == game.home.abbreviation {
      selection
    } else {
      nil
    }

    return boardCell(height: playerHeight, background: AGPTheme.paper100) {
      Group {
        if let validCode {
          HStack(spacing: 7) {
            NativeTeamCrest(code: validCode, size: 28)
            Text(validCode)
              .font(.headline.weight(.bold).width(.condensed))
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

  private func oddsSource(_ game: MobileGame) -> String {
    guard let odds = game.odds else { return "Odds unavailable" }
    guard let date = HomeWeekState.date(odds.updatedAt) else { return "\(odds.provider) · time unavailable" }
    return "\(odds.provider)\n\(date.formatted(date: .numeric, time: .shortened))"
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
        .font(.caption2.weight(.bold))
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
    case .live: AGPTheme.paper100
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
  @State private var prediction: Int?
  @State private var visibleGameId: String?
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
            feedState: .live(.now),
            prediction: $prediction,
            visibleGameId: $visibleGameId
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
