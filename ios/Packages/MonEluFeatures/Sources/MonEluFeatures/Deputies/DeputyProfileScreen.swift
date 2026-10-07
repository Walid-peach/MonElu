import MonEluCore
import MonEluUI
import SwiftUI

/// A deputy's page (web: `/deputes/[id]`; design A, Député): who they are,
/// follow and compare, how they vote, how often with their group, and their
/// latest scrutins.
public struct DeputyProfileScreen: View {
    let id: String
    /// The device's followed deputy (ADR-040 §6); nil hides "Suivre".
    let followedDeputy: (any FollowedDeputyStore)?
    @State private var loader: Loader<DeputyProfilePage>
    @State private var isFollowed: Bool
    @Environment(\.appConfiguration) private var configuration

    public init(id: String, service: any DeputiesService, followedDeputy: (any FollowedDeputyStore)? = nil) {
        self.id = id
        self.followedDeputy = followedDeputy
        _loader = State(initialValue: Loader { try await service.profilePage(id: id) })
        _isFollowed = State(initialValue: followedDeputy?.deputyID == id)
    }

    public var body: some View {
        LoadStateView(
            loader,
            empty: EmptyStateView(title: "Député introuvable", message: "Ce député n'existe pas ou plus.")
        ) { page in
            ScrollView {
                DeputyProfileContent(
                    page: page, configuration: configuration, isFollowed: isFollowed,
                    onFollow: followedDeputy.map { store in
                        {
                            store.follow(id)
                            isFollowed = true
                        }
                    }
                )
                .padding(16)
            }
        }
        .navigationTitle("Député")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The profile's content, separate from loading so it can be snapshot-tested.
/// A section whose request failed is left out, as on the website.
struct DeputyProfileContent: View {
    let page: DeputyProfilePage
    let configuration: AppConfiguration
    var isFollowed = false
    /// Follows this deputy on the device; nil hides the button.
    var onFollow: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            DeputyHeader(profile: page.profile)
            DeputyActions(deputyID: page.profile.deputy.id, isFollowed: isFollowed, onFollow: onFollow)
            if let scorecard = page.scorecard {
                DeputyScorecardSection(scorecard: scorecard, configuration: configuration)
            }
            if let alignment = page.alignment {
                DeputyAlignmentSection(deputyID: page.profile.deputy.id, alignment: alignment, configuration: configuration)
            }
            if let votes = page.recentVotes {
                DeputyRecentVotesSection(votes: votes)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("deputy.profile")
    }
}

/// Suivre and Comparer, side by side.
struct DeputyActions: View {
    let deputyID: String
    let isFollowed: Bool
    let onFollow: (() -> Void)?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: 10))
            : AnyLayout(HStackLayout(spacing: 10))
        layout {
            if let onFollow {
                Button(action: onFollow) {
                    Label(isFollowed ? "Suivi" : "Suivre", systemImage: isFollowed ? "checkmark" : "plus")
                        .font(.headline)
                        .foregroundStyle(isFollowed ? Palette.textPrimary : Palette.onIdentity)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(
                            isFollowed ? Palette.cardBackground : Palette.accent,
                            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .strokeBorder(isFollowed ? Palette.border : Palette.accent, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
                .disabled(isFollowed)
                .accessibilityHint(isFollowed ? "" : "Suit ce député sur l'Accueil")
                .accessibilityIdentifier("deputy.follow")
            }
            NavigationLink(value: AppRoute.compare(deputyID: deputyID)) {
                Label("Comparer", systemImage: "arrow.left.arrow.right")
                    .font(.headline)
                    .foregroundStyle(Palette.textPrimary)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("deputy.compare")
        }
    }
}
