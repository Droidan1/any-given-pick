import SwiftUI

enum AGPTheme {
  static let field950 = Color(red: 0.035, green: 0.145, blue: 0.102)
  static let field900 = Color(red: 0.047, green: 0.200, blue: 0.141)
  static let field800 = Color(red: 0.090, green: 0.294, blue: 0.216)
  static let paper100 = Color(red: 0.973, green: 0.957, blue: 0.875)
  static let paper200 = Color(red: 0.910, green: 0.875, blue: 0.776)
  static let ink = Color(red: 0.075, green: 0.216, blue: 0.157)
  static let inkSoft = Color(red: 0.294, green: 0.404, blue: 0.345)
  static let maize = Color(red: 0.953, green: 0.796, blue: 0.075)
  static let maizeDeep = Color(red: 0.831, green: 0.624, blue: 0.000)
  static let clay = Color(red: 0.722, green: 0.286, blue: 0.118)
  static let sage = Color(red: 0.655, green: 0.635, blue: 0.529)

  static func display(_ size: CGFloat) -> Font {
    .system(size: size, weight: .bold, design: .default).width(.condensed)
  }

  static func label(_ size: CGFloat = 15) -> Font {
    .system(size: size, weight: .bold, design: .default).width(.condensed)
  }
}

struct CallSheetBackground: View {
  var body: some View {
    AGPTheme.paper100
      .ignoresSafeArea()
  }
}

struct BrandHeader: View {
  let eyebrow: String
  let title: String
  let message: String

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(spacing: 12) {
        AppBrandMark()
          .frame(width: 42, height: 42)
          .accessibilityHidden(true)

        VStack(alignment: .leading, spacing: 0) {
          Text("ANY GIVEN")
            .font(AGPTheme.label(13))
            .foregroundStyle(AGPTheme.sage)
            .tracking(1.5)
          Text("PICK")
            .font(AGPTheme.display(24))
            .foregroundStyle(AGPTheme.maize)
            .tracking(1.5)
        }
      }

      Text(eyebrow.uppercased())
        .font(AGPTheme.label())
        .foregroundStyle(AGPTheme.maize)
        .tracking(1.4)

      Text(title.uppercased())
        .font(AGPTheme.display(48))
        .foregroundStyle(AGPTheme.paper100)
        .lineSpacing(-5)
        .minimumScaleFactor(0.78)

      Text(message)
        .font(.body)
        .foregroundStyle(AGPTheme.paper200)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 24)
    .padding(.top, 24)
    .padding(.bottom, 28)
    .background(AGPTheme.field950)
  }
}

/// Approved card artwork, without the app icon's outer cream tile.
/// The transparent image works on both paper and field backgrounds.
struct AppBrandMark: View {
  static let assetName = "HomeBrandMark"

  var body: some View {
    Image(Self.assetName)
      .renderingMode(.original)
      .resizable()
      .scaledToFit()
      .accessibilityLabel("Any Given Pick")
  }
}

struct CallSheetActionStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(AGPTheme.label(18))
      .tracking(1)
      .textCase(.uppercase)
      .foregroundStyle(AGPTheme.field950)
      .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
      .padding(.horizontal, 18)
      .background(configuration.isPressed ? AGPTheme.maizeDeep : AGPTheme.maize)
      .clipShape(.rect(cornerRadius: 0))
      .scaleEffect(configuration.isPressed ? 0.99 : 1)
  }
}

struct CallSheetSecondaryActionStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(AGPTheme.label(17))
      .tracking(0.8)
      .textCase(.uppercase)
      .foregroundStyle(AGPTheme.paper100)
      .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
      .padding(.horizontal, 18)
      .background(configuration.isPressed ? AGPTheme.field800 : AGPTheme.field950)
      .overlay(Rectangle().stroke(AGPTheme.sage, lineWidth: 1))
  }
}
