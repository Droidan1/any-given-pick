import {
  AlertEscalationBuilder,
  Frequency,
  RetryStrategyBuilder,
  UrlAssertionBuilder,
  UrlMonitor,
} from "checkly/constructs";
import { brianOperationsEmail } from "./alert-channels";

new UrlMonitor("production-health", {
  name: "Any Given Pick production health",
  description:
    "Checks database availability and score-sync freshness. The endpoint enforces a 40-minute freshness window during NFL game windows and a 30-hour backstop outside them.",
  activated: true,
  muted: false,
  frequency: Frequency.EVERY_10M,
  locations: ["us-east-2"],
  tags: ["production", "health", "game-window"],
  alertChannels: [brianOperationsEmail],
  alertEscalationPolicy: AlertEscalationBuilder.runBasedEscalation(1, {
    amount: 1,
    interval: 10,
  }),
  retryStrategy: RetryStrategyBuilder.singleRetry({
    baseBackoffSeconds: 30,
    sameRegion: false,
  }),
  degradedResponseTime: 3000,
  maxResponseTime: 10000,
  request: {
    url: "https://anygivenpick.app/api/health",
    ipFamily: "IPv4",
    followRedirects: false,
    assertions: [UrlAssertionBuilder.statusCode().equals(200)],
  },
});
