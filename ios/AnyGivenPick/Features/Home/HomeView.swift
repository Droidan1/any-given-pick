import ClerkKit
import SwiftUI

struct HomeView: View {
  @Environment(AppModel.self) private var model
  @Environment(Clerk.self) private var clerk
  @Environment(\.scenePhase) private var scenePhase
  @State private var visible = false
  @State private var confirmWeekSwitch = false
  @ScaledMetric(relativeTo: .largeTitle) private var headlineSize = 34
  private var refreshing: Bool {
    visible && scenePhase == .active && model.selectedTab == .home && (model.navigationPaths[.home] ?? []).isEmpty
  }
  var body: some View {
    ScrollView {
      TimelineView(.animation(minimumInterval: 1, paused: !refreshing)) { _ in
        VStack(spacing: 0) {
          if let account = model.bootstrap {
            let state = account.currentWeek.map { HomeWeekState(week: $0, picks: model.draftPicks, prediction: model.mondayPrediction, now: model.estimatedServerNow) }
            header(account, state: state)
            VStack(alignment: .leading, spacing: 18) {
              if !account.user.account.canParticipate { accountNotice(account.user.account) }
              if let state {
                card(state, canParticipate: account.user.account.canParticipate)
                Rectangle().fill(AGPTheme.sage).frame(height: 1)
                games(state)
                race(state)
              } else {
                Text("The board is clear").font(.title2.bold())
                Text("Your next call sheet will appear here when the commissioner publishes it.")
              }
              NavigationLink(value: AppRoute.notifications) {
                Label("Deadline and results reminders", systemImage: "bell").font(.subheadline.weight(.semibold)).frame(minHeight: 44)
              }
            }.padding(20)
          } else { ProgressView("Loading your week…").padding(32) }
        }
      }
    }
    .background(AGPTheme.paper100).foregroundStyle(AGPTheme.ink).tint(AGPTheme.field950)
    .toolbar(.hidden, for: .navigationBar)
    .onAppear { visible = true }.onDisappear { visible = false }
    .task(id: refreshing) {
      guard refreshing, !model.isPreview else { return }
      while !Task.isCancelled {
        await refresh()
        do { try await Task.sleep(for: .seconds(model.homeRefreshDelay)) } catch { return }
      }
    }.refreshable { await refresh() }
    .confirmationDialog("Switch weeks?", isPresented: $confirmWeekSwitch, titleVisibility: .visible) {
      Button("Discard unsaved changes and switch", role: .destructive) { model.switchToPendingHomeWeek(); Task { await refresh() } }
      Button("Keep reviewing my card", role: .cancel) {}
    } message: {
      Text("Your official submitted card stays safe. Only unsaved changes on this device will be discarded.")
    }
  }
  private func refresh() async {
    guard !model.isPreview, let token = try? await clerk.auth.getToken(), !Task.isCancelled else { return }
    await model.refreshHome(token: token)
  }
  private func header(_ account: MobileBootstrap, state: HomeWeekState?) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      ViewThatFits(in: .horizontal) {
        HStack { brand; Spacer(minLength: 16); greeting(account) }
        VStack(alignment: .leading, spacing: 12) { brand; greeting(account) }
      }.padding(.bottom, 4)
      if let week = state?.week {
        Text("\(String(week.season)) · \(week.seasonPhase == "preseason" ? "Preseason" : "Regular season") · \(week.label)")
          .font(.caption.weight(.bold)).textCase(.uppercase).foregroundStyle(AGPTheme.maize)
      }
      Text(state?.locked == true ? "EVERY CALL COUNTS." : state?.hasOfficial == true ? "YOUR CARD IS IN." : "MAKE EVERY CALL.")
        .font(AGPTheme.display(headlineSize)).fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.isHeader)
      Text(headerMessage(state)).font(.subheadline).foregroundStyle(AGPTheme.paper200).fixedSize(horizontal: false, vertical: true)
    }.frame(maxWidth: .infinity, alignment: .leading).padding(20).padding(.vertical, 4)
      .foregroundStyle(AGPTheme.paper100).background(AGPTheme.field950)
  }
  private var brand: some View {
    HStack(spacing: 8) {
      Image("HomeBrandMark").resizable().scaledToFit().frame(width: 34, height: 34).accessibilityHidden(true)
      Text("ANY GIVEN PICK").font(.subheadline.weight(.heavy).width(.condensed))
    }
  }
  private func greeting(_ account: MobileBootstrap) -> some View {
    Text("Hey, \(account.user.displayName ?? "player")").font(.caption).fixedSize(horizontal: false, vertical: true)
  }
  private func headerMessage(_ state: HomeWeekState?) -> String {
    guard let state else { return "Your week starts here." }
    if state.week.games.isEmpty { return "The slate is being prepared. Matchups will appear here when they're ready." }
    if state.locked { return state.hasOfficial ? "Your official card is locked. Follow the games." : "Entries are closed. You can still follow every game." }
    if state.hasUnsubmittedChanges { return "Your official card is safe. Review and submit your latest changes before lock." }
    if state.hasOfficial { return "You're set for the week. Changes are open until lock." }
    return state.missingCount > 0 ? "Make every pick. Then make it official." : "Your calls are ready. Review and submit before lock."
  }
  private func accountNotice(_ account: MobileAccountSummary) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Label("Account needs attention", systemImage: "person.badge.clock").font(.headline)
      Text(account.reasonLabel).font(.subheadline)
      Button("Review your profile") { model.selectedTab = .profile }.frame(minHeight: 44).underline()
    }.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(AGPTheme.paper200)
  }
  @ViewBuilder private func card(_ state: HomeWeekState, canParticipate: Bool) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      if !state.locked {
        ViewThatFits(in: .horizontal) {
          HStack(spacing: 8) { countdown(state); Spacer(minLength: 0); deadline(state) }
          VStack(alignment: .leading, spacing: 6) { countdown(state); deadline(state) }
        }
      }
      if state.locked && state.hasOfficial {
        Button {
          model.notificationResultsWeekId = state.week.id; model.navigationPaths[.results] = []; model.selectedTab = .results
        } label: {
          ViewThatFits(in: .horizontal) {
            HStack { sectionTitle("YOUR OFFICIAL CARD"); Spacer(); badge(state); Image(systemName: "chevron.right").font(.caption) }
            VStack(alignment: .leading, spacing: 8) { sectionTitle("YOUR OFFICIAL CARD"); HStack { badge(state); Image(systemName: "chevron.right").font(.caption) } }
          }.frame(minHeight: 44)
        }.buttonStyle(.plain).accessibilityLabel("Your official card. Locked. View your results.")
      } else {
        ViewThatFits(in: .horizontal) {
          HStack { sectionTitle(state.locked ? "YOUR OFFICIAL CARD" : "YOUR PICK CARD"); Spacer(); badge(state) }
          VStack(alignment: .leading, spacing: 8) { sectionTitle(state.locked ? "YOUR OFFICIAL CARD" : "YOUR PICK CARD"); badge(state) }
        }
      }
      if state.locked {
        if state.hasOfficial {
          ViewThatFits(in: .horizontal) {
            HStack(spacing: 24) { resultCounts(state) }
            VStack(alignment: .leading, spacing: 12) { resultCounts(state) }
          }
          if state.tied > 0 || state.canceled > 0 { Text("\(state.tied) tied · \(state.canceled) canceled / not graded").font(.caption) }
        } else {
          Text(state.week.entry?.status == "disqualified" ? "This card was disqualified. Contact the commissioner for details." : "No official card was submitted for this week. A draft does not count as an entry.").font(.subheadline)
        }
      } else if state.week.games.isEmpty {
        Text("This week's matchups aren't ready yet. Check back after the commissioner updates the slate.").font(.subheadline)
      } else {
        Text("\(state.selectedCount) / \(state.week.games.count) picks made").font(.title2.bold().width(.condensed))
        if state.hasOfficial {
          Text("Version \(state.week.entry?.currentVersionNumber ?? 0) submitted\(state.week.entry?.submittedAt.flatMap(HomeWeekState.date).map { " · " + $0.formatted(date: .abbreviated, time: .shortened) } ?? "")").font(.subheadline.weight(.semibold))
          if let total = state.week.entry?.officialMondayPrediction { Text("Official tiebreaker: \(total) points").font(.subheadline) }
          if state.hasUnsubmittedChanges { Label("Changes are not submitted yet", systemImage: "exclamationmark.circle").font(.subheadline).foregroundStyle(AGPTheme.clay) }
        }
        if state.missingCount > 0 { Label("\(state.missingCount) games still need your call", systemImage: "circle").font(.subheadline) }
        if state.needsPrediction { Label("Monday tiebreaker not set", systemImage: "circle").font(.subheadline) }
        if canParticipate {
          Button { model.navigationPaths[.picks] = []; model.selectedTab = .picks } label: {
            HomeActionLabel(title: state.hasOfficial ? "REVIEW YOUR CARD" : state.missingCount > 0 || state.needsPrediction ? "COMPLETE YOUR CARD" : "REVIEW & SUBMIT YOUR CARD")
          }.buttonStyle(HomeActionStyle(primary: !state.hasOfficial))
        }
        Label(model.hasUnsavedDraft ? "Unsaved changes on this device" : state.hasOfficial ? "Your official card is saved" : model.draftRevision > 0 ? "Draft saved · Not submitted" : "Not submitted", systemImage: model.hasUnsavedDraft ? "exclamationmark.circle" : "checkmark.circle")
          .font(.caption).foregroundStyle(AGPTheme.inkSoft)
      }
    }
  }
  private func countdown(_ state: HomeWeekState) -> some View {
    Label(state.countdown, systemImage: "clock").font(.caption.weight(.semibold)).foregroundStyle(AGPTheme.clay)
  }
  private func deadline(_ state: HomeWeekState) -> some View {
    Text(HomeWeekState.date(state.week.entryDeadline)?.formatted(.dateTime.weekday(.abbreviated).hour().minute().timeZone(.specificName(.short))) ?? state.week.deadlineLabel)
      .font(.caption).foregroundStyle(AGPTheme.inkSoft).accessibilityLabel("Entry deadline: \(state.week.deadlineLabel)")
  }
  private func badge(_ state: HomeWeekState) -> some View {
    Text(state.locked ? "Locked" : state.hasOfficial ? "Official" : "Draft").font(.caption.weight(.semibold)).padding(.horizontal, 9).padding(.vertical, 5)
      .foregroundStyle(state.hasOfficial ? AGPTheme.paper100 : AGPTheme.ink).background(state.hasOfficial ? AGPTheme.field950 : AGPTheme.paper200)
  }
  @ViewBuilder private func resultCounts(_ state: HomeWeekState) -> some View {
    count(state.correct, label: "Correct"); count(state.incorrect, label: "Incorrect"); count(state.remaining, label: "Remaining")
  }
  private func count(_ value: Int, label: String) -> some View {
    VStack(alignment: .leading, spacing: 2) { Text(value.formatted()).font(.title.bold().width(.condensed)); Text(label).font(.caption) }
      .frame(maxWidth: .infinity, alignment: .leading).accessibilityElement(children: .combine)
  }
  private func sectionTitle(_ title: String) -> some View { Text(title).font(.title3.weight(.heavy).width(.condensed)).accessibilityAddTraits(.isHeader) }
  private func games(_ state: HomeWeekState) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      if !state.locked && state.liveCount == 0, let kickoff = state.featured?.kickoffDate {
        ViewThatFits(in: .horizontal) {
          HStack { sectionTitle("NEXT KICKOFF"); Spacer(minLength: 8); Text(kickoff.formatted(.dateTime.weekday(.abbreviated).hour().minute())).font(.caption) }
          VStack(alignment: .leading, spacing: 6) { sectionTitle("NEXT KICKOFF"); Text(kickoff.formatted(date: .abbreviated, time: .shortened)).font(.caption) }
        }
      } else { sectionTitle("GAMES RIGHT NOW") }
      if state.locked || state.liveCount > 0 { Text("\(state.liveCount) live · \(state.finalCount) final · \(state.upcomingCount) upcoming").font(.caption) }
      if let game = state.featured {
        NavigationLink(value: AppRoute.liveGames(weekId: state.week.id)) {
          GameScoreCard(game: game, week: state.week, picks: model.draftPicks, prediction: model.mondayPrediction, now: model.estimatedServerNow, compact: true)
        }.buttonStyle(.plain).accessibilityHint("Opens all games for \(state.week.label)")
        NavigationLink(value: AppRoute.liveGames(weekId: state.week.id)) {
          HomeActionLabel(title: "VIEW ALL \(state.week.games.count) GAMES")
        }.buttonStyle(HomeActionStyle(primary: state.locked))
      } else { Text("No matchups have been added yet.").font(.subheadline) }
      HomeFeedStatus()
      if model.pendingHomeWeek != nil {
        Button("Switch to the published week") { confirmWeekSwitch = true }.frame(minHeight: 44)
      } else if model.homeFeedError != nil {
        Button("Retry") { Task { await refresh() } }.frame(minHeight: 44).disabled(model.isRefreshingHome)
      }
    }
  }
  private func race(_ state: HomeWeekState) -> some View {
    Button { model.liveRaceWeekId = state.week.id; model.navigationPaths[.home, default: []].append(.liveRace) } label: {
      HStack(spacing: 12) {
        Image(systemName: "flag.checkered").foregroundStyle(AGPTheme.maize)
        VStack(alignment: .leading, spacing: 4) {
          Text("LIVE RACE").font(.headline.weight(.heavy).width(.condensed))
          Text(raceSummary(state)).font(.caption)
        }
        Spacer(minLength: 0); Image(systemName: "chevron.right").accessibilityHidden(true)
      }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
    }.buttonStyle(.plain).foregroundStyle(AGPTheme.paper100).background(AGPTheme.field950)
  }
  private func raceSummary(_ state: HomeWeekState) -> String {
    guard state.locked else { return "Race positions appear after lock" }
    guard let race = model.homeRace, race.week?.id == state.week.id,
      let player = race.players.first(where: \.isCurrentUser) else { return "Follow the projected weekly leaderboard" }
    let behind = max(0, (race.players.map(\.projectedCorrect).max() ?? player.projectedCorrect) - player.projectedCorrect)
    let tiedLeaders = race.players.filter { $0.projectedCorrect == player.projectedCorrect }.count > 1
    let standing = behind > 0 ? "\(behind) behind the leader" : tiedLeaders ? "Tied for the lead on calls" : "Leading on calls"
    return "Projected #\(player.rank) · \(standing)"
  }
}

