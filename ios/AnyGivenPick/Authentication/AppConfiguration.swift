import Foundation

enum AppConfiguration {
  static let clerkPublishableKey = requiredString(named: "ClerkPublishableKey")
  static let clerkProxyURL = requiredString(named: "ClerkProxyURL")

  private static func requiredString(named key: String) -> String {
    guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String,
          !value.isEmpty else {
      preconditionFailure("Missing \(key) in the application configuration.")
    }
    return value
  }
}
