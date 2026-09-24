import SwiftUI

struct AdminAnnouncementsView: View {
  let client: AdminClient
  @State private var state = AdminScreenState()
  @State private var archive: AdminAnnouncement?
  var body: some View {
    AdminDataForm(state: state, client: client, view: "announcements") { payload in
      Section {
        NavigationLink { AdminAnnouncementEditor(client: client) } label: { Label("New announcement", systemImage: "plus") }
      }.listRowBackground(AGPTheme.paper100)
      Section("Latest 20 announcements") {
        if payload.announcements?.isEmpty == true { Text("No announcements yet. Write a private draft or schedule a message for players.") }
        ForEach(payload.announcements ?? []) { item in
          VStack(alignment: .leading, spacing: 8) {
            Text(item.title).font(.headline)
            Text(item.displayState.capitalized).font(.subheadline.weight(.semibold)).foregroundStyle(AGPTheme.inkSoft)
            Text(item.body)
            Text("Starts \(adminDate(item.startsAt))\nEnds \(item.expiresAt == nil ? "when archived" : adminDate(item.expiresAt))")
              .font(.footnote).foregroundStyle(AGPTheme.inkSoft)
            if item.status != "archived" {
              NavigationLink("Edit announcement") { AdminAnnouncementEditor(client: client, announcement: item) }.frame(minHeight: 44)
              Button("Archive", role: .destructive) { archive = item }.frame(minHeight: 44)
            }
          }.padding(.vertical, 8).fixedSize(horizontal: false, vertical: true)
        }
      }.listRowBackground(AGPTheme.paper100)
    }
    .adminPage("Announcements")
    .confirmationDialog("Archive announcement?", isPresented: Binding(get: { archive != nil }, set: { if !$0 { archive = nil } }), titleVisibility: .visible) {
      if let item = archive {
        Button("Archive", role: .destructive) { Task { await state.execute(AdminCommand(action: "archive", id: item.id), client: client, view: "announcements") } }
      }
      Button("Cancel", role: .cancel) {}
    } message: { Text("Remove “\(archive?.title ?? "")” from player view. Archived messages cannot be edited.") }
  }
}

struct AdminAnnouncementEditor: View {
  let client: AdminClient
  let announcement: AdminAnnouncement?
  @Environment(\.dismiss) private var dismiss
  @State private var title: String
  @State private var message: String
  @State private var startsAt: Date
  @State private var expiresAt: Date
  @State private var hasExpiry: Bool
  @State private var saving = false
  @State private var error: String?
  @State private var result: String?
  @State private var confirmPublish = false
  @State private var uncertain = false

  init(client: AdminClient, announcement: AdminAnnouncement? = nil) {
    self.client = client
    self.announcement = announcement
    _title = State(initialValue: announcement?.title ?? "")
    _message = State(initialValue: announcement?.body ?? "")
    _startsAt = State(initialValue: announcement.flatMap { HomeWeekState.date($0.startsAt) } ?? Date())
    _expiresAt = State(initialValue: announcement?.expiresAt.flatMap { HomeWeekState.date($0) } ?? Date().addingTimeInterval(86_400))
    _hasExpiry = State(initialValue: announcement?.expiresAt != nil)
  }

  private var valid: Bool {
    (3...80).contains(title.trimmingCharacters(in: .whitespacesAndNewlines).count)
      && (3...500).contains(message.trimmingCharacters(in: .whitespacesAndNewlines).count)
      && (!hasExpiry || expiresAt > startsAt)
  }
  var body: some View {
    Form {
      Section {
        TextField("Title", text: $title, prompt: Text("Title").foregroundStyle(AGPTheme.inkSoft))
          .accessibilityLabel("Announcement title")
        TextField("Message to players", text: $message, prompt: Text("Message to players").foregroundStyle(AGPTheme.inkSoft), axis: .vertical)
          .lineLimit(5...12).accessibilityLabel("Message to players")
        Text("Title: \(title.count)/80 · Message: \(message.count)/500")
          .font(.footnote).foregroundStyle(AGPTheme.inkSoft)
        if title.count > 80 || message.count > 500 {
          Label("Shorten the title to 80 characters and the message to 500 characters or fewer.", systemImage: "exclamationmark.triangle")
            .font(.footnote).foregroundStyle(AGPTheme.clay)
        }
      } header: { Text("Message") } footer: {
        Text("Title: 3–80 characters. Message: 3–500 characters. Both are required before saving.")
      }.listRowBackground(AGPTheme.paper100)
      Section {
        DatePicker("Starts", selection: $startsAt)
        Toggle("Set an end time", isOn: $hasExpiry)
        if hasExpiry { DatePicker("Ends", selection: $expiresAt) }
        if hasExpiry && expiresAt <= startsAt {
          Label("End time must be after start time. Choose a later end time or turn off Set an end time.", systemImage: "exclamationmark.triangle")
            .font(.footnote).foregroundStyle(AGPTheme.clay)
        }
      } header: { Text("Display window") } footer: {
        Text("Times use your iPhone’s time zone. Only one published announcement can be active at a time.")
      }.listRowBackground(AGPTheme.paper100)
      if let error { Section { Text(error).foregroundStyle(AGPTheme.clay) }.listRowBackground(AGPTheme.paper100) }
      Section {
        if saving { ProgressView("Saving announcement…") }
        Button("Save private draft") { Task { await save(intent: "save_draft") } }
          .frame(minHeight: 44).disabled(!valid || saving || uncertain)
        Button(startsAt > Date() ? "Schedule announcement" : "Publish announcement") { confirmPublish = true }
          .frame(minHeight: 44).disabled(!valid || saving || uncertain)
      } footer: {
        Text(announcement?.status == "published" ? "Saving as a draft removes this message from player view." : "A private draft is visible only to administrators.")
      }.listRowBackground(AGPTheme.paper100)
      if uncertain { Section { Button("Back to announcements") { dismiss() }.frame(minHeight: 44) }.listRowBackground(AGPTheme.paper100) }
    }
    .disabled(saving)
    .navigationBarBackButtonHidden(saving)
    .scrollDismissesKeyboard(.interactively)
    .adminPage(announcement == nil ? "New announcement" : "Edit announcement")
    .confirmationDialog("Publish this announcement?", isPresented: $confirmPublish, titleVisibility: .visible) {
      Button("Confirm publication") { Task { await save(intent: "publish") } }
      Button("Cancel", role: .cancel) {}
    } message: { Text("“\(title)” will be visible to players starting \(startsAt.formatted()).") }
    .alert("Announcement saved", isPresented: Binding(get: { result != nil }, set: { if !$0 { result = nil; dismiss() } })) {
      Button("Done") { result = nil; dismiss() }
    } message: { Text(result ?? "") }
  }
  private func save(intent: String) async {
    guard valid, !saving, !uncertain else { return }
    saving = true
    error = nil
    defer { saving = false }
    do {
      let response = try await client.send(AdminCommand(action: "announcement", intent: intent,
        id: announcement?.id, title: title, body: message, startsAt: startsAt.ISO8601Format(),
        expiresAt: hasExpiry ? expiresAt.ISO8601Format() : ""))
      if response.ok { result = response.message } else { error = response.message }
    } catch {
      uncertain = true
      self.error = "The save could not be confirmed. Go back and refresh announcements before retrying, so you don’t publish a duplicate."
    }
  }
}
