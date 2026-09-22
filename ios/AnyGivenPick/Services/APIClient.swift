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

  func fetchLiveRace(token: String) async throws -> MobileLiveRace {
    let envelope: MobileLiveRaceEnvelope = try await authenticatedRequest(
      path: "api/mobile/v1/race",
      method: "GET",
      token: token,
      responseType: MobileLiveRaceEnvelope.self
    )
    return envelope.race
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
