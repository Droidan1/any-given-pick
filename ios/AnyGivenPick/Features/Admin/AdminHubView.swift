import ClerkKit
import Observation
import SwiftUI

// Operate: extend the established paper/field-green settings, not the player scoreboard.
// Task-first grouped navigation keeps approvals within one tap and labels web handoffs.
// Native forms provide Dynamic Type, confirmation, loading, retry and empty states.
struct AdminHubView: View {
  @Environment(AppModel.self) private var appModel
  @Environment(Clerk.self) private var clerk

  var body: some View {
    Group {
      if appModel.bootstrap?.user.isAdmin == true {
        AdminHubContent(client: .live(clerk: clerk))
      } else {
        ContentUnavailableView("Administrator access required", systemImage: "lock.shield",
          description: Text("Sign in with your commissioner account to use these tools."))
      }
    }
    .adminPage("Admin")
  }
}

struct AdminHubContent: View {
  let client: AdminClient
  var body: some View {
    Form {
      Section {
        Text("Commissioner tools").font(.title2.bold())
        Text("Manage player access and keep the league informed.")
          .foregroundStyle(AGPTheme.inkSoft)
      }.listRowBackground(AGPTheme.paper200)
      Section("Manage in the app") {
        NavigationLink { AdminUsersView(client: client) } label: {
          AdminToolLabel(title: "Player approvals", detail: "Approve players or remove access", symbol: "person.badge.shield.checkmark")
        }
        NavigationLink { AdminAnnouncementsView(client: client) } label: {
          AdminToolLabel(title: "Announcements", detail: "Draft, schedule, publish and archive", symbol: "megaphone")
        }
        NavigationLink { AdminPicksView(client: client) } label: {
          AdminToolLabel(title: "Everyone’s pick cards", detail: "Submission status and official selections", symbol: "list.clipboard")
        }
        NavigationLink { AdminOperationsView(client: client) } label: {
          AdminToolLabel(title: "Operations & privacy", detail: "Score-feed health, alerts and requests", symbol: "waveform.path.ecg")
        }
      }.listRowBackground(AGPTheme.paper100)
      Section {
        AdminWebLink(title: "Manage weeks & scores", path: "/admin/weeks")
        AdminWebLink(title: "Import season schedule", path: "/admin/weeks/import")
        AdminWebLink(title: "Full admin settings", path: "/admin")
      } header: { Text("Secure web tools") } footer: {
        Text("Opens your browser. You may need to sign in again. Publishing, game corrections and account deletion retain their existing safeguards.")
      }.listRowBackground(AGPTheme.paper100)
    }
    .adminPage("Admin")
  }
}

struct AdminToolLabel: View {
  let title: String
  let detail: String
  let symbol: String
  var body: some View {
    Label {
      VStack(alignment: .leading, spacing: 5) {
        Text(title).font(.headline)
        Text(detail).font(.subheadline).foregroundStyle(AGPTheme.inkSoft)
      }.fixedSize(horizontal: false, vertical: true)
    } icon: { Image(systemName: symbol).foregroundStyle(AGPTheme.ink) }
      .padding(.vertical, 6)
  }
}

struct AdminWebLink: View {
  let title: String
  let path: String
  var body: some View {
    Link(destination: URL(string: "https://anygivenpick.app\(path)")!) {
      Label("\(title) · Web", systemImage: "arrow.up.right.square")
        .frame(minHeight: 44, alignment: .leading)
    }.accessibilityHint("Opens the secure website in your browser. Sign-in may be required.")
  }
}

extension View {
  func adminPage(_ title: String) -> some View {
    self.foregroundStyle(AGPTheme.ink).tint(AGPTheme.field950)
      .scrollContentBackground(.hidden).background(AGPTheme.paper100)
      .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
      .toolbar(.visible, for: .navigationBar)
  }
}

@MainActor
struct AdminClient {
  var load: (String, String?) async throws -> AdminPayload
  var send: (AdminCommand) async throws -> AdminActionResult

  static func live(clerk: Clerk, api: APIClient = .production) -> Self {
    Self(load: { view, week in
      guard let token = try await clerk.auth.getToken() else { throw APIError.server(message: "Sign in again to continue.", statusCode: 401) }
      return try await api.fetchAdmin(token: token, view: view, weekId: week)
    }, send: { command in
      guard let token = try await clerk.auth.getToken() else { throw APIError.server(message: "Sign in again to continue.", statusCode: 401) }
      return try await api.administer(token: token, command: command)
    })
  }
}

@MainActor @Observable
final class AdminScreenState {
  var payload: AdminPayload?
  var loading = false
  var saving = false
  var error: String?
  var notice: String?
  var needsRefresh = false
  private var requestID = UUID()

  func load(client: AdminClient, view: String, weekId: String? = nil) async {
    let id = UUID()
    requestID = id
    loading = true
    error = nil
    // Never show one week's cards under another week's selector, or stale access controls.
    payload = nil
    defer { if requestID == id { loading = false } }
    do {
      let result = try await client.load(view, weekId)
      guard requestID == id, !Task.isCancelled else { return }
      payload = result
      needsRefresh = false
    } catch {
      guard requestID == id, !Task.isCancelled else { return }
      self.error = error.localizedDescription
    }
  }

  func execute(_ command: AdminCommand, client: AdminClient, view: String) async {
    guard !saving, !loading, !needsRefresh else { return }
    saving = true
    defer { saving = false }
    do {
      let result = try await client.send(command)
      notice = result.message
      // Re-read even a rejected mutation: another admin may have changed the record.
      await load(client: client, view: view)
    } catch {
      payload = nil
      needsRefresh = true
      self.error = "The result could not be confirmed. Refresh to check the latest state before trying again."
    }
  }
}

struct AdminDataForm<Content: View>: View {
  @Environment(\.scenePhase) private var scenePhase
  @Bindable var state: AdminScreenState
  let client: AdminClient
  let view: String
  var weekId: String? = nil
  @ViewBuilder var content: (AdminPayload) -> Content
  var body: some View {
    Form {
      if state.loading {
        Section { ProgressView("Loading admin data…").frame(minHeight: 44) }.listRowBackground(AGPTheme.paper100)
      }
      if let error = state.error {
        Section {
          Label(error, systemImage: "exclamationmark.triangle")
          Button("Refresh and try again") { Task { await reload() } }.frame(minHeight: 44)
        }.listRowBackground(AGPTheme.paper100)
      }
      if let payload = state.payload { content(payload) }
    }
    .disabled(state.saving)
    .navigationBarBackButtonHidden(state.saving)
    .overlay { if state.saving { ProgressView("Saving…").padding(24).background(AGPTheme.paper100, in: RoundedRectangle(cornerRadius: 12)) } }
    .task(id: weekId) { await reload() }
    .refreshable { await reload() }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active && !state.saving { Task { await reload() } }
    }
    .alert("Admin update", isPresented: Binding(get: { state.notice != nil }, set: { if !$0 { state.notice = nil } })) {
      Button("OK") { state.notice = nil }
    } message: { Text(state.notice ?? "") }
  }
  private func reload() async { await state.load(client: client, view: view, weekId: weekId) }
}

func adminDate(_ value: String?) -> String {
  guard let value, let date = HomeWeekState.date(value) else { return "Not recorded" }
  return date.formatted(date: .abbreviated, time: .shortened)
}
