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
            title: "Your call sheet",
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
          } else if let week = appModel.bootstrap?.currentWeek {
            weekContent(week)
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
    }
    .toolbar(.hidden, for: .navigationBar)
  }

  private var picksMessage: String {
    guard let week = appModel.bootstrap?.currentWeek else {
      return "Waiting for the commissioner to publish the next slate."
    }
    if week.isLocked { return "This call sheet is locked. Follow the live results instead." }
    return "Pick one team in every matchup, set the Monday total, then submit before \(week.deadlineLabel)."
  }

  private func weekContent(_ week: MobilePlayerWeek) -> some View {
    @Bindable var appModel = appModel
    let isOpen = !week.isLocked
    let isComplete = appModel.draftPicks.count == week.games.count
      && appModel.mondayPrediction != nil

    return VStack(spacing: 0) {
      HStack {
        Label("\(appModel.draftPicks.count)/\(week.games.count) calls", systemImage: "checkmark.circle")
        Spacer()
        Text(week.isLocked ? "LOCKED" : "OPEN")
          .foregroundStyle(week.isLocked ? AGPTheme.clay : AGPTheme.ink)
      }
      .font(AGPTheme.label())
      .padding(20)
      .overlay(alignment: .bottom) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }

      ForEach(week.games) { game in
        GamePickCard(
          game: game,
          selection: appModel.draftPicks[game.id],
          isEnabled: isOpen
        ) { teamCode in
          appModel.select(teamCode: teamCode, for: game.id)
        }
      }

      mondayTotalSection(isEnabled: isOpen, prediction: $appModel.mondayPrediction)

      if !week.livePlayerPicks.isEmpty {
        savedCallsSection(week.livePlayerPicks, gameCount: week.games.count)
      }

      VStack(spacing: 12) {
        if let message = appModel.entryActionMessage {
          Text(message)
            .font(.subheadline)
            .foregroundStyle(AGPTheme.paper200)
            .frame(maxWidth: .infinity, alignment: .leading)
        }

        Button {
          Task { await saveDraft() }
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
          Task { await submitOfficialCard() }
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

  private func savedCallsSection(
    _ players: [MobileLivePlayerPicks],
    gameCount: Int
  ) -> some View {
    DisclosureGroup {
      VStack(spacing: 0) {
        ForEach(players) { player in
          HStack {
            Text(player.displayName)
            Spacer()
            Text("\(player.picks.count)/\(gameCount) saved")
              .foregroundStyle(AGPTheme.inkSoft)
          }
          .font(.subheadline)
          .padding(.vertical, 10)
        }
      }
    } label: {
      Text("LIVE PLAYER PROGRESS")
        .font(AGPTheme.label())
    }
    .tint(AGPTheme.ink)
    .padding(20)
    .overlay(alignment: .bottom) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }
  }

  private func saveDraft() async {
    do {
      guard let token = try await clerk.auth.getToken() else { return }
      await appModel.saveDraft(token: token)
    } catch {
      appModel.showEntryError("Your sign-in session expired. Sign in again and retry the save.")
    }
  }

  private func submitOfficialCard() async {
    do {
      guard let token = try await clerk.auth.getToken() else { return }
      await appModel.submitEntry(token: token)
    } catch {
      appModel.showEntryError("Your sign-in session expired. Sign in again and retry the submission.")
    }
  }
}

private struct GamePickCard: View {
  let game: MobileGame
  let selection: String?
  let isEnabled: Bool
  let onSelect: (String) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Text("\(game.day.uppercased()) · \(game.time)")
        Spacer()
        Text(game.status.replacingOccurrences(of: "_", with: " ").uppercased())
      }
      .font(AGPTheme.label(13))
      .foregroundStyle(AGPTheme.inkSoft)

      HStack(spacing: 10) {
        teamButton(game.away, moneyline: game.odds?.awayMoneyline)
        Text("@")
          .font(AGPTheme.display(22))
          .foregroundStyle(AGPTheme.inkSoft)
        teamButton(game.home, moneyline: game.odds?.homeMoneyline)
      }

      if game.isMondayTiebreaker, let total = game.odds?.overUnder {
        Text("Monday reference total: \(total.formatted(.number.precision(.fractionLength(1))))")
          .font(.caption)
          .foregroundStyle(AGPTheme.clay)
      }
    }
    .padding(20)
    .overlay(alignment: .bottom) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }
  }

  private func teamButton(_ team: MobileTeam, moneyline: Int?) -> some View {
    let isSelected = selection == team.abbreviation
    return Button {
      onSelect(team.abbreviation)
    } label: {
      VStack(alignment: .leading, spacing: 5) {
        HStack {
          Text(team.abbreviation)
            .font(AGPTheme.display(27))
          Spacer()
          if isSelected { Image(systemName: "checkmark") }
        }
        Text(team.name)
          .font(.caption)
          .lineLimit(1)
        if let moneyline {
          Text(moneyline > 0 ? "+\(moneyline)" : "\(moneyline)")
            .font(AGPTheme.label(12))
        }
      }
      .foregroundStyle(AGPTheme.ink)
      .frame(maxWidth: .infinity, minHeight: 82, alignment: .leading)
      .padding(12)
      .background(isSelected ? AGPTheme.maize : AGPTheme.paper100)
      .overlay(Rectangle().stroke(isSelected ? AGPTheme.field950 : AGPTheme.sage, lineWidth: isSelected ? 2 : 1))
    }
    .buttonStyle(.plain)
    .disabled(!isEnabled)
    .accessibilityLabel("Pick \(team.name)\(moneyline.map { ", moneyline \($0)" } ?? "")")
    .accessibilityAddTraits(isSelected ? .isSelected : [])
  }
}
