import SwiftUI

enum NFLTeamLogo {
  private static let espnCodes: [String: String] = [
    "ARI": "ari", "ATL": "atl", "BAL": "bal", "BUF": "buf",
    "CAR": "car", "CHI": "chi", "CIN": "cin", "CLE": "cle",
    "DAL": "dal", "DEN": "den", "DET": "det", "GB": "gb",
    "HOU": "hou", "IND": "ind", "JAX": "jax", "KC": "kc",
    "LAC": "lac", "LAR": "lar", "LV": "lv", "MIA": "mia",
    "MIN": "min", "NE": "ne", "NO": "no", "NYG": "nyg",
    "NYJ": "nyj", "PHI": "phi", "PIT": "pit", "SEA": "sea",
    "SF": "sf", "TB": "tb", "TEN": "ten", "WAS": "wsh",
  ]

  private static let aliases: [String: String] = [
    "JAC": "JAX", "OAK": "LV", "SD": "LAC", "STL": "LAR", "WSH": "WAS",
  ]

  static func canonicalCode(_ code: String) -> String {
    let normalized = code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    return aliases[normalized] ?? normalized
  }

  static func url(for code: String) -> URL? {
    guard let espnCode = espnCodes[canonicalCode(code)] else { return nil }
    return URL(string: "https://a.espncdn.com/i/teamlogos/nfl/500/\(espnCode).png")
  }
}

struct NativeTeamCrest: View {
  let code: String
  var size: CGFloat = 28

  var body: some View {
    AsyncImage(url: NFLTeamLogo.url(for: code), transaction: Transaction(animation: .easeOut(duration: 0.2))) { phase in
      switch phase {
      case .success(let image):
        image
          .resizable()
          .interpolation(.high)
          .scaledToFit()
      case .empty:
        ProgressView()
          .controlSize(.mini)
          .tint(AGPTheme.inkSoft)
      case .failure:
        crestFallback
      @unknown default:
        crestFallback
      }
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }

  private var crestFallback: some View {
    ZStack {
      Circle().fill(AGPTheme.paper200)
      Text(NFLTeamLogo.canonicalCode(code).prefix(1))
        .font(AGPTheme.label(max(10, size * 0.42)))
        .foregroundStyle(AGPTheme.ink)
    }
  }
}
