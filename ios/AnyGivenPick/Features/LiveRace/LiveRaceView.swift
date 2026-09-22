import ClerkKit
import SwiftUI

struct LiveRaceView: View {
  @Environment(Clerk.self) private var clerk
  @Environment(AppModel.self) private var appModel

  var body: some View {
    ZStack {
      CallSheetBackground()

      ScrollView {
        LazyVStack(spacing: 0) {
          BrandHeader(
            eyebrow: raceWeekLabel,
            title: "Live week race",
            message: "Track the projected leader, every swing call, and the path to the top as scores change."
          )

          raceContent
        }
      }
      .refreshable {
        await refresh()
      }
    }
    .navigationTitle("Live Race")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar(.visible, for: .navigationBar)
    .toolbarBackground(AGPTheme.field950, for: .navigationBar)
    .toolbarBackground(.visible, for: .navigationBar)
    .toolbarColorScheme(.dark, for: .navigationBar)
    .tint(AGPTheme.maize)
    .task {
      await refreshLoop()
    }
  }

  @ViewBuilder
  private var raceContent: some View {
    switch appModel.liveRaceState {
    case .idle, .loading:
      LoadingCallSheet(label: "Loading the live field")
    case .failed(let message):
      RetryCallSheet(
        symbol: "flag.checkered",
        label: "Live race unavailable",
        message: message,
        retry: refresh
      )
    case .loaded(let race):
      switch race.status {
      case "sealed":
        FeatureStatusPanel(
          symbol: "lock.shield",
          label: race.week?.label ?? "Current week",
          title: "The field stays sealed",
          message: "The live race opens after the entry deadline so every official card stays private while picks are being made."
        )
      case "ready" where !race.players.isEmpty:
        raceBoard(race)
      case "ready":
        FeatureStatusPanel(
          symbol: "person.3.sequence",
          label: race.week?.label ?? "Current week",
          title: "No official cards",
          message: "The field will appear when at least one approved player has an official card on the board."
        )
      default:
        FeatureStatusPanel(
          symbol: "calendar.badge.clock",
          label: "Between weeks",
          title: "The field is waiting",
          message: "A published call sheet will start the next live race."
        )
      }
    }
  }

  private func raceBoard(_ race: MobileLiveRace) -> some View {
    VStack(spacing: 0) {
      RaceStatusStrip(race: race)

      if !race.gamesToFeature.isEmpty {
        VStack(alignment: .leading, spacing: 0) {
          HStack {
            Text("ON THE FIELD")
              .font(AGPTheme.display(27))
            Spacer()
            Label("Auto refresh", systemImage: "arrow.clockwise")
              .font(AGPTheme.label(10))
              .foregroundStyle(AGPTheme.inkSoft)
          }
          .padding(20)
          .overlay(alignment: .bottom) { rule }

          ForEach(race.gamesToFeature) { game in
            LiveRaceGameRow(game: game)
          }
        }
      }

      VStack(alignment: .leading, spacing: 0) {
        HStack(alignment: .firstTextBaseline) {
          VStack(alignment: .leading, spacing: 4) {
            Text("PROJECTED ORDER")
              .font(AGPTheme.display(29))
            Text("Updates as live scores move")
              .font(.caption)
              .foregroundStyle(AGPTheme.inkSoft)
          }
          Spacer()
          Text("\(race.players.count) PLAYERS")
            .font(AGPTheme.label(10))
        }
        .padding(20)
        .overlay(alignment: .bottom) { rule }

        ForEach(race.players) { player in
          LiveRacePlayerRow(player: player)
        }
      }
    }
  }

  private var raceWeekLabel: String {
    if case .loaded(let race) = appModel.liveRaceState {
      return race.week?.label ?? "Live race"
    }
    return appModel.bootstrap?.currentWeek?.label ?? "Live race"
  }

  private var rule: some View {
    Rectangle().fill(AGPTheme.sage).frame(height: 1)
  }

  private func refreshLoop() async {
    if case .idle = appModel.liveRaceState {
      await refresh()
    }

    while !Task.isCancelled {
      do {
        try await Task.sleep(for: .seconds(30))
      } catch {
        return
      }
      guard !Task.isCancelled else { return }
      await refresh()
    }
  }

  private func refresh() async {
    do {
      guard let token = try await clerk.auth.getToken() else { return }
      await appModel.refreshLiveRace(token: token)
    } catch {
      return
    }
  }
}

private struct RaceStatusStrip: View {
  let race: MobileLiveRace

  var body: some View {
    HStack(spacing: 0) {
      metric(value: race.liveCount, label: "LIVE", emphasized: race.liveCount > 0)
      metric(value: race.finalCount, label: "FINAL", emphasized: false)
      metric(value: race.waitingCount, label: "WAITING", emphasized: false)
    }
    .background(AGPTheme.field950)
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(race.liveCount) live, \(race.finalCount) final, \(race.waitingCount) waiting")
  }

  private func metric(value: Int, label: String, emphasized: Bool) -> some View {
    VStack(spacing: 3) {
      HStack(spacing: 5) {
        if emphasized {
          Circle()
            .fill(AGPTheme.clay)
            .frame(width: 7, height: 7)
        }
        Text("\(value)")
          .font(AGPTheme.display(29))
      }
      Text(label)
        .font(AGPTheme.label(10))
        .foregroundStyle(AGPTheme.paper200)
    }
    .foregroundStyle(emphasized ? AGPTheme.maize : AGPTheme.paper100)
    .frame(maxWidth: .infinity, minHeight: 78)
    .overlay(alignment: .trailing) {
      Rectangle().fill(AGPTheme.field800).frame(width: 1)
    }
  }
}

