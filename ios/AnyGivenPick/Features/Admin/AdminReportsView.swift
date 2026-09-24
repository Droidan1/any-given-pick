import SwiftUI

struct AdminPicksView: View {
  let client: AdminClient
  @State private var state = AdminScreenState()
  @State private var weekId: String?
  @State private var query = ""
  var body: some View {
    AdminDataForm(state: state, client: client, view: "picks", weekId: weekId) { payload in
      if let board = payload.board {
        Section {
          if !board.weeks.isEmpty {
            Picker("Week", selection: Binding(get: { weekId ?? board.selectedWeek?.id ?? "" }, set: { weekId = $0 })) {
              ForEach(board.weeks) { week in Text("\(week.season) · \(week.label)").tag(week.id) }
            }
          }
          Text("\(board.submittedCount) submitted · \(board.notSubmittedCount) not submitted · \(board.disqualifiedCount) disqualified")
            .font(.subheadline).fixedSize(horizontal: false, vertical: true)
          if board.revealStatus == "open" {
            Label("Official selections and Monday totals appear after the entry deadline.", systemImage: "lock")
          }
        }.listRowBackground(AGPTheme.paper200)
        Section("Player cards") {
          let players = board.players.filter { query.isEmpty || $0.displayName.localizedCaseInsensitiveContains(query) }
          if players.isEmpty { Text(board.selectedWeek == nil ? "No published week is available yet." : "No matching player cards.") }
          ForEach(players) { card in
            if let entry = card.entry {
              NavigationLink { AdminPickDetail(entry: entry) } label: { cardLabel(card) }
            } else { cardLabel(card) }
          }
        }.listRowBackground(AGPTheme.paper100)
      }
    }
    .searchable(text: $query, prompt: "Find a player")
    .adminPage("Everyone’s pick cards")
  }
  private func cardLabel(_ card: AdminPickCard) -> some View {
    VStack(alignment: .leading, spacing: 5) {
      Text(card.displayName).font(.headline)
      Text(card.submissionStatus.replacingOccurrences(of: "_", with: " ").capitalized)
        .font(.subheadline).foregroundStyle(AGPTheme.inkSoft)
    }.padding(.vertical, 6)
  }
}

struct AdminPickDetail: View {
  let entry: MobileResultEntry
  var body: some View {
    List {
      Section {
        LabeledContent("Official version", value: String(entry.versionNumber))
        LabeledContent("Submitted", value: adminDate(entry.committedAt))
        LabeledContent("Monday total", value: String(entry.mondayPrediction))
        Text("\(entry.correctPicks) correct of \(entry.gradedPicks) graded")
      }.listRowBackground(AGPTheme.paper200)
      Section("Selections") {
        ForEach(entry.picks) { pick in
          VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
              NativeTeamCrest(code: pick.awayTeamCode, size: 22)
              Text(pick.awayTeamCode)
              Text("at")
              NativeTeamCrest(code: pick.homeTeamCode, size: 22)
              Text(pick.homeTeamCode)
            }.font(.subheadline).foregroundStyle(AGPTheme.inkSoft)
            HStack {
              NativeTeamCrest(code: pick.selectedTeamCode, size: 28)
              Text(pick.selectedTeamName).font(.headline)
            }
            Text(pick.outcome.replacingOccurrences(of: "_", with: " ").capitalized).font(.subheadline)
            if pick.isMondayTiebreaker { Text("Tiebreaker game · Predicted total \(entry.mondayPrediction)").font(.footnote) }
          }.padding(.vertical, 6).fixedSize(horizontal: false, vertical: true)
        }
      }.listRowBackground(AGPTheme.paper100)
    }.adminPage(entry.displayName)
  }
}

struct AdminOperationsView: View {
  let client: AdminClient
  @State private var state = AdminScreenState()
  var body: some View {
    AdminDataForm(state: state, client: client, view: "operations") { payload in
      if let operations = payload.operations {
        Section("Score & odds feed") {
          Label(operations.scoreSync.ready ? "Scheduler is up to date" : "Scheduler needs attention",
            systemImage: operations.scoreSync.ready ? "checkmark.circle" : "exclamationmark.triangle")
            .font(.headline)
          LabeledContent("Last run", value: operations.scoreSync.health.status.capitalized)
          LabeledContent("Last successful check", value: adminDate(operations.scoreSync.health.lastSuccessAt))
          LabeledContent("Last attempt", value: adminDate(operations.scoreSync.health.lastAttemptAt))
          LabeledContent("Games checked", value: String(operations.scoreSync.health.checkedGames))
          LabeledContent("Games updated", value: String(operations.scoreSync.health.updatedGames))
          if let error = operations.scoreSync.health.errorMessage { Text(error).font(.subheadline) }
          AdminWebLink(title: "Score controls", path: "/admin/weeks")
        }.listRowBackground(AGPTheme.paper100)
        Section("Operations monitor") {
          Text(operations.alertEmailEnabled ? "Alert email configured" : "Alert email not configured")
          if operations.alerts.isEmpty { Text("No active operational alerts.").foregroundStyle(AGPTheme.inkSoft) }
          ForEach(operations.alerts) { alert in
            VStack(alignment: .leading, spacing: 6) {
              Label(alert.kind.replacingOccurrences(of: "_", with: " ").capitalized, systemImage: "exclamationmark.triangle").font(.headline)
              Text(alert.message)
              Text("\(alert.occurrenceCount) occurrences · \(adminDate(alert.lastSeenAt))").font(.footnote).foregroundStyle(AGPTheme.inkSoft)
            }.padding(.vertical, 6)
          }
        }.listRowBackground(AGPTheme.paper100)
        Section {
          if operations.privacyRequests.isEmpty { Text("No account deletion requests are waiting.") }
          ForEach(operations.privacyRequests) { request in
            VStack(alignment: .leading, spacing: 5) {
              Text(request.displayName).font(.headline)
              Text("\(request.status.capitalized) · \(adminDate(request.requestedAt))").font(.subheadline)
            }
          }
          AdminWebLink(title: "Process privacy requests", path: "/admin")
        } header: { Text("Privacy requests") } footer: {
          Text("Deletion and anonymization are completed in the secure web admin with their existing confirmation steps.")
        }.listRowBackground(AGPTheme.paper100)
      }
    }.adminPage("Operations & privacy")
  }
}
