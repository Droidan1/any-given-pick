import ClerkKit
import ClerkKitUI
import SwiftUI

struct AppRootView: View {
  @Environment(Clerk.self) private var clerk
  @Environment(AppModel.self) private var appModel

  var body: some View {
    Group {
      if clerk.user == nil {
        NativeAuthenticationView()
      } else if appModel.bootstrap != nil {
        AppShellView()
      } else {
        accountLoadingView
      }
    }
    .task(id: clerk.user?.id) {
      guard clerk.user != nil else {
        appModel.clearAuthenticatedAccount()
        return
      }
      await loadAccount()
    }
  }

  private var accountLoadingView: some View {
    ZStack {
      CallSheetBackground()
      VStack(spacing: 20) {
        RouteMark()
          .frame(width: 64, height: 64)
        if let error = appModel.accountError {
          Text("ACCOUNT CONNECTION")
            .font(AGPTheme.display(30))
            .foregroundStyle(AGPTheme.ink)
          Text(error)
            .multilineTextAlignment(.center)
            .foregroundStyle(AGPTheme.inkSoft)
          Button("Try again") {
            Task { await loadAccount() }
          }
          .buttonStyle(CallSheetActionStyle())
        } else {
          ProgressView()
            .tint(AGPTheme.field950)
          Text("Loading your call sheet…")
            .font(AGPTheme.label())
            .foregroundStyle(AGPTheme.ink)
        }
      }
      .padding(28)
    }
  }

  private func loadAccount() async {
    do {
      guard let token = try await clerk.auth.getToken() else { return }
      await appModel.loadAuthenticatedAccount(token: token)
    } catch {
      appModel.showAccountError("Your sign-in session could not be verified. Please try again.")
    }
  }
}

private struct NativeAuthenticationView: View {
  var body: some View {
    VStack(spacing: 0) {
      VStack(alignment: .leading, spacing: 10) {
        HStack(spacing: 12) {
          RouteMark()
            .frame(width: 46, height: 46)
          VStack(alignment: .leading, spacing: 0) {
            Text("ANY GIVEN")
              .font(AGPTheme.label(13))
              .foregroundStyle(AGPTheme.sage)
              .tracking(1.4)
            Text("PICK")
              .font(AGPTheme.display(26))
              .foregroundStyle(AGPTheme.maize)
          }
        }
        Text("WELCOME TO THE HUDDLE")
          .font(AGPTheme.display(32))
          .foregroundStyle(AGPTheme.paper100)
        Text("Sign in with the same email you use on anygivenpick.app. New accounts still require commissioner approval.")
          .font(.subheadline)
          .foregroundStyle(AGPTheme.paper200)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(24)
      .background(AGPTheme.field950)

      AuthView(mode: .signInOrUp, isDismissible: false)
        .background(AGPTheme.paper100)
    }
    .background(AGPTheme.paper100)
  }
}
