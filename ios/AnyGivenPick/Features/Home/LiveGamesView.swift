import ClerkKit
import SwiftUI

struct LiveGamesView: View {
  let weekId: String
  @Environment(AppModel.self) private var model
  @Environment(Clerk.self) private var clerk
  @Environment(LiveActivityManager.self) private var activities
  @Environment(\.scenePhase) private var scenePhase
  @State private var visible = false
  @State private var showFinals = true
  private var active: Bool {
    visible && scenePhase == .active && model.selectedTab == .home && model.navigationPaths[.home]?.last == .liveGames(weekId: weekId)
  }
  private var week: MobilePlayerWeek? {
    if model.bootstrap?.currentWeek?.id == weekId { return model.bootstrap?.currentWeek }
    return model.liveGamesWeek?.id == weekId ? model.liveGamesWeek : nil
  }
  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 20) {
        if let week {
          let state = HomeWeekState(week: week, picks: model.draftPicks, prediction: model.mondayPrediction, now: model.estimatedServerNow)
          Text(week.label.uppercased()).font(.title2.bold().width(.condensed)).accessibilityAddTraits(.isHeader)
          Text("Scores refresh automatically while you're here. Follow a game to put it on your Lock Screen.").font(.subheadline).foregroundStyle(AGPTheme.inkSoft)
          Text("\(state.liveCount) live · \(state.finalCount) final · \(state.upcomingCount) upcoming").font(.subheadline.weight(.semibold))
          HomeFeedStatus()
          if model.homeFeedError != nil { Button("Retry") { Task { await refresh() } }.frame(minHeight: 44).disabled(model.isRefreshingHome) }
          if week.games.isEmpty {
            ContentUnavailableView("No matchups yet", systemImage: "calendar", description: Text("The commissioner hasn't added games to this week."))
          } else {
            if state.liveCount == 0 { Text("No games live right now. All matchups remain below.").font(.subheadline).foregroundStyle(AGPTheme.inkSoft) }
            section("LIVE NOW", status: "in_progress", week: week)
            section("UPCOMING", status: "scheduled", week: week)
            if state.finalCount > 0 {
              DisclosureGroup("FINAL · \(state.finalCount)", isExpanded: $showFinals) {
                rows(status: "final", week: week).padding(.top, 12)
              }.font(.headline.weight(.heavy).width(.condensed))
            }
            section("POSTPONED", status: "postponed", week: week)
            section("CANCELED", status: "canceled", week: week)
          }
        } else if model.homeFeedError != nil {
          ContentUnavailableView("Week unavailable", systemImage: "wifi.exclamationmark", description: Text("This week could not be loaded. Go back to Home or try again."))
          Button("Retry") { Task { await refresh() } }.buttonStyle(HomeActionStyle()).disabled(model.isRefreshingHome)
        } else { ProgressView("Loading matchups…").frame(maxWidth: .infinity).padding(32) }
      }.padding(20)
    }.background(AGPTheme.paper100).foregroundStyle(AGPTheme.ink).tint(AGPTheme.field950)
      .navigationTitle("Live Games").navigationBarTitleDisplayMode(.inline)
      .toolbarBackground(AGPTheme.paper100, for: .navigationBar).toolbarBackground(.visible, for: .navigationBar)
      .toolbar { ToolbarItem(placement: .topBarTrailing) {
        Button { Task { await refresh() } } label: { Image(systemName: "arrow.clockwise").foregroundStyle(AGPTheme.field950).frame(minWidth: 44, minHeight: 44) }
          .accessibilityLabel("Refresh live games").disabled(model.isRefreshingHome)
      } }
      .onAppear { visible = true }.onDisappear { visible = false }
      .task(id: active) {
        guard active, !model.isPreview else { return }
        await activities.refresh()
        while !Task.isCancelled {
          await refresh()
          do { try await Task.sleep(for: .seconds(model.homeRefreshDelay)) } catch { return }
        }
      }.refreshable { await refresh() }
  }
  private func refresh() async {
    guard !model.isPreview, let token = try? await clerk.auth.getToken(), !Task.isCancelled else { return }
    await model.refreshHome(token: token, weekId: weekId)
  }
  @ViewBuilder private func section(_ title: String, status: String, week: MobilePlayerWeek) -> some View {
    if week.games.contains(where: { $0.status == status }) {
      Text(title).font(.title3.weight(.heavy).width(.condensed)).padding(.top, 8).accessibilityAddTraits(.isHeader)
      rows(status: status, week: week)
    }
  }
  private func rows(status: String, week: MobilePlayerWeek) -> some View {
    // Stable kickoff order: do not move cards under someone's finger as the score changes.
    ForEach(week.games.filter { $0.status == status }.sorted { $0.kickoffAt == $1.kickoffAt ? $0.id < $1.id : $0.kickoffAt < $1.kickoffAt }) { game in
      VStack(alignment: .leading, spacing: 0) {
        GameScoreCard(game: game, week: week,
          picks: model.bootstrap?.currentWeek?.id == week.id ? model.draftPicks : week.entry?.draftPicks ?? [:],
          prediction: model.bootstrap?.currentWeek?.id == week.id ? model.mondayPrediction : week.entry?.mondayPrediction,
          now: model.estimatedServerNow)
        if ["scheduled", "in_progress"].contains(game.status) {
          FollowGameControl(game: game, now: model.estimatedServerNow).padding(.horizontal, 14).padding(.bottom, 8)
        }
      }.background(AGPTheme.paper200).overlay(Rectangle().strokeBorder(AGPTheme.sage, lineWidth: 1))
    }
  }
}