private struct LiveRaceGameRow: View {
  let game: MobileLiveRaceGame

  var body: some View {
    VStack(spacing: 11) {
      HStack {
        Label(game.displayStatus.uppercased(), systemImage: game.status == "in_progress" ? "dot.radiowaves.left.and.right" : "clock")
          .font(AGPTheme.label(10))
          .foregroundStyle(game.status == "in_progress" ? AGPTheme.clay : AGPTheme.inkSoft)
        Spacer()
        if game.isMondayTiebreaker {
          Text("MONDAY TIEBREAKER")
            .font(AGPTheme.label(9))
            .foregroundStyle(AGPTheme.clay)
        }
      }

      HStack(spacing: 12) {
        team(code: game.awayTeamCode, score: game.awayScore)
        Text("@")
          .font(AGPTheme.label(13))
          .foregroundStyle(AGPTheme.inkSoft)
        team(code: game.homeTeamCode, score: game.homeScore)
      }
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 14)
    .overlay(alignment: .bottom) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(accessibilityScore)
  }

  private func team(code: String, score: Int?) -> some View {
    HStack(spacing: 8) {
      NativeTeamCrest(code: code, size: 32)
      Text(code)
        .font(AGPTheme.display(23))
      Spacer(minLength: 4)
      Text(score.map(String.init) ?? "–")
        .font(AGPTheme.display(26))
    }
    .frame(maxWidth: .infinity)
  }

  private var accessibilityScore: String {
    if let awayScore = game.awayScore, let homeScore = game.homeScore {
      return "\(game.displayStatus). \(game.awayTeamName) \(awayScore), \(game.homeTeamName) \(homeScore)"
    }
    return "\(game.displayStatus). \(game.awayTeamName) at \(game.homeTeamName)"
  }
}

private struct LiveRacePlayerRow: View {
  let player: MobileLiveRacePlayer

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 12) {
        VStack(spacing: 1) {
          Text("\(player.rank)")
            .font(AGPTheme.display(28))
          movementLabel
        }
        .foregroundStyle(player.isCurrentUser ? AGPTheme.field950 : AGPTheme.paper100)
        .frame(width: 48, height: 54)
        .background(player.isCurrentUser ? AGPTheme.maize : AGPTheme.field950)

        LiveRaceAvatar(photoURL: player.profilePhotoUrl, displayName: player.displayName)

        VStack(alignment: .leading, spacing: 3) {
          Text(player.displayName)
            .font(AGPTheme.label(17))
            .lineLimit(1)
          Text(player.isCurrentUser ? "YOU · \(player.pathLabel.uppercased())" : player.pathLabel.uppercased())
            .font(AGPTheme.label(9))
            .foregroundStyle(player.isCurrentUser ? AGPTheme.clay : AGPTheme.inkSoft)
            .lineLimit(2)
        }

        Spacer(minLength: 4)

        VStack(alignment: .trailing, spacing: 1) {
          Text("\(player.projectedCorrect)")
            .font(AGPTheme.display(30))
          Text("PROJECTED")
            .font(AGPTheme.label(8))
            .foregroundStyle(AGPTheme.inkSoft)
        }
      }

      HStack(spacing: 14) {
        stat("\(player.correct)", "RIGHT")
        stat("\(player.live)", "LIVE")
        stat("\(player.maxCorrect)", "MAX")
        Spacer(minLength: 0)
      }

      Text(player.pathCopy)
        .font(.caption)
        .foregroundStyle(AGPTheme.inkSoft)
        .fixedSize(horizontal: false, vertical: true)
    }
    .foregroundStyle(AGPTheme.ink)
    .padding(16)
    .background(player.isCurrentUser ? AGPTheme.maize.opacity(0.26) : Color.clear)
    .overlay(alignment: .bottom) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Rank \(player.rank), \(player.displayName), \(player.projectedCorrect) projected correct, \(player.correct) currently correct. \(player.pathCopy)")
  }

  @ViewBuilder
  private var movementLabel: some View {
    if player.rankChange == 0 {
      Text("—")
        .font(AGPTheme.label(9))
    } else {
      Label(
        "\(abs(player.rankChange))",
        systemImage: player.rankChange > 0 ? "arrow.up" : "arrow.down"
      )
      .font(AGPTheme.label(8))
    }
  }

  private func stat(_ value: String, _ label: String) -> some View {
    VStack(alignment: .leading, spacing: 1) {
      Text(value)
        .font(AGPTheme.display(20))
      Text(label)
        .font(AGPTheme.label(8))
        .foregroundStyle(AGPTheme.inkSoft)
    }
  }
}

private struct LiveRaceAvatar: View {
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
    .frame(width: 40, height: 40)
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
    LiveRaceView()
  }
  .environment(AppModel(apiClient: .preview))
  .environment(Clerk.preview())
}

#if DEBUG
struct LiveRaceDebugHost: View {
  @Environment(AppModel.self) private var appModel

  var body: some View {
    NavigationStack {
      LiveRaceView()
    }
    .task {
      appModel.loadLiveRacePreview()
    }
  }
}
#endif
