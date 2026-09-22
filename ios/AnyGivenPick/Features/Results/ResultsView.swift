import ClerkKit
import SwiftUI

struct ResultsView: View {
  @Environment(Clerk.self) private var clerk
  @Environment(AppModel.self) private var appModel

  var body: some View {
    ZStack {
      CallSheetBackground()

      ScrollView {
        LazyVStack(spacing: 0) {
          BrandHeader(
            eyebrow: "Weekly results",
            title: "Follow every finish",
            message: "Official cards reveal at the deadline and scores update from the same trusted feed as the web app."
          )

          ResultsHubNavigation()

          resultsContent
        }
      }
      .refreshable {
        await refreshResults()
      }
    }
    .toolbar(.hidden, for: .navigationBar)
  }

  @ViewBuilder
  private var resultsContent: some View {
    if let results = appModel.bootstrap?.results {
      switch results.revealStatus {
      case "no_week":
        FeatureStatusPanel(
          symbol: "calendar.badge.clock",
          label: "No results yet",
          title: "The board is clear",
          message: "Completed call sheets will appear here."
        )
      case "open":
        FeatureStatusPanel(
          symbol: "lock.shield",
          label: results.selectedWeek?.label ?? "Current week",
          title: "Cards stay sealed",
          message: "Every official card becomes visible to approved players after the server-controlled deadline."
        )
      default:
        revealedResults(results)
      }
    } else {
      FeatureStatusPanel(
        symbol: "person.badge.clock",
        label: "Player access",
        title: "Results unavailable",
        message: appModel.bootstrap?.user.account.reasonLabel ?? "Your results are still loading."
      )
    }
  }

  private func revealedResults(_ results: MobileWeeklyResults) -> some View {
    VStack(spacing: 0) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 5) {
          Text("SCOREBOARD")
            .font(AGPTheme.label())
            .foregroundStyle(AGPTheme.clay)
          Text((results.selectedWeek?.label ?? "Results").uppercased())
            .font(AGPTheme.display(32))
            .foregroundStyle(AGPTheme.ink)
        }
        Spacer()
        Text("\(results.entries.count) CARDS")
          .font(AGPTheme.label())
      }
      .padding(20)
      .overlay(alignment: .bottom) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }

      if results.entries.isEmpty {
        FeatureStatusPanel(
          symbol: "rectangle.stack.badge.minus",
          label: "Official cards",
          title: "No entries",
          message: "No player submitted an official card before this deadline."
        )
      } else {
        ForEach(results.entries) { entry in
          ResultEntryCard(entry: entry)
        }
      }
    }
  }

  private func refreshResults() async {
    do {
      guard let token = try await clerk.auth.getToken() else { return }
      await appModel.refreshResults(token: token)
    } catch {
      return
    }
  }
}

private struct ResultsHubNavigation: View {
  var body: some View {
    HStack(spacing: 0) {
      destination(
        route: .standings,
        symbol: "chart.bar.fill",
        eyebrow: "Season",
        title: "Standings"
      )

      destination(
        route: .achievements,
        symbol: "medal.fill",
        eyebrow: "Your",
        title: "Achievements"
      )
    }
    .background(AGPTheme.paper200)
    .overlay(alignment: .bottom) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }
  }

  private func destination(
    route: AppRoute,
    symbol: String,
    eyebrow: String,
    title: String
  ) -> some View {
    NavigationLink(value: route) {
      HStack(spacing: 12) {
        Image(systemName: symbol)
          .font(.system(size: 23, weight: .bold))
          .frame(width: 30)

        VStack(alignment: .leading, spacing: 2) {
          Text(eyebrow.uppercased())
            .font(AGPTheme.label(10))
            .foregroundStyle(AGPTheme.clay)
          Text(title.uppercased())
            .font(AGPTheme.label(16))
        }

        Spacer(minLength: 4)
        Image(systemName: "chevron.right")
          .font(.caption.bold())
      }
      .foregroundStyle(AGPTheme.ink)
      .frame(maxWidth: .infinity, minHeight: 72)
      .padding(.horizontal, 14)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .overlay(alignment: route == .standings ? .trailing : .leading) {
      Rectangle().fill(AGPTheme.sage).frame(width: route == .standings ? 1 : 0)
    }
  }
}

