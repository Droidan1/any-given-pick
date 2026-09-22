import SwiftUI

enum ActivityColors {
  static let field = Color(red: 0.035, green: 0.145, blue: 0.102)
  static let paper = Color(red: 0.973, green: 0.957, blue: 0.875)
  static let maize = Color(red: 0.953, green: 0.796, blue: 0.075)
}

/// Shared by the actual widget and the in-app preview, so mobile previews exercise the shipped layout.
struct PickActivityCard: View {
  let attributes: PickActivityAttributes
  let state: PickActivityAttributes.ContentState
  var stale = false

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .firstTextBaseline) {
        Label("ANY GIVEN PICK", systemImage: symbol).font(.caption.bold()).foregroundStyle(ActivityColors.maize)
        Spacer(minLength: 6)
        Text(attributes.weekLabel).font(.caption.bold()).lineLimit(1)
      }
      switch attributes.kind {
      case .deadline:
        HStack(alignment: .center) {
          VStack(alignment: .leading, spacing: 3) {
            Text("CARD LOCKS IN").font(.caption.bold())
            Text("\(state.picksSaved)/\(state.totalGames) picks saved").font(.subheadline)
          }
          Spacer(minLength: 8)
          if state.deadlineDate > Date() {
            Text(timerInterval: Date()...state.deadlineDate, countsDown: true)
              .monospacedDigit().font(.system(size: 30, weight: .black, design: .rounded))
              .frame(maxWidth: 132, alignment: .trailing).foregroundStyle(ActivityColors.maize)
              .accessibilityLabel("Time remaining until your card locks")
          } else { Text("LOCKED").font(.headline.bold()) }
        }
        Text("Tap to finish and submit").font(.caption)
      case .game:
        HStack {
          team(state.awayCode, score: state.awayScore)
          Spacer(minLength: 10)
          Text(stale ? "DELAYED" : state.gameStatus == "in_progress" ? "LIVE" : state.gameStatus.replacingOccurrences(of: "_", with: " ").uppercased())
            .font(.caption2.bold()).foregroundStyle(ActivityColors.maize)
          Spacer(minLength: 10)
          team(state.homeCode, score: state.homeScore)
        }
        HStack {
          if state.gameStatus == "scheduled" { Text(state.deadlineDate, style: .time).font(.caption) }
          else { Text(state.clock.isEmpty ? state.detail : state.clock).font(.caption) }
          Spacer()
          Text("Following game").font(.caption)
        }
      case .race:
        HStack(alignment: .firstTextBaseline, spacing: 12) {
          metric(state.rank.map { "#\($0)" } ?? "—", label: "PROJECTED")
          Spacer(minLength: 0)
          metric("\(state.correct)", label: "CORRECT")
          Spacer(minLength: 0)
          metric("\(state.remaining)", label: "TO GO")
        }
        Text(state.behind == 0 ? "Level with the projected lead · \(state.playerCount) players" : "\(state.behind) picks off the projected lead · \(state.playerCount) players")
          .font(.caption).lineLimit(2)
      }
      if stale {
        Label("Updates delayed · Open app to refresh", systemImage: "clock.badge.exclamationmark")
          .font(.caption2.bold()).foregroundStyle(ActivityColors.maize)
      }
    }
    // Lock Screen activities have a 160pt presentation limit. Keep the compact card within it;
    // full-size settings and in-app game screens still support the entire Dynamic Type range.
    .dynamicTypeSize(...DynamicTypeSize.xLarge)
    .foregroundStyle(ActivityColors.paper).padding(12).background(ActivityColors.field)
    .accessibilityElement(children: .contain)
  }
  private var symbol: String {
    switch attributes.kind { case .deadline: "timer"; case .game: "sportscourt"; case .race: "flag.checkered" }
  }
  private func team(_ code: String, score: Int?) -> some View {
    HStack(spacing: 8) {
      Text(code).font(.headline.bold())
      Text(score.map(String.init) ?? "—").font(.title2.bold()).monospacedDigit()
    }.accessibilityElement(children: .combine)
  }
  private func metric(_ value: String, label: String) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(value).font(.system(size: 28, weight: .black, design: .rounded)).foregroundStyle(ActivityColors.maize)
      Text(label).font(.caption2.bold())
    }.accessibilityElement(children: .combine)
  }
}

#Preview("All Live Activities", traits: .sizeThatFitsLayout) {
  VStack(spacing: 16) {
    PickActivityCard(attributes: .example(.deadline), state: PickActivityAttributes.exampleState)
    PickActivityCard(attributes: .example(.game), state: PickActivityAttributes.exampleState)
    PickActivityCard(attributes: .example(.race), state: PickActivityAttributes.exampleState)
  }.frame(width: 375).padding()
}
