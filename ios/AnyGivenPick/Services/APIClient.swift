import Foundation

struct HealthStatus: Codable, Equatable, Sendable {
  let status: String
  let database: String
  let scoreSync: String
  let scoreSyncRecovery: String
  let checkedAt: String
}

struct APIClient: Sendable {
  let baseURL: URL
  let session: URLSession

  static let production = APIClient(
    baseURL: URL(string: "https://anygivenpick.app")!,
    session: .shared
  )

  static let preview = APIClient(
    baseURL: URL(string: "https://anygivenpick.app")!,
    session: .shared
  )

  func fetchHealth() async throws -> HealthStatus {
    let url = baseURL.appending(path: "api/health")
    var request = URLRequest(url: url)
    request.timeoutInterval = 10
    request.cachePolicy = .reloadRevalidatingCacheData

    let (data, response) = try await session.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse,
          (200..<300).contains(httpResponse.statusCode) else {
      throw APIError.invalidResponse
    }

    return try JSONDecoder().decode(HealthStatus.self, from: data)
  }

  func fetchBootstrap(token: String) async throws -> MobileBootstrap {
    try await authenticatedRequest(
      path: "api/mobile/v1/bootstrap",
      method: "GET",
      token: token,
      responseType: MobileBootstrap.self
    )
  }

  func liveActivitySettings(token: String, installationId: String) async throws -> LiveActivitySettings {
    var url = URLComponents(url: baseURL.appending(path: "api/mobile/v1/live-activities/device"), resolvingAgainstBaseURL: false)!
    url.queryItems = [URLQueryItem(name: "installationId", value: installationId)]
    return try await authenticatedRequest(url: url.url!, method: "GET", token: token, responseType: LiveActivitySettings.self)
  }

  // All games and the signed-in player's entry, without reloading the results leaderboard or matrix.
  func fetchHome(token: String, weekId: String? = nil) async throws -> MobileBootstrap {
    var url = URLComponents(url: baseURL.appending(path: "api/mobile/v1/bootstrap"), resolvingAgainstBaseURL: false)!
    url.queryItems = [URLQueryItem(name: "view", value: "home")]
    if let weekId { url.queryItems?.append(URLQueryItem(name: "weekId", value: weekId)) }
    return try await authenticatedRequest(url: url.url!, method: "GET", token: token, responseType: MobileBootstrap.self)
  }
  func registerLiveActivities(token: String, input: LiveActivityRegistration) async throws -> LiveActivitySettings {
    try await authenticatedRequest(path: "api/mobile/v1/live-activities/device", method: "PUT", token: token, body: input, responseType: LiveActivitySettings.self)
  }
  func removeLiveActivities(token: String, installationId: String) async throws -> LiveActivityOK {
    try await authenticatedRequest(path: "api/mobile/v1/live-activities/device", method: "DELETE", token: token,
      body: LiveActivityCommand(installationId: installationId), responseType: LiveActivityOK.self)
  }
  func followLiveGame(token: String, input: LiveActivityCommand) async throws -> LiveActivitySeed {
    try await authenticatedRequest(path: "api/mobile/v1/live-activities/session", method: "POST", token: token, body: input, responseType: LiveActivitySeed.self)
  }
  func testLiveActivity(token: String, input: LiveActivityTestCommand) async throws -> LiveActivityTestResponse {
    try await authenticatedRequest(path: "api/mobile/v1/live-activities/test", method: "POST", token: token, body: input, responseType: LiveActivityTestResponse.self)
  }
  func updateLiveActivity(token: String, input: LiveActivityCommand, stop: Bool = false) async throws -> LiveActivityOK {
    try await authenticatedRequest(path: "api/mobile/v1/live-activities/session", method: stop ? "DELETE" : "PUT", token: token, body: input, responseType: LiveActivityOK.self)
  }

  func fetchLivePicks(token: String, weekId: String) async throws -> [MobileLivePlayerPicks] {
    var components = URLComponents(
      url: baseURL.appending(path: "api/picks/live"),
      resolvingAgainstBaseURL: false
    )
    components?.queryItems = [URLQueryItem(name: "weekId", value: weekId)]
    guard let url = components?.url else { throw APIError.invalidResponse }

    let envelope: MobileLivePicksEnvelope = try await authenticatedRequest(
      url: url,
      method: "GET",
      token: token,
      responseType: MobileLivePicksEnvelope.self
    )
    return envelope.players
  }

  func fetchResults(token: String, weekId: String? = nil) async throws -> MobileWeeklyResults {
    var components = URLComponents(
      url: baseURL.appending(path: "api/mobile/v1/results"),
      resolvingAgainstBaseURL: false
    )
    if let weekId {
      components?.queryItems = [URLQueryItem(name: "weekId", value: weekId)]
    }
    guard let url = components?.url else { throw APIError.invalidResponse }
    let envelope: ResultsEnvelope = try await authenticatedRequest(
      url: url,
      method: "GET",
      token: token,
      responseType: ResultsEnvelope.self
    )
    return envelope.results
  }

