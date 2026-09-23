import ClerkKit
import SwiftUI

// Operate: the approved cream/green scoreboard with an editable yellow YOU row.
// Monday prediction belongs to its game. Safe-area actions lead to a value-snapshot
// review and a server receipt. A shared save is never described as official.
struct PicksView: View {
  @Environment(Clerk.self) private var clerk
  @Environment(AppModel.self) private var appModel
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.dynamicTypeSize) private var typeSize
  @State private var visibleGameId: String?
  @State private var review: EntryReviewSnapshot?

  var body: some View {
    ZStack {
      CallSheetBackground()
      TimelineView(.animation(minimumInterval: 1, paused: scenePhase != .active || appModel.selectedTab != .picks)) { _ in
        ScrollViewReader { scroll in
          ScrollView {
            VStack(spacing: 0) {
              if let user = appModel.bootstrap?.user, let week = appModel.bootstrap?.currentWeek {
                header(week)
                if !user.account.canParticipate {
                  FeatureStatusPanel(symbol: "person.badge.clock", label: "Read-only access",
                    title: "Commissioner review", message: user.account.reasonLabel)
                } else if week.games.isEmpty {
                  Text("No games are on this card yet. The commissioner needs to finish the slate.").padding(20)
                } else { weekContent(week, user: user).id("board") }
              } else {
                FeatureStatusPanel(symbol: "calendar.badge.clock", label: "No open week",
                  title: "The board is clear", message: "The next call sheet will appear after it is published.")
              }
            }
          }
          .scrollDismissesKeyboard(.interactively)
          .refreshable { await refreshBoard(refreshWeek: true) }
          .safeAreaInset(edge: .bottom, spacing: 0) {
            if let week = appModel.bootstrap?.currentWeek, appModel.bootstrap?.user.account.canParticipate == true,
              !week.games.isEmpty {
              completionBar(week) { gameId in
                let jump = { visibleGameId = gameId; scroll.scrollTo("board", anchor: .top) }
                if reduceMotion { jump() } else { withAnimation(.easeOut(duration: 0.2), jump) }
              }
            }
          }
        }
        .task(id: refreshKey) { await keepBoardFresh() }
      }
    }
    .foregroundStyle(AGPTheme.ink)
    .toolbar(.hidden, for: .navigationBar)
    .sheet(item: $review) { snapshot in
      EntryReviewSheet(snapshot: snapshot) { await submit(snapshot) }
    }
  }

  private func header(_ week: MobilePlayerWeek) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 16) {
        RouteMark().frame(width: 42, height: 42).accessibilityHidden(true)
        Text(appModel.isLocked(week) ? "\(week.label.uppercased()) · LOCKED" : "\(week.label.uppercased()) PICKS")
          .font(.title2.weight(.bold).width(.condensed))
      }
      Text(appModel.isLocked(week) ? "The deadline passed. Only your official card counts."
        : "Locks \(week.deadlineLabel). All games lock together.")
        .font(.subheadline).foregroundStyle(AGPTheme.inkSoft)
      if !appModel.isLocked(week) {
        Text("Pick in your yellow row. Saving shares your picks with players; submitting makes them official.")
          .font(.caption).foregroundStyle(AGPTheme.inkSoft)
      }
      if typeSize.isAccessibilitySize { Text(appModel.draftStatus).font(.subheadline.bold()) }
    }
    .frame(maxWidth: .infinity, alignment: .leading).padding(16)
  }

  private func weekContent(_ week: MobilePlayerWeek, user: MobileUser) -> some View {
    @Bindable var model = appModel
    let locked = appModel.isLocked(week)
    return VStack(spacing: 0) {
      if let entry = week.entry, entry.currentVersionNumber > 0 {
        VStack(alignment: .leading, spacing: 6) {
          Label("Official card · version \(entry.currentVersionNumber)", systemImage: "checkmark.seal.fill")
            .font(.subheadline.bold())
          if let date = entry.submittedAt.flatMap(HomeWeekState.date) {
            Text("Received \(date.formatted(date: .abbreviated, time: .shortened)) · \(entry.officialPicks.count) picks · total \(entry.officialMondayPrediction.map(String.init) ?? "—")").font(.caption)
          }
          if !locked && (appModel.draftPicks != entry.officialPicks || appModel.mondayPrediction != entry.officialMondayPrediction) {
            Text("New changes are not official until you submit again.").font(.caption.bold())
          }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(16).background(AGPTheme.paper200)
      } else if locked {
        Text("No official card was submitted for this week. Saved drafts do not count.").font(.subheadline).padding(16)
      }
      if appModel.draftConflict != nil && !locked { conflictPanel }
      if let message = appModel.entryActionMessage {
        Text(message).font(.subheadline).frame(maxWidth: .infinity, alignment: .leading)
          .padding(16).accessibilityIdentifier("entry-message")
      }
      ScoreboardEntryMatrix(games: week.games, players: week.livePlayerPicks,
        currentUserId: user.id, currentDisplayName: user.displayName ?? "Your picks",
        selections: locked ? week.entry?.officialPicks ?? [:] : appModel.draftPicks,
        isEnabled: !locked && !appModel.isSavingEntry,
        feedState: appModel.livePicksFeedState, isLocked: locked,
        prediction: locked ? .constant(week.entry?.officialMondayPrediction) : $model.mondayPrediction,
        visibleGameId: $visibleGameId) { gameId, code in appModel.select(teamCode: code, for: gameId) }
    }
  }

  private var conflictPanel: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("A different card was saved on another device.").font(.headline)
      if let server = appModel.draftConflict {
        Text("This iPhone: \(appModel.draftPicks.count) picks, total \(appModel.mondayPrediction.map(String.init) ?? "not set"). Board: \(server.picks.count) picks, total \(server.mondayPrediction.map(String.init) ?? "not set").").font(.subheadline)
        if let week = appModel.bootstrap?.currentWeek {
          ForEach(week.games.filter { appModel.draftPicks[$0.id] != server.picks[$0.id] }) { game in
            Text("\(game.away.abbreviation) @ \(game.home.abbreviation): yours \(appModel.draftPicks[game.id] ?? "—") · board \(server.picks[game.id] ?? "—")").font(.caption)
          }
        }
      }
      Button("Keep my changes on this iPhone") { appModel.resolveDraftConflict(keepMine: true) }.frame(minHeight: 44)
      Button("Use the saved board version") { appModel.resolveDraftConflict(keepMine: false) }.frame(minHeight: 44)
    }.tint(AGPTheme.ink).padding(16).background(AGPTheme.paper200)
  }

  private func completionBar(_ week: MobilePlayerWeek, jump: @escaping (String) -> Void) -> some View {
    let missing = week.games.filter { game in
      appModel.draftPicks[game.id] != game.away.abbreviation && appModel.draftPicks[game.id] != game.home.abbreviation
    }
    let locked = appModel.isLocked(week)
    let monday = week.games.first(where: \.isMondayTiebreaker)
    let needsTotal = appModel.mondayPrediction == nil
    return VStack(spacing: 8) {
      if locked {
        Button {
          appModel.liveRaceWeekId = week.id
          appModel.navigationPaths[.picks, default: []].append(.liveRace)
        } label: { Label("Follow this week's live race", systemImage: "chart.bar.xaxis") }.buttonStyle(PicksPrimaryStyle())
      } else {
        if typeSize.isAccessibilitySize {
          completionButton(week: week, missing: missing, monday: monday, needsTotal: needsTotal, jump: jump)
          Menu("\(week.games.count - missing.count)/\(week.games.count) picks · More actions") {
            Button("Save to live board") { Task { await save() } }
              .disabled(appModel.isSavingEntry || appModel.draftConflict != nil)
            if let first = missing.first { Button("Next unpicked game") { jump(first.id) } }
            if let monday { Button("Go to Monday total") { jump(monday.id) } }
          }.font(.callout).frame(minHeight: 44)
        } else {
        HStack(alignment: .firstTextBaseline) {
          Text("\(week.games.count - missing.count)/\(week.games.count) picks\(needsTotal ? " · total needed" : " · total \(appModel.mondayPrediction!)")").font(.subheadline.bold())
          Spacer(minLength: 4)
          if let first = missing.first {
            Button("Next unpicked") { jump(first.id) }.font(.caption.bold()).frame(minHeight: 44)
          } else if let monday {
            Button("Monday total") { jump(monday.id) }.font(.caption.bold()).frame(minHeight: 44)
          }
        }
        Text(appModel.isSavingEntry ? "Sending your card…" : appModel.draftStatus)
          .font(.caption).frame(maxWidth: .infinity, alignment: .leading)
        HStack(spacing: 12) {
          Button { Task { await save() } } label: {
            Text("Save to\nlive board").font(.subheadline.bold()).frame(minHeight: 48).padding(.horizontal, 8)
          }.disabled(appModel.isSavingEntry || appModel.draftConflict != nil)
          completionButton(week: week, missing: missing, monday: monday, needsTotal: needsTotal, jump: jump)
        }
        }
        if needsTotal && monday == nil { Text("The commissioner must designate a tiebreaker game.").font(.caption) }
      }
    }.foregroundStyle(AGPTheme.paper100).tint(AGPTheme.paper100)
      .padding(.horizontal, 16).padding(.vertical, 10).background(AGPTheme.field950)
  }

  private func completionButton(week: MobilePlayerWeek, missing: [MobileGame], monday: MobileGame?, needsTotal: Bool,
    jump: @escaping (String) -> Void) -> some View {
    Button {
      if let first = missing.first { jump(first.id) }
      else if needsTotal, let monday { jump(monday.id) }
      else { review = appModel.makeEntryReview() }
    } label: {
      HStack {
        Text(!missing.isEmpty ? "Finish \(missing.count) \(missing.count == 1 ? "pick" : "picks")" : needsTotal ? "Add total" : "Review card")
        Spacer(minLength: 6)
        Image(systemName: "arrow.right")
      }
    }.buttonStyle(PicksPrimaryStyle())
      .disabled(appModel.isSavingEntry || appModel.draftConflict != nil || (needsTotal && monday == nil && missing.isEmpty))
      .accessibilityIdentifier("review-card")
  }

  private var refreshKey: String {
    let week = appModel.bootstrap?.currentWeek
    return "\(week?.id ?? "none")-\(scenePhase == .active)-\(appModel.selectedTab == .picks)-\(week.map(appModel.isLocked) ?? true)"
  }
  private func keepBoardFresh() async {
    guard !appModel.isPreview else { return }
    var pass = 0
    while !Task.isCancelled, scenePhase == .active, appModel.selectedTab == .picks,
      let week = appModel.bootstrap?.currentWeek, !appModel.isLocked(week) {
      await refreshBoard(refreshWeek: pass % 4 == 0)
      pass += 1
      do { try await Task.sleep(for: .seconds(15)) } catch { return }
    }
  }
  private func refreshBoard(refreshWeek: Bool) async {
    guard !appModel.isPreview, let week = appModel.bootstrap?.currentWeek else { return }
    do {
      guard let token = try await clerk.auth.getToken() else { appModel.markLivePicksStale(); return }
      if refreshWeek { await appModel.refreshHome(token: token, weekId: week.id) }
      await appModel.refreshLivePicks(token: token, weekId: week.id)
    } catch { if !Task.isCancelled { appModel.markLivePicksStale() } }
  }
  private func save() async {
    #if DEBUG
    if appModel.isPreview { appModel.previewSaveEntry(); return }
    #endif
    do {
      guard let token = try await clerk.auth.getToken() else {
        appModel.showEntryError("Sign in again to save. Your changes remain on this iPhone."); return
      }
      await appModel.saveDraft(token: token)
      await refreshBoard(refreshWeek: false)
    } catch { appModel.showEntryError("Sign in again to save. Your changes remain on this iPhone.") }
  }
  private func submit(_ snapshot: EntryReviewSnapshot) async -> Bool {
    #if DEBUG
    if appModel.isPreview { return appModel.previewSubmitEntry(snapshot) }
    #endif
    do {
      guard let token = try await clerk.auth.getToken() else {
        appModel.showEntryError("Sign in again to submit. No new official card was confirmed."); return false
      }
      return await appModel.submitEntry(token: token, review: snapshot)
    } catch {
      appModel.showEntryError("Your submission could not be confirmed. Retry with the same card."); return false
    }
  }
}

