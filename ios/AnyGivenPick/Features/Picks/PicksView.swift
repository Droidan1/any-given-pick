import ClerkKit
import SwiftUI

struct PicksView: View {
  @Environment(Clerk.self) private var clerk
  @Environment(AppModel.self) private var appModel

  var body: some View {
    ZStack {
      CallSheetBackground()

      ScrollView {
        LazyVStack(spacing: 0) {
          BrandHeader(
            eyebrow: appModel.bootstrap?.currentWeek?.label ?? "Pick entry",
            title: headerTitle,
            message: picksMessage
          )

          if let bootstrap = appModel.bootstrap,
             !bootstrap.user.account.canParticipate {
            FeatureStatusPanel(
              symbol: "person.badge.clock",
              label: "Read-only access",
              title: "Commissioner review",
              message: bootstrap.user.account.reasonLabel
            )
          } else if let bootstrap = appModel.bootstrap,
                    let week = bootstrap.currentWeek {
            weekContent(week, user: bootstrap.user)
          } else {
            FeatureStatusPanel(
              symbol: "calendar.badge.clock",
              label: "No open week",
              title: "The board is clear",
              message: "The next call sheet will appear here after it is published."
            )
          }
        }
      }
      .refreshable {
        guard let weekId = appModel.bootstrap?.currentWeek?.id else { return }
        await refreshLiveBoard(weekId: weekId)
      }
    }
    .toolbar(.hidden, for: .navigationBar)
  }

  private var headerTitle: String {
    appModel.bootstrap?.currentWeek?.isLocked == true ? "Calls are locked" : "Make your picks"
  }

  private var picksMessage: String {
    guard let week = appModel.bootstrap?.currentWeek else {
      return "Waiting for the commissioner to publish the next slate."
    }
    if week.isLocked { return "This call sheet is locked. Follow the live results instead." }
    return "Make every call in your highlighted row, set the tiebreaker, then submit before \(week.deadlineLabel)."
  }

