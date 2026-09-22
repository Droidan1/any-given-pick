import SwiftUI
import ClerkKit

struct LiveActivitySettingsView: View {
  @Environment(LiveActivityManager.self) private var activities
  @Environment(\.openURL) private var openURL
  var body: some View {
    Form {
      Section {
        Label("YOUR LOCK SCREEN GAME PLAN", systemImage: "rectangle.inset.filled.and.person.filled")
          .font(AGPTheme.label(17))
        Text(activities.statusMessage).font(.body).accessibilityIdentifier("live-activity-status")
        if activities.busy { ProgressView("Saving…") }
        Button("Refresh connection") { Task { await activities.refresh() } }.frame(minHeight: 44).disabled(activities.busy)
        if !activities.authorized {
          Button("Open iPhone Settings") { openURL(URL(string: UIApplication.openSettingsURLString)!) }.frame(minHeight: 44)
        }
      } footer: { Text("Live Activities are separate from email and notification alerts. They can show your picks and position on the Lock Screen.") }
      .listRowBackground(AGPTheme.paper200)
      Section("This iPhone") {
        setting("Enable Live Activities", detail: "You can turn these off at any time.", key: \.enabled)
      }.disabled(!activities.registered || !activities.authorized || activities.busy)
      if activities.canTest {
        Section {
          NavigationLink {
            LiveActivityPrivateTestView()
          } label: {
            Label("Test now", systemImage: "testtube.2").font(.headline)
          }.frame(minHeight: 44).accessibilityIdentifier("live-activity-private-tests")
        } header: { Text("Private admin tools") } footer: {
          Text("Only on your Xcode sandbox build. Test all three activities with sample data.")
        }
      }
      Section {
        setting("Card deadline", detail: "Starts 30 minutes before lock if you haven't submitted. Ends when you submit or the card locks.", key: \.deadline)
        setting("Daily week race", detail: "Starts 10 minutes before the first kickoff on each game day, for your official card. A fresh session covers long days.", key: \.race)
      } header: { Text("Automatic starts") } footer: {
        Text(activities.supportsAutomaticStarts
          ? "Game days use Eastern Time. Apple controls delivery timing, so starts and updates may be delayed."
          : "Automatic starts need iOS 17.2 or later. You can still follow a game manually.")
      }.disabled(!activities.preferences.enabled || activities.busy || !activities.supportsAutomaticStarts)
      Section {
        NavigationLink(value: AppRoute.followGames) { Label("Follow a game", systemImage: "sportscourt") }.frame(minHeight: 44)
      }
      Section("Active on this iPhone") {
        if activities.sessions.filter({ $0.isTest != true }).isEmpty { Text("No activities running yet.").foregroundStyle(.secondary) }
        ForEach(activities.sessions.filter { $0.isTest != true }) { session in
          HStack {
            Text(session.kind == "deadline" ? "Card deadline" : session.kind == "race" ? "Daily race" : "Followed game")
            Spacer()
            Button("Stop", role: .destructive) { Task { await activities.stop(sessionId: session.sessionId) } }.frame(minHeight: 44)
          }
        }
      }
    }
    .scrollContentBackground(.hidden).background(AGPTheme.paper100).tint(AGPTheme.field950)
    .navigationTitle("Live Activities").navigationBarTitleDisplayMode(.inline)
  }
  private func setting(_ title: String, detail: String, key: WritableKeyPath<LiveActivityPreferences, Bool>) -> some View {
    Toggle(isOn: Binding(get: { activities.preferences[keyPath: key] }, set: { value in
      var settings = activities.preferences; settings[keyPath: key] = value
      Task { await activities.save(settings) }
    })) {
      VStack(alignment: .leading, spacing: 5) {
        Text(title).font(.headline)
        Text(detail).font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      }.padding(.vertical, 5)
    }
  }
}

