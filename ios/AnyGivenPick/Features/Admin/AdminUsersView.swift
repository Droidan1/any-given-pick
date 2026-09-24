import SwiftUI

struct AdminUsersView: View {
  let client: AdminClient
  @State private var state = AdminScreenState()
  @State private var query = ""
  @State private var pendingOnly = false
  @State private var selectedPlayer: AdminPlayer?

  var body: some View {
    AdminDataForm(state: state, client: client, view: "users") { payload in
      if let directory = payload.directory {
        Section {
          Text("\(directory.pendingCount) awaiting approval").font(.headline)
          Text(payload.approvalRequired == true ? "New players need admin approval before they can participate." : "Automatic access is enabled. New players do not require approval.")
            .font(.subheadline).foregroundStyle(AGPTheme.inkSoft)
          Toggle("Pending approvals only", isOn: $pendingOnly)
        }.listRowBackground(AGPTheme.paper200)
        if !directory.identityDirectoryAvailable {
          Section { Label("Identity verification is temporarily unavailable. Access controls are disabled until verified details return.", systemImage: "exclamationmark.triangle") }
        }
        let players = directory.users.filter { player in
          (!pendingOnly || player.status == "pending") && (query.isEmpty || [player.title, player.name ?? "", player.email ?? ""].joined(separator: " ").localizedCaseInsensitiveContains(query))
        }
        Section("Players") {
          if players.isEmpty { Text(query.isEmpty ? "No players match this filter." : "No matching players. Try a different name or email.") }
          ForEach(players) { player in
            VStack(alignment: .leading, spacing: 8) {
              Text(player.title).font(.headline)
              if let name = player.name, name != player.title { Text(name).font(.subheadline) }
              Text(player.email ?? "Verified email unavailable").font(.subheadline).textSelection(.enabled)
              Label(player.isAdmin ? "Administrator · protected" : player.statusLabel,
                systemImage: player.isAdmin ? "lock.shield" : player.status == "approved" ? "checkmark.circle" : "person.crop.circle.badge.clock")
                .font(.subheadline.weight(.semibold))
              Text("Joined \(player.joinedLabel) · Last seen \(player.lastSeenLabel)")
                .font(.footnote).foregroundStyle(AGPTheme.inkSoft)
              if player.canManage && directory.identityDirectoryAvailable {
                Button(player.status == "approved" ? "Remove access" : "Approve player", role: player.status == "approved" ? .destructive : nil) {
                  selectedPlayer = player
                }.frame(minHeight: 44).accessibilityLabel("\(player.status == "approved" ? "Remove access for" : "Approve") \(player.title)")
              }
            }.padding(.vertical, 8).fixedSize(horizontal: false, vertical: true)
          }
        }.listRowBackground(AGPTheme.paper100)
        if directory.truncated {
          Section { Text("Showing the latest 100 accounts. Older accounts are not included in this search.").font(.footnote) }
        }
      }
    }
    .searchable(text: $query, prompt: "Name or verified email")
    .adminPage("Player approvals")
    .confirmationDialog(selectedPlayer?.status == "approved" ? "Remove player access?" : "Approve this player?",
      isPresented: Binding(get: { selectedPlayer != nil }, set: { if !$0 { selectedPlayer = nil } }), titleVisibility: .visible) {
      if let player = selectedPlayer {
        Button(player.status == "approved" ? "Remove access" : "Approve player", role: player.status == "approved" ? .destructive : nil) {
          let command = AdminCommand(action: "access", targetUserId: player.id, intent: player.status == "approved" ? "remove" : "approve")
          Task { await state.execute(command, client: client, view: "users") }
        }
      }
      Button("Cancel", role: .cancel) {}
    } message: {
      if let player = selectedPlayer {
        Text("\(player.title)\n\(player.email ?? "")\n\n\(player.status == "approved" ? "Their records will be kept. You can approve them again later." : "This gives them player access and queues their approval email.")")
      }
    }
  }
}