struct GameScoreCard: View {
  let game: MobileGame
  let week: MobilePlayerWeek
  let picks: [String: String]
  let prediction: Int?
  let now: Date
  var compact = false
  private var state: HomeWeekState { .init(week: week, picks: picks, prediction: prediction, now: now) }
  private var choice: String? { state.hasOfficial ? week.entry?.officialPicks[game.id] : state.locked ? nil : picks[game.id] }
  private var outcome: String { state.hasOfficial ? game.outcome(for: choice) : "Draft · not submitted" }
  var body: some View {
    VStack(alignment: .leading, spacing: compact ? 6 : 10) {
      if game.isMondayTiebreaker {
        Label("MONDAY TIEBREAKER", systemImage: "star").font(.caption.weight(.bold))
      }
      team(game.away, score: game.awayScore)
      team(game.home, score: game.homeScore)
      Rectangle().fill(AGPTheme.sage).frame(height: 1)
      if compact && state.locked, let choice, game.isValidPick(choice) {
        ViewThatFits(in: .horizontal) {
          HStack { Text(game.statusLabel).font(.caption.weight(.semibold)); Spacer(minLength: 8); pickLabel(choice) }
          VStack(alignment: .leading, spacing: 6) { Text(game.statusLabel).font(.subheadline.weight(.semibold)); pickLabel(choice) }
        }
      } else if !compact || state.locked || game.status != "scheduled" {
        Text(game.statusLabel).font(.subheadline.weight(.semibold))
      }
      if !compact {
      if let choice, game.isValidPick(choice), !compact || state.locked {
        pickLabel(choice)
      } else if !compact || state.locked { Text(state.locked ? "No official pick" : "No pick yet · Make your call on Picks").font(.caption) }
      } else if state.locked && choice == nil { Text("No official pick").font(.caption) }
      if game.isMondayTiebreaker {
        let total = state.hasOfficial ? week.entry?.officialMondayPrediction : state.locked ? nil : prediction
        Text("\(state.hasOfficial ? "Official" : "Draft") total: \(total.map(String.init) ?? "Not set")").font(.caption)
      }
      if game.status == "scheduled" {
        if let odds = game.odds {
          Text("Moneyline · \(game.away.abbreviation) \(moneyline(odds.awayMoneyline))   \(game.home.abbreviation) \(moneyline(odds.homeMoneyline))").font(.caption.weight(.semibold))
          if game.isMondayTiebreaker, let total = odds.overUnder { Text("Over / under \(total.formatted())").font(.caption.weight(.semibold)) }
          Text("\(odds.provider) · \(HomeWeekState.date(odds.updatedAt)?.formatted(date: .abbreviated, time: .shortened) ?? "Update time unavailable")").font(.caption2).foregroundStyle(AGPTheme.inkSoft)
        } else { Text("Reference odds not available yet").font(.caption).foregroundStyle(AGPTheme.inkSoft) }
      }
      if game.status == "in_progress" && !compact {
        Text(game.scoreCheckedAt.flatMap(HomeWeekState.date).map { "Score checked " + $0.formatted(date: .omitted, time: .shortened) } ?? "Score timestamp unavailable · Updates may be delayed")
          .font(.caption2).foregroundStyle(AGPTheme.inkSoft)
      }
    }.padding(compact ? 12 : 14).frame(maxWidth: .infinity, alignment: .leading)
      .background(AGPTheme.paper200).foregroundStyle(AGPTheme.ink)
      .accessibilityElement(children: .combine)
  }
  private func pickLabel(_ choice: String) -> some View {
    Text("\(state.hasOfficial ? "Your pick" : "Your draft"): \(choice) · \(outcome)")
      .font(.caption.weight(.semibold)).foregroundStyle(outcome == "Lost" ? AGPTheme.clay : AGPTheme.ink)
  }
  private func team(_ team: MobileTeam, score: Int?) -> some View {
    HStack(alignment: .center, spacing: 10) {
      NativeTeamCrest(code: team.abbreviation, size: 30)
      ViewThatFits(in: .horizontal) {
        HStack(spacing: 8) { Text(team.abbreviation).font(.headline.weight(.heavy).width(.condensed)); Text(team.name).font(.caption).foregroundStyle(AGPTheme.inkSoft) }
        VStack(alignment: .leading, spacing: 2) { Text(team.abbreviation).font(.headline.weight(.heavy).width(.condensed)); Text(team.name).font(.caption).foregroundStyle(AGPTheme.inkSoft) }
      }.frame(maxWidth: .infinity, alignment: .leading)
      if choice == team.abbreviation { Image(systemName: "checkmark").font(.caption.bold()).accessibilityLabel("Selected team") }
      Text(["scheduled", "postponed", "canceled"].contains(game.status) ? "—" : score.map(String.init) ?? "—")
        .font(.title2.bold().width(.condensed)).monospacedDigit().fixedSize()
    }.padding(.vertical, compact ? 2 : 4)
  }
  private func moneyline(_ value: Int?) -> String { value.map { $0 > 0 ? "+\($0)" : String($0) } ?? "—" }
}