  func fetchLiveRace(token: String, weekId: String? = nil) async throws -> MobileLiveRace {
    var url = URLComponents(url: baseURL.appending(path: "api/mobile/v1/race"), resolvingAgainstBaseURL: false)!
    if let weekId { url.queryItems = [URLQueryItem(name: "weekId", value: weekId)] }
    let envelope: MobileLiveRaceEnvelope = try await authenticatedRequest(
      url: url.url!,
      method: "GET",
      token: token,
      responseType: MobileLiveRaceEnvelope.self
    )
    return envelope.race
  }

  func fetchNotificationSettings(token: String, installationId: String, environment: String) async throws -> NativeNotificationSettings {
    var components = URLComponents(url: baseURL.appending(path: "api/mobile/v1/notifications/device"), resolvingAgainstBaseURL: false)!
    components.queryItems = [URLQueryItem(name: "installationId", value: installationId), URLQueryItem(name: "environment", value: environment)]
    return try await authenticatedRequest(url: components.url!, method: "GET", token: token, responseType: NativeNotificationSettings.self)
  }

  func registerNotificationDevice(token: String, input: NativeDeviceRegistration) async throws -> NativeNotificationSettings {
    try await authenticatedRequest(path: "api/mobile/v1/notifications/device", method: "PUT", token: token, body: input, responseType: NativeNotificationSettings.self)
  }

  func removeNotificationDevice(token: String, installationId: String) async throws -> NativeDeviceRemovalResult {
    try await authenticatedRequest(path: "api/mobile/v1/notifications/device", method: "DELETE", token: token,
      body: NativeDeviceRemoval(installationId: installationId), responseType: NativeDeviceRemovalResult.self)
  }

  func fetchStandings(token: String) async throws -> MobileStandingsSnapshot {
    let envelope: MobileStandingsEnvelope = try await authenticatedRequest(
      path: "api/mobile/v1/standings",
      method: "GET",
      token: token,
      responseType: MobileStandingsEnvelope.self
    )
    return envelope.standings
  }

  func fetchAchievements(token: String) async throws -> MobilePlayerAchievements {
    let envelope: MobileAchievementsEnvelope = try await authenticatedRequest(
      path: "api/mobile/v1/achievements",
      method: "GET",
      token: token,
      responseType: MobileAchievementsEnvelope.self
    )
    return envelope.achievements
  }

  func saveDraft(
    token: String,
    payload: EntryMutationPayload
  ) async throws -> MobileEntryActionResult {
    let envelope: EntryActionEnvelope = try await authenticatedRequest(
      path: "api/mobile/v1/entry/draft",
      method: "PUT",
      token: token,
      body: payload,
      responseType: EntryActionEnvelope.self
    )
    return envelope.result
  }

  func submitEntry(
    token: String,
    payload: EntrySubmissionPayload
  ) async throws -> MobileEntryActionResult {
    let envelope: EntryActionEnvelope = try await authenticatedRequest(
      path: "api/mobile/v1/entry/submit",
      method: "POST",
      token: token,
      body: payload,
      responseType: EntryActionEnvelope.self
    )
    return envelope.result
  }

  private func authenticatedRequest<Response: Decodable>(
    path: String,
    method: String,
    token: String,
    responseType: Response.Type
  ) async throws -> Response {
    try await authenticatedRequest(
      url: baseURL.appending(path: path),
      method: method,
      token: token,
      responseType: responseType
    )
  }

  private func authenticatedRequest<Body: Encodable, Response: Decodable>(
    path: String,
    method: String,
    token: String,
    body: Body,
    responseType: Response.Type
  ) async throws -> Response {
    var request = authenticatedURLRequest(
      url: baseURL.appending(path: path),
      method: method,
      token: token
    )
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(body)
    return try await perform(request, responseType: responseType)
  }

  private func authenticatedRequest<Response: Decodable>(
    url: URL,
    method: String,
    token: String,
    responseType: Response.Type
  ) async throws -> Response {
    try await perform(
      authenticatedURLRequest(url: url, method: method, token: token),
      responseType: responseType
    )
  }

  private func authenticatedURLRequest(url: URL, method: String, token: String) -> URLRequest {
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = 20
    request.cachePolicy = .reloadIgnoringLocalCacheData
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    return request
  }

  private func perform<Response: Decodable>(
    _ request: URLRequest,
    responseType: Response.Type
  ) async throws -> Response {
    let (data, response) = try await session.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw APIError.invalidResponse
    }
    guard (200..<300).contains(httpResponse.statusCode) else {
      let body = try? JSONDecoder().decode(APIErrorEnvelope.self, from: data)
      throw APIError.server(
        message: body?.error ?? "The server returned an unexpected response.",
        statusCode: httpResponse.statusCode
      )
    }
    return try JSONDecoder().decode(responseType, from: data)
  }
}

private struct APIErrorEnvelope: Decodable {
  let error: String
}

enum APIError: LocalizedError {
  case invalidResponse
  case server(message: String, statusCode: Int)

  var errorDescription: String? {
    switch self {
    case .invalidResponse:
      "The server returned an unreadable response."
    case .server(let message, _):
      message
    }
  }
}
