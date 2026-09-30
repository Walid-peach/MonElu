import MonEluCore
import SwiftUI

/// The shared frame of every non-content state: an icon, a title, a line of
/// explanation and, when there is something to do, one action.
struct StateMessage<Action: View>: View {
    let systemImage: String
    let title: String
    let message: String
    @ViewBuilder let action: () -> Action

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.largeTitle)
                .foregroundStyle(Palette.textMuted)
                .accessibilityHidden(true)
            Text(title)
                .font(Typography.heading(.title3))
                .foregroundStyle(Palette.textPrimary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Palette.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            action()
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .contain)
    }
}

/// Shown while a screen's first load runs.
public struct LoadingStateView: View {
    public init() {}

    public var body: some View {
        VStack(spacing: 12) {
            ProgressView()
                .tint(Palette.accent)
            Text("Chargement…")
                .font(.subheadline)
                .foregroundStyle(Palette.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("state.loading")
    }
}

/// Shown when a load succeeded with nothing to show.
public struct EmptyStateView: View {
    let title: String
    let message: String
    let systemImage: String

    public init(title: String, message: String, systemImage: String = "tray") {
        self.title = title
        self.message = message
        self.systemImage = systemImage
    }

    public var body: some View {
        StateMessage(systemImage: systemImage, title: title, message: message) { EmptyView() }
            .accessibilityIdentifier("state.empty")
    }
}

/// Shown when a load failed, worded for why, with a retry.
public struct FailureStateView: View {
    let failure: LoadFailure
    let retry: () async -> Void

    public init(failure: LoadFailure, retry: @escaping () async -> Void) {
        self.failure = failure
        self.retry = retry
    }

    public var body: some View {
        StateMessage(systemImage: copy.systemImage, title: copy.title, message: copy.message) {
            Button("Réessayer") { Task { await retry() } }
                .buttonStyle(.bordered)
                .tint(Palette.accent)
                .padding(.top, 4)
        }
        .accessibilityIdentifier(failure == .offline ? "state.offline" : "state.error")
    }

    struct Copy: Equatable {
        let systemImage: String
        let title: String
        let message: String
    }

    var copy: Copy { Self.copy(for: failure) }

    static func copy(for failure: LoadFailure) -> Copy {
        switch failure {
        case .offline:
            Copy(
                systemImage: "wifi.slash",
                title: "Pas de connexion",
                message: "Vérifiez votre connexion à internet, puis réessayez."
            )
        case .server:
            Copy(
                systemImage: "exclamationmark.triangle",
                title: "Chargement impossible",
                message: "MonÉlu n'a pas pu récupérer ces données. Réessayez dans un instant."
            )
        }
    }
}

/// A one-line notice above content that is still shown after a failed
/// refresh, so the reader knows it may be out of date.
public struct RefreshFailureBanner: View {
    let failure: LoadFailure

    public init(failure: LoadFailure) {
        self.failure = failure
    }

    public var body: some View {
        Label(
            failure == .offline
                ? "Hors connexion : ces données peuvent dater."
                : "Mise à jour impossible : ces données peuvent dater.",
            systemImage: failure == .offline ? "wifi.slash" : "exclamationmark.triangle"
        )
        .font(.footnote.weight(.medium))
        .foregroundStyle(Palette.textSecondary)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.trackBackground)
        .accessibilityIdentifier("state.refresh-failed")
    }
}