private struct FollowGameControl: View {
  let game: MobileGame
  let now: Date
  @Environment(LiveActivityManager.self) private var activities
  @Environment(AppModel.self) private var model
  @State private var message: String?
  private var available: Bool {
    guard let date = game.kickoffDate else { return false }
    return date.timeIntervalSince(now) <= 7 * 3600 && date.timeIntervalSince(now) > -8 * 3600
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      if let session = activities.sessions.first(where: { $0.gameId == game.id && $0.isRunning }) {
        Button("Stop following") { Task { if !model.isPreview { await activities.stop(sessionId: session.sessionId); message = activities.statusMessage } } }
          .frame(minHeight: 44).disabled(activities.busy)
      } else if !activities.preferences.enabled || !activities.authorized {
        NavigationLink("Set up Live Activities", value: AppRoute.liveActivities).frame(minHeight: 44)
      } else if !available {
        Text("Follow becomes available within 7 hours of kickoff.").font(.caption).padding(.vertical, 10)
      } else if activities.sessions.filter({ $0.kind == "game" && $0.isRunning }).count >= 2 {
        NavigationLink("Manage your 2 followed games", value: AppRoute.followGames).frame(minHeight: 44)
      } else {
        Button { Task { if !model.isPreview { await activities.follow(gameId: game.id); message = activities.statusMessage } } } label: {
          Label("Follow on Lock Screen", systemImage: "platter.filled.bottom.iphone").font(.subheadline.weight(.semibold)).frame(minHeight: 44)
        }.disabled(activities.busy).accessibilityLabel("Follow \(game.away.name) at \(game.home.name) on Lock Screen")
      }
      if activities.busy { ProgressView("Updating Live Activity…").font(.caption) }
      if let message { Text(message).font(.caption).accessibilityAddTraits(.updatesFrequently) }
    }.foregroundStyle(AGPTheme.ink)
  }
}