  private func weekContent(_ week: MobilePlayerWeek, user: MobileUser) -> some View {
    @Bindable var appModel = appModel
    let isOpen = !week.isLocked
    let needsTiebreaker = week.games.contains(where: \.isMondayTiebreaker)
    let selectedCount = validSelectedCount(for: week)
    let isComplete = selectedCount == week.games.count
      && (!needsTiebreaker || appModel.mondayPrediction != nil)

    return VStack(spacing: 0) {
      HStack(spacing: 12) {
        Label("\(selectedCount)/\(week.games.count) calls", systemImage: "checkmark.circle")
        Spacer()
        Text(week.isLocked ? "LOCKED" : "OPEN UNTIL \(week.deadlineLabel.uppercased())")
          .multilineTextAlignment(.trailing)
          .foregroundStyle(week.isLocked ? AGPTheme.clay : AGPTheme.ink)
      }
      .font(AGPTheme.label(12))
      .padding(16)
      .overlay(alignment: .bottom) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }

      ScoreboardEntryMatrix(
        games: week.games,
        players: week.livePlayerPicks,
        currentUserId: user.id,
        currentDisplayName: user.displayName ?? "Your picks",
        selections: appModel.draftPicks,
        isEnabled: isOpen && user.account.canParticipate && !appModel.isSavingEntry,
        feedState: appModel.livePicksFeedState
      ) { gameId, teamCode in
        appModel.select(teamCode: teamCode, for: gameId)
      }
      .task(id: week.id) {
        guard isOpen else { return }
        await keepLiveBoardFresh(weekId: week.id)
      }

      if needsTiebreaker {
        mondayTotalSection(isEnabled: isOpen, prediction: $appModel.mondayPrediction)
      }

      entryActions(isOpen: isOpen, isComplete: isComplete, week: week)
    }
  }

  private func mondayTotalSection(
    isEnabled: Bool,
    prediction: Binding<Int?>
  ) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("MONDAY NIGHT TIEBREAKER")
        .font(AGPTheme.display(27))
        .foregroundStyle(AGPTheme.ink)
      Text("Predict the combined score of the Monday night game.")
        .foregroundStyle(AGPTheme.inkSoft)

      HStack(spacing: 0) {
        Button {
          prediction.wrappedValue = max(0, (prediction.wrappedValue ?? 45) - 1)
        } label: {
          Image(systemName: "minus")
            .frame(width: 56, height: 56)
        }
        .disabled(!isEnabled)

        Text(prediction.wrappedValue.map(String.init) ?? "—")
          .font(AGPTheme.display(34))
          .frame(maxWidth: .infinity, minHeight: 56)
          .accessibilityLabel("Predicted total \(prediction.wrappedValue ?? 0)")

        Button {
          prediction.wrappedValue = min(200, (prediction.wrappedValue ?? 44) + 1)
        } label: {
          Image(systemName: "plus")
            .frame(width: 56, height: 56)
        }
        .disabled(!isEnabled)
      }
      .foregroundStyle(AGPTheme.ink)
      .overlay(Rectangle().stroke(AGPTheme.sage, lineWidth: 1))
    }
    .padding(20)
    .overlay(alignment: .bottom) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }
  }

  private func entryActions(
    isOpen: Bool,
    isComplete: Bool,
    week: MobilePlayerWeek
  ) -> some View {
    VStack(spacing: 12) {
      if let message = appModel.entryActionMessage {
        Text(message)
          .font(.subheadline)
          .foregroundStyle(AGPTheme.paper200)
          .frame(maxWidth: .infinity, alignment: .leading)
      }

      Button {
        Task { await saveDraft(weekId: week.id) }
      } label: {
        HStack {
          Text(appModel.isSavingEntry ? "Saving…" : "Save private draft")
          Spacer()
          Image(systemName: "icloud.and.arrow.up")
        }
      }
      .buttonStyle(CallSheetSecondaryActionStyle())
      .disabled(!isOpen || appModel.isSavingEntry)

      Button {
        Task { await submitOfficialCard(weekId: week.id) }
      } label: {
        HStack {
          Text((week.entry?.currentVersionNumber ?? 0) > 0 ? "Update official card" : "Submit official card")
          Spacer()
          Image(systemName: "arrow.right")
        }
      }
      .buttonStyle(CallSheetActionStyle())
      .disabled(!isOpen || !isComplete || appModel.isSavingEntry)
    }
    .padding(20)
    .background(AGPTheme.field950)
  }

  private func keepLiveBoardFresh(weekId: String) async {
    while !Task.isCancelled {
      await refreshLiveBoard(weekId: weekId)
      do {
        try await Task.sleep(for: .seconds(15))
      } catch is CancellationError {
        return
      } catch {
        appModel.markLivePicksStale()
        return
      }
    }
  }

  private func validSelectedCount(for week: MobilePlayerWeek) -> Int {
    week.games.reduce(into: 0) { count, game in
      let selection = appModel.draftPicks[game.id]
      if selection == game.away.abbreviation || selection == game.home.abbreviation {
        count += 1
      }
    }
  }

  private func refreshLiveBoard(weekId: String) async {
    do {
      guard let token = try await clerk.auth.getToken() else {
        appModel.markLivePicksStale()
        return
      }
      await appModel.refreshLivePicks(token: token, weekId: weekId)
    } catch is CancellationError {
      return
    } catch {
      appModel.markLivePicksStale()
    }
  }

  private func saveDraft(weekId: String) async {
    do {
      guard let token = try await clerk.auth.getToken() else { return }
      await appModel.saveDraft(token: token)
      await appModel.refreshLivePicks(token: token, weekId: weekId)
    } catch {
      appModel.showEntryError("Your sign-in session expired. Sign in again and retry the save.")
    }
  }

  private func submitOfficialCard(weekId: String) async {
    do {
      guard let token = try await clerk.auth.getToken() else { return }
      await appModel.submitEntry(token: token)
      await appModel.refreshLivePicks(token: token, weekId: weekId)
    } catch {
      appModel.showEntryError("Your sign-in session expired. Sign in again and retry the submission.")
    }
  }
}