struct HomeActionLabel: View {
  let title: String
  var body: some View {
    HStack(spacing: 12) {
      Text(title).font(.headline.weight(.heavy).width(.condensed)).fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: 0); Image(systemName: "arrow.right").accessibilityHidden(true)
    }.frame(maxWidth: .infinity, alignment: .leading)
  }
}
struct HomeActionStyle: ButtonStyle {
  var primary = true
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.padding(16).frame(minHeight: 52).foregroundStyle(AGPTheme.field950)
      .background(primary ? AGPTheme.maize : AGPTheme.paper100)
      .overlay(Rectangle().strokeBorder(primary ? AGPTheme.maize : AGPTheme.ink, lineWidth: 1)).opacity(configuration.isPressed ? 0.75 : 1)
  }
}
struct HomeFeedStatus: View {
  @Environment(AppModel.self) private var model
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      if let message = model.homeFeedError { Label(message, systemImage: "wifi.exclamationmark").font(.caption).foregroundStyle(AGPTheme.clay) }
      else if model.isRefreshingHome { Label("Checking for score updates…", systemImage: "arrow.clockwise").font(.caption) }
      else if let updated = model.homeRefreshedAt { Text("Checked \(updated.formatted(date: .omitted, time: .shortened)) · Scores can be delayed.").font(.caption) }
      else { Text("Last available scores · Pull down to refresh.").font(.caption) }
    }.foregroundStyle(AGPTheme.inkSoft).fixedSize(horizontal: false, vertical: true)
  }
}

#if DEBUG
struct HomeDebugHost: View {
  @State private var model = AppModel()
  private var mode: String { ProcessInfo.processInfo.environment["HOME_PREVIEW_STATE"] ?? "draft" }
  var body: some View {
    AppShellView().environment(model).environment(Clerk.preview()).environment(LiveActivityManager.preview())
      .environment(\.dynamicTypeSize, ProcessInfo.processInfo.arguments.contains("-preview-large-text") ? .accessibility3 : .large)
      .task {
        model.loadHomePreview(mode)
        if ProcessInfo.processInfo.arguments.contains("-preview-home-games") { model.navigationPaths[.home] = [.liveGames(weekId: "preview-week")] }
      }
  }
}
#Preview("Unfinished card") { HomeDebugHost() }
#endif
