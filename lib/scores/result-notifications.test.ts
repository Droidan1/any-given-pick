import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  after: vi.fn(), emailQueue: vi.fn(), emailSend: vi.fn(), pushQueue: vi.fn(), pushSend: vi.fn(),
  nativeQueue: vi.fn(), nativeSend: vi.fn(), report: vi.fn(), resolve: vi.fn(),
}));
vi.mock("next/server", () => ({ after: mock.after }));
vi.mock("@/lib/email/player-notifications", () => ({ queueAvailableResultsEmails: mock.emailQueue, processQueuedPlayerEmails: mock.emailSend }));
vi.mock("@/lib/push/player-notifications", () => ({ queueAvailableResultsPushes: mock.pushQueue, processQueuedPlayerPushes: mock.pushSend }));
vi.mock("@/lib/native-push/player-notifications", () => ({ queueAvailableNativeResults: mock.nativeQueue, processNativePushes: mock.nativeSend }));
vi.mock("@/lib/monitoring/operational-alerts", () => ({ reportOperationalIssue: mock.report, resolveOperationalIssue: mock.resolve }));
import { deliverAvailableResultsNotifications, scheduleResultsNotifications } from "./result-notifications";

const now = new Date("2026-09-29T03:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  for (const queue of [mock.emailQueue, mock.pushQueue, mock.nativeQueue]) queue.mockResolvedValue(1);
  for (const send of [mock.emailSend, mock.pushSend, mock.nativeSend]) send.mockResolvedValue({ failed: 0 });
});

describe("score-triggered results notifications", () => {
  it("defers all delivery until after the score response", async () => {
    scheduleResultsNotifications(now);
    expect(mock.after).toHaveBeenCalledOnce();
    expect(mock.emailQueue).not.toHaveBeenCalled();
    await mock.after.mock.calls[0][0]();
    for (const queue of [mock.emailQueue, mock.pushQueue, mock.nativeQueue]) expect(queue).toHaveBeenCalledWith(now);
    expect(mock.emailSend).toHaveBeenCalledWith({ now });
    expect(mock.pushSend).toHaveBeenCalledWith({ now });
    expect(mock.nativeSend).toHaveBeenCalledWith(now);
    expect(mock.resolve).toHaveBeenCalledWith("player_notification_queue", "results_available");
  });

  it("waits for the other channels when one queue fails and reports a sanitized failure", async () => {
    mock.emailQueue.mockRejectedValue(new Error("private provider details"));
    await deliverAvailableResultsNotifications(now);
    expect(mock.emailSend).not.toHaveBeenCalled();
    expect(mock.pushSend).toHaveBeenCalledOnce();
    expect(mock.nativeSend).toHaveBeenCalledOnce();
    expect(mock.report).toHaveBeenCalledWith(expect.objectContaining({ context: { failed_channels: 1 } }));
    expect(JSON.stringify(mock.report.mock.calls)).not.toContain("private provider details");
    expect(mock.resolve).not.toHaveBeenCalled();
  });

  it("reports rejected deliveries as failures even when the worker resolves", async () => {
    mock.nativeSend.mockResolvedValue({ failed: 1 });
    await deliverAvailableResultsNotifications(now);
    expect(mock.report).toHaveBeenCalledWith(expect.objectContaining({ context: { failed_channels: 1 } }));
  });

  it("cannot turn a successful score update into a failure if scheduling is unavailable", () => {
    mock.after.mockImplementation(() => { throw new Error("No request context"); });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => scheduleResultsNotifications(now)).not.toThrow();
    expect(mock.nativeSend).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("handles errors in the background task without an unhandled rejection", async () => {
    mock.resolve.mockRejectedValue(new Error("database unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    scheduleResultsNotifications(now);
    await expect(mock.after.mock.calls[0][0]()).resolves.toBeUndefined();
    log.mockRestore();
  });
});