struct LiveActivityPrivateTestView: View {
  @Environment(LiveActivityManager.self) private var activities
  var body: some View {
    Form {
      Section {
        Label("PRIVATE TEST", systemImage: "lock.shield").font(AGPTheme.label(22))
        Text(activities.testMessage).fixedSize(horizontal: false, vertical: true)
          .accessibilityIdentifier("live-activity-test-status")
        Text(activities.statusMessage).font(.subheadline).foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
        Button("Refresh test status") { Task { await activities.refresh() } }.frame(minHeight: 44).disabled(activities.busy)
        if activities.busy { ProgressView("Contacting server…") }
      } footer: { Text("One test at a time. Admin access, Live Activities, and the matching preference must be enabled. Delivery timing depends on Apple and the network.") }
      .listRowBackground(AGPTheme.paper200)
      if activities.canTest {
        Section("Choose a 5-minute test") {
          testButton(.deadline, title: "Test card deadline", detail: "Scheduled push start, countdown, and sample saved-pick updates.", symbol: "timer")
          testButton(.game, title: "Test followed game", detail: "Starts when tapped. Server pushes sample score updates.", symbol: "sportscourt")
          testButton(.race, title: "Test daily race", detail: "Scheduled push start with changing sample ranks and scores.", symbol: "flag.checkered")
        }
        Section("Recent private tests") {
          if activities.tests.isEmpty { Text("No private tests yet.").foregroundStyle(.secondary) }
          ForEach(activities.tests) { session in
            VStack(alignment: .leading, spacing: 8) {
              Text(session.title).font(.headline)
              Text(session.testStatus).font(.subheadline).foregroundStyle(.secondary)
              if session.isRunning {
                Button("Stop test", role: .destructive) { Task { await activities.stop(sessionId: session.sessionId); await activities.refresh() } }
                  .frame(minHeight: 44).disabled(activities.busy)
                  .accessibilityLabel("Stop \(session.title) test")
              }
            }.padding(.vertical, 4)
          }
        }
      } else {
        Section { Text("Private tests are available only to an active admin using an Xcode sandbox build. Refresh your connection to check access.") }
      }
      Section("What this proves") {
        Text("Watch the Lock Screen for a start, a changed sample value, and an end. Server acceptance alone does not prove the iPhone displayed it.")
        Text("These are delivery tests. Real 30-minute deadline and 10-minute game-day eligibility rules are unchanged.")
      }
    }
    .scrollContentBackground(.hidden).background(AGPTheme.paper100).tint(AGPTheme.field950)
    .navigationTitle("Test now").navigationBarTitleDisplayMode(.inline)
    .task { await activities.refresh() }
    .refreshable { await activities.refresh() }
  }
  private func testButton(_ kind: PickActivityAttributes.Kind, title: String, detail: String, symbol: String) -> some View {
    Button { Task { await activities.testNow(kind) } } label: {
      VStack(alignment: .leading, spacing: 6) {
        Label(title, systemImage: symbol).font(.headline)
        Text(detail).font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      }.padding(.vertical, 8).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
    }
    .accessibilityIdentifier("test-live-activity-\(kind.rawValue)")
    .disabled(activities.busy || activities.hasRunningTest || !activities.preferences.enabled || !activities.authorized || !activities.deliveryConfigured
      || (kind == .deadline && (!activities.preferences.deadline || !activities.supportsAutomaticStarts))
      || (kind == .race && (!activities.preferences.race || !activities.supportsAutomaticStarts)))
  }
}

#if DEBUG
#Preview("Private tests") {
  NavigationStack { LiveActivityPrivateTestView() }.environment(LiveActivityManager.preview())
}
#Preview("Private tests - Large text") {
  NavigationStack { LiveActivityPrivateTestView() }.environment(LiveActivityManager.preview()).environment(\.dynamicTypeSize, .accessibility3)
}
#endif

