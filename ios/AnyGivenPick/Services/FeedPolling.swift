import Foundation
import Observation

enum FeedRefreshOutcome: Equatable {
  case success
  case skipped
  case cancelled
  case retry(after: TimeInterval?)
  case blocked(String)

  static func failure(_ error: Error) -> Self {
    if Task.isCancelled || error is CancellationError || (error as? URLError)?.code == .cancelled { return .cancelled }
    if case APIError.server(let message, let code, let retryAfter) = error {
      if (400..<500).contains(code), code != 408, code != 429 { return .blocked(message) }
      return .retry(after: retryAfter)
    }
    return .retry(after: nil)
  }
}

/// One owner per visible feed. Cancellation never counts as a failed request.
/// Retry deadlines survive scene/tab changes; manual refresh cannot bypass Retry-After.
@MainActor @Observable
final class FeedPolling {
  let baseInterval: TimeInterval
  private(set) var failures = 0
  private(set) var retryAt: Date?
  private(set) var blockedReason: String?
  private(set) var lastSuccessAt: Date?
  private(set) var isRefreshing = false
  private(set) var isPaused = false
  private var serverNotBefore: Date?
  private var context: String?
  private var generation = UUID()
  private var loopID = UUID()
  private let now: () -> Date

  init(baseInterval: TimeInterval, now: @escaping () -> Date = Date.init) {
    self.baseInterval = baseInterval
    self.now = now
  }

  func prepare(context: String) {
    guard self.context != context else { return }
    self.context = context
    generation = UUID()
    failures = 0
    retryAt = nil
    serverNotBefore = nil
    blockedReason = nil
    lastSuccessAt = nil
  }

  func status(fallback: AppModel.LivePicksFeedState = .idle) -> AppModel.LivePicksFeedState {
    if isPaused { return .paused }
    if let blockedReason { return .blocked(blockedReason) }
    if isRefreshing { return .refreshing }
    if let retryAt { return .retrying(retryAt) }
    if let lastSuccessAt { return .live(lastSuccessAt) }
    return fallback
  }

  @discardableResult
  func refresh(manual: Bool = false, operation: () async -> FeedRefreshOutcome) async -> FeedRefreshOutcome {
    guard !Task.isCancelled else { return .cancelled }
    guard !isRefreshing else { return .skipped }
    if let serverNotBefore, serverNotBefore > now() { return .skipped }
    if !manual {
      if let blockedReason { return .blocked(blockedReason) }
      if let retryAt, retryAt > now() { return .skipped }
    }
    let requestGeneration = generation
    isRefreshing = true
    defer { isRefreshing = false }
    let outcome = await operation()
    guard !Task.isCancelled, generation == requestGeneration else { return .cancelled }
    switch outcome {
    case .success:
      failures = 0
      retryAt = nil
      serverNotBefore = nil
      blockedReason = nil
      lastSuccessAt = now()
    case .retry(let after):
      failures = min(failures + 1, 10)
      let delay = min(300, baseInterval * pow(2, Double(failures - 1)))
      serverNotBefore = after.map { now().addingTimeInterval(max(0, $0)) }
      retryAt = now().addingTimeInterval(max(delay, after ?? 0))
      blockedReason = nil
    case .blocked(let reason):
      blockedReason = reason
      retryAt = nil
    case .cancelled, .skipped: break
    }
    return outcome
  }

  /// A nil interval means the selected race is finished. Resume still fetches once.
  func run(context: String, shouldContinue: () -> Bool, interval: () -> TimeInterval?,
    sleep: (TimeInterval) async throws -> Void = { try await Task.sleep(for: .seconds($0)) },
    operation: () async -> FeedRefreshOutcome) async {
    prepare(context: context)
    let id = UUID()
    loopID = id
    isPaused = !shouldContinue()
    defer { if loopID == id, Task.isCancelled || !shouldContinue() { isPaused = true } }
    var first = true
    var lastAttemptAt = now()
    while !Task.isCancelled, loopID == id, shouldContinue() {
      isPaused = false
      if blockedReason != nil {
        // No automatic network retries for access errors. A successful explicit
        // refresh may clear the block without requiring the view to be recreated.
        do { try await sleep(baseInterval) } catch { return }
        continue
      }
      var delay: TimeInterval = 0
      if isRefreshing { delay = 0.1 }
      else if let retryAt { delay = max(0, retryAt.timeIntervalSince(now())) }
      else if !first {
        guard let cadence = interval() else { return }
        let anchor = max(lastSuccessAt ?? lastAttemptAt, lastAttemptAt)
        delay = max(0, anchor.addingTimeInterval(cadence).timeIntervalSince(now()))
      }
      if delay > 0 {
        do { try await sleep(delay) } catch { return }
        // Recompute after manual refreshes; do not immediately duplicate their request.
        if lastSuccessAt != nil { first = false }
        continue
      }
      guard !Task.isCancelled, loopID == id, shouldContinue() else { return }
      let outcome = await refresh(operation: operation)
      lastAttemptAt = now()
      if outcome == .cancelled, Task.isCancelled || !shouldContinue() { return }
      if outcome == .skipped || outcome == .cancelled {
        // A save may supersede a home snapshot without cancelling this task.
        // Never spin on an expired retry deadline while that save is in progress.
        do { try await sleep(baseInterval) } catch { return }
      }
      first = false
    }
  }

  #if DEBUG
  func loadPreviewStatus() {
    if ProcessInfo.processInfo.arguments.contains("-preview-feed-retrying") {
      retryAt = now().addingTimeInterval(60)
    } else if ProcessInfo.processInfo.arguments.contains("-preview-feed-paused") {
      isPaused = true
    } else {
      lastSuccessAt = now()
    }
  }
  #endif
}

extension MobileLiveRace {
  /// Use the whole-race count, not gamesToFeature (a limited list).
  var pollingInterval: TimeInterval? {
    if liveCount > 0 { return 30 }
    if status == "ready", waitingCount == 0, finalCount > 0 { return nil }
    return 300
  }
}
