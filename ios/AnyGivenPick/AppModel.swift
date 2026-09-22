import Foundation
import Observation

@MainActor
@Observable
final class AppModel {
  enum HealthState: Equatable {
    case idle
    case loading
    case healthy(HealthStatus)
    case failed(String)
  }

  var selectedTab: AppTab = .home
  private(set) var healthState: HealthState = .idle
  private(set) var bootstrap: MobileBootstrap?
  private(set) var isLoadingAccount = false
  private(set) var accountError: String?
  private(set) var entryActionMessage: String?
  private(set) var isSavingEntry = false
  var draftPicks: [String: String] = [:]
  var mondayPrediction: Int?
  var draftRevision = 0

  private let apiClient: APIClient

  init(apiClient: APIClient = .production) {
    self.apiClient = apiClient
  }

  func refreshHealth() async {
    healthState = .loading
    do {
      healthState = .healthy(try await apiClient.fetchHealth())
    } catch is CancellationError {
      return
    } catch {
      healthState = .failed("The server could not be reached. Pull to try again.")
    }
  }

  func loadAuthenticatedAccount(token: String) async {
    isLoadingAccount = true
    accountError = nil
    defer { isLoadingAccount = false }
    do {
      let response = try await apiClient.fetchBootstrap(token: token)
      bootstrap = response
      configureDraft(from: response.currentWeek)
    } catch is CancellationError {
      return
    } catch {
      accountError = error.localizedDescription
    }
  }

  func showAccountError(_ message: String) {
    accountError = message
  }

  func showEntryError(_ message: String) {
    entryActionMessage = message
  }

  func clearAuthenticatedAccount() {
    bootstrap = nil
    accountError = nil
    entryActionMessage = nil
    draftPicks = [:]
    mondayPrediction = nil
    draftRevision = 0
    selectedTab = .home
  }

  func select(teamCode: String, for gameId: String) {
    draftPicks[gameId] = teamCode
    entryActionMessage = nil
  }

  func saveDraft(token: String) async {
    guard let week = bootstrap?.currentWeek else { return }
    isSavingEntry = true
    entryActionMessage = "Saving your calls…"
    defer { isSavingEntry = false }
    do {
      let result = try await apiClient.saveDraft(
        token: token,
        payload: EntryMutationPayload(
          weekId: week.id,
          picks: draftPicks,
          mondayPrediction: mondayPrediction,
          baseDraftRevision: draftRevision
        )
      )
      applyEntryResult(result)
    } catch {
      entryActionMessage = error.localizedDescription
    }
  }

  func submitEntry(token: String) async {
    guard let week = bootstrap?.currentWeek else { return }
    isSavingEntry = true
    entryActionMessage = "Submitting your official card…"
    defer { isSavingEntry = false }
    do {
      let result = try await apiClient.submitEntry(
        token: token,
        payload: EntrySubmissionPayload(
          weekId: week.id,
          picks: draftPicks,
          mondayPrediction: mondayPrediction,
          baseDraftRevision: draftRevision,
          submissionKey: UUID().uuidString.lowercased()
        )
      )
      applyEntryResult(result)
      if result.ok {
        let refreshed = try await apiClient.fetchBootstrap(token: token)
        bootstrap = refreshed
        configureDraft(from: refreshed.currentWeek)
      }
    } catch {
      entryActionMessage = error.localizedDescription
    }
  }

  func refreshResults(token: String) async {
    guard var current = bootstrap else { return }
    do {
      let results = try await apiClient.fetchResults(token: token)
      current = MobileBootstrap(
        serverNow: current.serverNow,
        user: current.user,
        currentWeek: current.currentWeek,
        results: results
      )
      bootstrap = current
    } catch is CancellationError {
      return
    } catch {
      accountError = error.localizedDescription
    }
  }

  private func configureDraft(from week: MobilePlayerWeek?) {
    draftPicks = week?.entry?.draftPicks ?? [:]
    mondayPrediction = week?.entry?.mondayPrediction
    draftRevision = week?.entry?.draftRevision ?? 0
    entryActionMessage = week?.entry == nil ? nil : "Your saved card is loaded."
  }

  private func applyEntryResult(_ result: MobileEntryActionResult) {
    entryActionMessage = result.message
    if let revision = result.draftRevision ?? result.receipt?.draftRevision {
      draftRevision = revision
    }
    if let serverDraft = result.serverDraft {
      draftPicks = serverDraft.picks
      mondayPrediction = serverDraft.mondayPrediction
      draftRevision = serverDraft.draftRevision
      entryActionMessage = "A newer draft from another device was restored."
    }
  }
}