struct FollowGamesView: View {
  @Environment(AppModel.self) private var appModel
  @Environment(LiveActivityManager.self) private var activities
  @Environment(Clerk.self) private var clerk
  private struct Game: Identifiable {
    let id: String; let away: String; let home: String; let kickoff: String; let status: String
    var date: Date? {
      let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
      return formatter.date(from: kickoff) ?? ISO8601DateFormatter().date(from: kickoff)
    }
    var available: Bool {
      guard ["scheduled", "in_progress"].contains(status), let date else { return false }
      return date.timeIntervalSinceNow <= 7 * 3600 && date.timeIntervalSinceNow > -8 * 3600
    }
  }
  private var games: [Game] {
    var rows = (appModel.bootstrap?.currentWeek?.games ?? []).map { Game(id: $0.id, away: $0.away.abbreviation, home: $0.home.abbreviation, kickoff: $0.kickoffAt, status: $0.status) }
    for game in appModel.bootstrap?.results?.games ?? [] where !rows.contains(where: { $0.id == game.id }) {
      rows.append(Game(id: game.id, away: game.awayTeamCode, home: game.homeTeamCode, kickoff: game.kickoffAt, status: game.status))
    }
    return rows.filter { ["scheduled", "in_progress"].contains($0.status) }.sorted { $0.kickoff < $1.kickoff }
  }
  var body: some View {
    List {
      Section {
        Text("Choose up to two games to follow on your Lock Screen. Start within 7 hours of kickoff or while the game is live. Each session lasts up to 7½ hours; you can follow again if needed.")
        Text(activities.statusMessage).font(.subheadline).foregroundStyle(.secondary)
        if !activities.preferences.enabled {
          NavigationLink("Enable Live Activities", value: AppRoute.liveActivities)
        }
      }
      Section("Upcoming and live games") {
        if games.isEmpty { Text("There are no available games on your current or results card.") }
        ForEach(games) { game in
          VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
              NativeTeamCrest(code: game.away, size: 26)
              Text(game.away).font(.headline)
              Text("at").foregroundStyle(.secondary)
              NativeTeamCrest(code: game.home, size: 26)
              Text(game.home).font(.headline)
            }
            if let date = game.date { Text(date.formatted(date: .abbreviated, time: .shortened)).font(.subheadline) }
            if let session = activities.sessions.first(where: { $0.gameId == game.id }) {
              Button("Stop following", role: .destructive) { Task { await activities.stop(sessionId: session.sessionId) } }.frame(minHeight: 44)
            } else {
              Button(game.available ? "Follow game" : "Available closer to kickoff") { Task { await activities.follow(gameId: game.id) } }
                .frame(minHeight: 44).disabled(!game.available || !activities.preferences.enabled || !activities.authorized || activities.busy)
                .accessibilityLabel("Follow \(game.away) at \(game.home)")
            }
          }.padding(.vertical, 6)
        }
      }
    }.scrollContentBackground(.hidden).background(AGPTheme.paper100).tint(AGPTheme.field950)
      .navigationTitle("Follow a game").navigationBarTitleDisplayMode(.inline)
      .task { await activities.refresh(); if let token = try? await clerk.auth.getToken() { await appModel.refreshResults(token: token) } }
      .refreshable { await activities.refresh(); if let token = try? await clerk.auth.getToken() { await appModel.refreshResults(token: token) } }
  }
}

#if DEBUG
struct LiveActivitiesDebugHost: View {
  @State private var activities = LiveActivityManager.preview()
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 20) {
          Text("YOUR LOCK SCREEN\nGAME PLAN").font(AGPTheme.display(34)).foregroundStyle(AGPTheme.ink)
          Text("Example data · Three Live Activities").foregroundStyle(AGPTheme.inkSoft)
          preview(.deadline, caption: "30 minutes before your card locks")
          preview(.game, caption: "When you choose Follow game")
          preview(.race, caption: "10 minutes before each game day's first kickoff")
          NavigationLink("Review Live Activity settings") { LiveActivitySettingsView() }.buttonStyle(CallSheetActionStyle())
          PickActivityCard(attributes: .example(.game), state: PickActivityAttributes.exampleState, stale: true)
        }.padding(20)
      }.background(AGPTheme.paper100)
    }.environment(activities)
  }
  private func preview(_ kind: PickActivityAttributes.Kind, caption: String) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(caption).font(.subheadline.weight(.semibold)).foregroundStyle(AGPTheme.ink)
      PickActivityCard(attributes: .example(kind), state: PickActivityAttributes.exampleState).clipShape(RoundedRectangle(cornerRadius: 20))
    }
  }
}
#endif
