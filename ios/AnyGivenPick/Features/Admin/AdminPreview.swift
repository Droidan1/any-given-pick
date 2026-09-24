#if DEBUG
import SwiftUI

@MainActor enum AdminPreview {
  static let player = AdminPlayer(id: "example-player", email: "jordan@example.com", name: "Jordan Reed", displayName: "Fourth & Goal",
    status: "pending", statusLabel: "Pending approval", isAdmin: false, isSelf: false, identityKnown: true,
    joinedLabel: "Sep 24, 2026", lastSeenLabel: "Sep 24, 2026")
  static let commissioner = AdminPlayer(id: "example-admin", email: "commissioner@example.com", name: "Commissioner", displayName: "Commissioner",
    status: "approved", statusLabel: "Approved", isAdmin: true, isSelf: true, identityKnown: true,
    joinedLabel: "Aug 5, 2026", lastSeenLabel: "Sep 24, 2026")
  static let week = MobileResultsWeek(id: "example-week", season: 2026, seasonPhase: "regular", weekNumber: 3,
    label: "Week 3", entryDeadline: "2026-09-24T22:00:00Z")
  static let entry = MobileResultEntry(userId: "example-player", displayName: "Fourth & Goal", profilePhotoUrl: nil,
    isCurrentUser: false, versionNumber: 2, committedAt: "2026-09-24T17:20:00Z", mondayPrediction: 45, correctPicks: 1, gradedPicks: 1,
    picks: [MobileResultPick(gameId: "sample-game", kickoffAt: "2026-09-25T00:15:00Z", awayTeamCode: "IND", awayTeamName: "Indianapolis Colts",
      homeTeamCode: "HOU", homeTeamName: "Houston Texans", awayScore: 24, homeScore: 20, gameStatus: "final", isMondayTiebreaker: false,
      selectedTeamCode: "IND", selectedTeamName: "Indianapolis Colts", outcome: "won")])
  static func payload(_ view: String) -> AdminPayload {
    switch view {
    case "users": return AdminPayload(directory: AdminDirectory(users: [player, commissioner], pendingCount: 1, identityDirectoryAvailable: true, truncated: false), approvalRequired: true)
    case "announcements": return AdminPayload(announcements: [AdminAnnouncement(id: "example-announcement", title: "Get your Week 3 card ready",
      body: "Check each matchup and your Monday total before the deadline. Your latest submitted card is official.", status: "published", displayState: "live",
      startsAt: "2026-09-23T12:00:00Z", expiresAt: "2026-09-25T22:00:00Z")])
    case "picks": return AdminPayload(board: AdminPicksBoard(weeks: [week], selectedWeek: week, revealStatus: "revealed",
      players: [AdminPickCard(userId: player.id, displayName: player.title, submissionStatus: "submitted", entry: entry)],
      submittedCount: 1, notSubmittedCount: 0, disqualifiedCount: 0))
    default: return AdminPayload(operations: AdminOperations(scoreSync: AdminScoreSync(health: AdminScoreHealth(status: "healthy",
      lastAttemptAt: "2026-09-24T13:00:00Z", lastSuccessAt: "2026-09-24T13:00:00Z", checkedGames: 16, updatedGames: 2, errorMessage: nil),
      ready: true, freshnessWindowMinutes: 40), alerts: [], privacyRequests: [], alertEmailEnabled: true))
    }
  }
  static var client: AdminClient {
    AdminClient(load: { view, _ in
      if ProcessInfo.processInfo.arguments.contains("-admin-error") {
        throw APIError.server(message: "Admin data could not be loaded. Try again.", statusCode: 503)
      }
      return payload(view)
    }, send: { _ in AdminActionResult(ok: false, message: "Preview only — no live data was changed.") })
  }
}

struct AdminDebugHost: View {
  private let args = ProcessInfo.processInfo.arguments
  var body: some View {
    NavigationStack {
      Group {
        if args.contains("-admin-users") { AdminUsersView(client: AdminPreview.client) }
        else if args.contains("-admin-announcements") { AdminAnnouncementsView(client: AdminPreview.client) }
        else if args.contains("-admin-editor") { AdminAnnouncementEditor(client: AdminPreview.client) }
        else if args.contains("-admin-picks") { AdminPicksView(client: AdminPreview.client) }
        else if args.contains("-admin-card") { AdminPickDetail(entry: AdminPreview.entry) }
        else if args.contains("-admin-operations") { AdminOperationsView(client: AdminPreview.client) }
        else { AdminHubContent(client: AdminPreview.client) }
      }
      .safeAreaInset(edge: .bottom) {
        Text("UI preview · Example data only").font(.caption).frame(maxWidth: .infinity).padding(8).background(AGPTheme.paper200)
      }
    }
    .dynamicTypeSize(args.contains("-admin-large-type") ? .accessibility2 : .large)
    .frame(width: args.contains("-admin-narrow") ? 320 : nil)
  }
}
#Preview { AdminDebugHost() }
#endif