private struct PicksPrimaryStyle: ButtonStyle {
  @Environment(\.isEnabled) private var isEnabled
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.font(.headline.weight(.bold).width(.condensed)).foregroundStyle(AGPTheme.field950)
      .frame(maxWidth: .infinity, minHeight: 48).padding(.horizontal, 12)
      .background(configuration.isPressed ? AGPTheme.maizeDeep : AGPTheme.maize)
      .opacity(isEnabled ? 1 : 0.55)
  }
}

private struct EntryReviewSheet: View {
  let snapshot: EntryReviewSnapshot
  let submit: () async -> Bool
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  @State private var received = false
  @State private var submitting = false
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          Text(received ? "OFFICIAL CARD RECEIVED" : "REVIEW YOUR CALLS").font(.title.weight(.bold).width(.condensed))
          Text("\(snapshot.week.label) · \(String(snapshot.week.season))").font(.headline)
          if !received {
            Text("\(snapshot.picks.count) picks · Monday total \(snapshot.prediction.map(String.init) ?? "Not set")")
              .font(.headline)
          }
          if received, let receipt = appModel.entryReceipt {
            Text("Version \(receipt.versionNumber) · \(receipt.officialPicks.count) picks · total \(receipt.mondayPrediction)")
              .font(.headline)
            if let date = HomeWeekState.date(receipt.committedAt) {
              Text("Received \(date.formatted(date: .abbreviated, time: .shortened))").font(.subheadline)
            }
          }
          Text("Locks \(snapshot.week.deadlineLabel)").font(.subheadline)
          ForEach(snapshot.week.games) { game in
            HStack(spacing: 12) {
              NativeTeamCrest(code: snapshot.picks[game.id] ?? "", size: 32)
              VStack(alignment: .leading) {
                Text("\(game.away.abbreviation) @ \(game.home.abbreviation)").font(.subheadline)
                Text(snapshot.picks[game.id] ?? "Not picked").font(.headline.bold())
              }
              Spacer()
              Image(systemName: "checkmark")
            }.padding(.vertical, 4)
            Divider()
          }
          Text("Monday combined points: \(snapshot.prediction.map(String.init) ?? "Not set")").font(.headline)
          Text("Saving alone does not enter your card. Your latest official submission before the deadline counts.").font(.subheadline)
          if let message = appModel.entryActionMessage { Text(message).font(.subheadline.bold()) }
        }.padding(20)
      }.background(AGPTheme.paper100).foregroundStyle(AGPTheme.ink)
      .safeAreaInset(edge: .bottom) {
        VStack(spacing: 10) {
          if received {
            Button("Done") { dismiss() }.buttonStyle(PicksPrimaryStyle())
          } else {
            TimelineView(.periodic(from: .now, by: 1)) { _ in
              Button {
                submitting = true
                Task { received = await submit(); submitting = false }
              } label: { Text(submitting ? "Submitting…" : "Submit official card") }
                .buttonStyle(PicksPrimaryStyle()).disabled(submitting || !appModel.reviewIsCurrent(snapshot))
              if !submitting && !appModel.reviewIsCurrent(snapshot) {
                Text("The card changed or locked. Return to Picks to review its current state.").font(.caption).foregroundStyle(AGPTheme.paper100)
              }
            }
            Button("Keep editing") { dismiss() }.tint(AGPTheme.paper100).frame(minHeight: 44).disabled(submitting)
          }
        }.padding(16).background(AGPTheme.field950)
      }
      .navigationTitle("Review card").navigationBarTitleDisplayMode(.inline)
      .interactiveDismissDisabled(submitting)
    }
  }
}

#if DEBUG
struct PicksDebugHost: View {
  @State private var model = AppModel(draftStore: nil)
  var body: some View {
    AppShellView().environment(model).environment(Clerk.preview())
      .environment(LiveActivityManager.preview()).environment(NotificationManager())
      .task {
        let args = ProcessInfo.processInfo.arguments
        let mode = args.firstIndex(of: "-picks-mode").flatMap { args.indices.contains($0 + 1) ? args[$0 + 1] : nil } ?? "draft"
        model.loadPicksPreview(mode)
        model.selectedTab = .picks
      }
      .dynamicTypeSize(ProcessInfo.processInfo.arguments.contains("-picks-large-type") ? .accessibility3 : .large)
      .frame(width: ProcessInfo.processInfo.arguments.contains("-picks-narrow") ? 320 : nil)
  }
}
#Preview("Picks entry") { PicksDebugHost() }
#endif
