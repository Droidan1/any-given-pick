import ActivityKit
import SwiftUI
import WidgetKit

struct WeekRaceLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: WeekRaceAttributes.self) { context in
      LockScreenRaceView(context: context)
        .activityBackgroundTint(WidgetTheme.field)
        .activitySystemActionForegroundColor(WidgetTheme.maize)
        .widgetURL(URL(string: "anygivenpick://race"))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 2) {
            Text(context.attributes.weekLabel.uppercased())
              .font(.caption2.bold())
              .foregroundStyle(WidgetTheme.sage)
            Text("\(context.state.correctPicks) RIGHT")
              .font(.headline.bold())
              .foregroundStyle(WidgetTheme.maize)
          }
        }

        DynamicIslandExpandedRegion(.trailing) {
          if let rank = context.state.rank {
            VStack(alignment: .trailing, spacing: 2) {
              Text("RANK")
                .font(.caption2.bold())
                .foregroundStyle(WidgetTheme.sage)
              Text("#\(rank)")
                .font(.headline.bold())
                .foregroundStyle(WidgetTheme.paper)
            }
          }
        }

        DynamicIslandExpandedRegion(.bottom) {
          HStack {
            Text(context.state.liveSummary)
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(WidgetTheme.paper)
            Spacer()
            Text("\(context.state.completedGames)/\(context.state.totalGames) FINAL")
              .font(.caption.bold())
              .foregroundStyle(WidgetTheme.maize)
          }
        }
      } compactLeading: {
        Image(systemName: "checkmark")
          .font(.caption.bold())
          .foregroundStyle(WidgetTheme.maize)
      } compactTrailing: {
        Text("\(context.state.correctPicks)/\(context.state.completedGames)")
          .font(.caption.bold())
          .foregroundStyle(WidgetTheme.paper)
      } minimal: {
        Text("\(context.state.correctPicks)")
          .font(.caption2.bold())
          .foregroundStyle(WidgetTheme.maize)
      }
      .keylineTint(WidgetTheme.maize)
      .widgetURL(URL(string: "anygivenpick://race"))
    }
  }
}

private struct LockScreenRaceView: View {
  let context: ActivityViewContext<WeekRaceAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        VStack(alignment: .leading, spacing: 1) {
          Text("ANY GIVEN PICK")
            .font(.caption.bold())
            .foregroundStyle(WidgetTheme.maize)
          Text(context.attributes.weekLabel.uppercased())
            .font(.headline.bold())
            .foregroundStyle(WidgetTheme.paper)
        }

        Spacer()

        if let rank = context.state.rank {
          Text("#\(rank)")
            .font(.title.bold())
            .foregroundStyle(WidgetTheme.maize)
            .accessibilityLabel("Rank \(rank)")
        }
      }

      HStack(alignment: .firstTextBaseline) {
        Text("\(context.state.correctPicks)")
          .font(.system(size: 38, weight: .black, design: .default).width(.condensed))
          .foregroundStyle(WidgetTheme.paper)
        Text("RIGHT")
          .font(.headline.bold())
          .foregroundStyle(WidgetTheme.sage)
        Spacer()
        Text("\(context.state.completedGames)/\(context.state.totalGames) FINAL")
          .font(.caption.bold())
          .foregroundStyle(WidgetTheme.maize)
      }

      Text(context.state.liveSummary)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(WidgetTheme.paper)
        .lineLimit(1)
    }
    .padding(16)
  }
}

private enum WidgetTheme {
  static let field = Color(red: 0.035, green: 0.145, blue: 0.102)
  static let paper = Color(red: 0.973, green: 0.957, blue: 0.875)
  static let maize = Color(red: 0.953, green: 0.796, blue: 0.075)
  static let sage = Color(red: 0.655, green: 0.635, blue: 0.529)
}

