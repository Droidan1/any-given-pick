import ActivityKit
import SwiftUI
import WidgetKit

struct PickLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: PickActivityAttributes.self) { context in
      PickActivityCard(attributes: context.attributes, state: context.state, stale: context.isStale)
        .activityBackgroundTint(ActivityColors.field)
        .activitySystemActionForegroundColor(ActivityColors.maize)
        .widgetURL(context.attributes.destinationURL)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.center) {
          PickActivityCard(attributes: context.attributes, state: context.state, stale: context.isStale)
        }
      } compactLeading: {
        Image(systemName: context.attributes.isTest == true ? "testtube.2" : context.attributes.kind == .deadline ? "timer" : context.attributes.kind == .game ? "sportscourt" : "flag.checkered")
          .foregroundStyle(ActivityColors.maize)
      } compactTrailing: {
        compact(context)
      } minimal: {
        Image(systemName: context.attributes.isTest == true ? "testtube.2" : context.isStale ? "clock.badge.exclamationmark" : "checkmark")
          .foregroundStyle(ActivityColors.maize)
      }
      .keylineTint(ActivityColors.maize).widgetURL(context.attributes.destinationURL)
    }
  }
  @ViewBuilder private func compact(_ context: ActivityViewContext<PickActivityAttributes>) -> some View {
    if context.isStale { Image(systemName: "clock.badge.exclamationmark") }
    else if context.attributes.kind == .deadline, context.state.deadlineDate > Date() {
      Text(timerInterval: Date()...context.state.deadlineDate, countsDown: true).monospacedDigit().frame(width: 48)
    } else if context.attributes.kind == .game {
      Text("\(context.state.awayScore.map(String.init) ?? "–"):\(context.state.homeScore.map(String.init) ?? "–")").monospacedDigit()
    } else { Text(context.state.rank.map { "#\($0)" } ?? "—").monospacedDigit() }
  }
}