private struct ResultEntryCard: View {
  let entry: MobileResultEntry

  var body: some View {
    DisclosureGroup {
      VStack(spacing: 0) {
        ForEach(entry.picks) { pick in
          ResultPickRow(pick: pick)
        }
        HStack {
          Text("Tiebreaker")
          Spacer()
          Text("\(entry.mondayPrediction)")
            .font(AGPTheme.display(22))
        }
        .padding(.vertical, 12)
      }
    } label: {
      HStack(spacing: 12) {
        Image(systemName: entry.isCurrentUser ? "person.crop.circle.fill" : "person.crop.circle")
          .font(.system(size: 30))
        VStack(alignment: .leading, spacing: 3) {
          Text(entry.displayName)
            .font(AGPTheme.label(17))
          Text(entry.isCurrentUser ? "YOUR OFFICIAL CARD" : "OFFICIAL VERSION \(entry.versionNumber)")
            .font(AGPTheme.label(11))
            .foregroundStyle(AGPTheme.inkSoft)
        }
        Spacer()
        VStack(alignment: .trailing, spacing: 2) {
          Text("\(entry.correctPicks)")
            .font(AGPTheme.display(30))
          Text("OF \(entry.gradedPicks) GRADED")
            .font(AGPTheme.label(10))
        }
      }
    }
    .tint(AGPTheme.ink)
    .padding(20)
    .background(entry.isCurrentUser ? AGPTheme.maize.opacity(0.22) : Color.clear)
    .overlay(alignment: .bottom) { Rectangle().fill(AGPTheme.sage).frame(height: 1) }
  }
}

private struct ResultPickRow: View {
  let pick: MobileResultPick

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: outcomeSymbol)
        .foregroundStyle(outcomeColor)
        .frame(width: 22)
      VStack(alignment: .leading, spacing: 3) {
        Text("\(pick.awayTeamCode) @ \(pick.homeTeamCode)")
          .font(AGPTheme.label())
        Text(scoreLabel)
          .font(.caption)
          .foregroundStyle(AGPTheme.inkSoft)
      }
      Spacer()
      Text(pick.selectedTeamCode)
        .font(AGPTheme.display(23))
    }
    .padding(.vertical, 11)
  }

  private var scoreLabel: String {
    guard let away = pick.awayScore, let home = pick.homeScore else {
      return pick.gameStatus.replacingOccurrences(of: "_", with: " ").capitalized
    }
    return "\(pick.awayTeamCode) \(away) · \(pick.homeTeamCode) \(home)"
  }

  private var outcomeSymbol: String {
    switch pick.outcome {
    case "won": "checkmark.circle.fill"
    case "lost": "xmark.circle.fill"
    case "tie": "equal.circle.fill"
    default: "clock"
    }
  }

  private var outcomeColor: Color {
    switch pick.outcome {
    case "lost": AGPTheme.clay
    default: AGPTheme.ink
    }
  }
}

struct FeatureStatusPanel: View {
  let symbol: String
  let label: String
  let title: String
  let message: String

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Image(systemName: symbol)
        .font(.system(size: 28, weight: .bold))
        .foregroundStyle(AGPTheme.ink)
      Text(label.uppercased())
        .font(AGPTheme.label())
        .tracking(1.2)
        .foregroundStyle(AGPTheme.clay)
      Text(title.uppercased())
        .font(AGPTheme.display(34))
        .foregroundStyle(AGPTheme.ink)
      Text(message)
        .font(.body)
        .foregroundStyle(AGPTheme.inkSoft)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(24)
  }
}
