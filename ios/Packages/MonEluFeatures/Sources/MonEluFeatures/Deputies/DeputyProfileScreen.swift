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
    @Environment(\.appConfiguration) private var configuration

    public init(id: String, service: any DeputiesService, followedDeputy: (any FollowedDeputyStore)? = nil) {
        self.id = id
        self.followedDeputy = followedDeputy
        _loader = State(initialValue: Loader { try await service.profilePage(id: id) })
    }

    /// Read from the store on every render, never copied: the deputy can be
    /// unfollowed on Accueil while this page stays on another tab's stack (#576).
    private var isFollowed: Bool {
        followedDeputy?.isFollowing(id) ?? false
    }

    /// « Suivre » adds this deputy to those followed (#584); at the cap it is
    /// replaced by a note saying why.
    private var atCap: Bool {
        guard let followedDeputy else { return false }
        return !isFollowed && !followedDeputy.canFollowMore
    }

    public var body: some View {
        LoadStateView(
            loader,
            empty: EmptyStateView(title: "Député introuvable", message: "Ce député n'existe pas ou plus.")
        ) { page in
            ScrollView {
                DeputyProfileContent(
                    page: page, configuration: configuration, isFollowed: isFollowed, atFollowCap: atCap,
                    onFollow: followedDeputy.map { store in
                        { store.follow(id) }
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
    /// The device already follows the most deputies it can.
    var atFollowCap = false
    /// Follows this deputy on the device; nil hides the button.
    var onFollow: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            DeputyHeader(profile: page.profile)
            DeputyActions(
                deputyID: page.profile.deputy.id, isFollowed: isFollowed, atFollowCap: atFollowCap, onFollow: onFollow
            )
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
    var atFollowCap = false
    let onFollow: (() -> Void)?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            buttons
            if atFollowCap && onFollow != nil {
                Text("Vous suivez déjà \(FollowedDeputies.cap) députés : retirez-en un sur l'Accueil pour suivre celui-ci.")
                    .font(.footnote)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var buttons: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: 10))
            : AnyLayout(HStackLayout(spacing: 10))
        return layout {
            if let onFollow {
                Button(action: onFollow) {
                    Label(isFollowed ? "Suivi" : "Suivre", systemImage: isFollowed ? "checkmark" : "plus")
                        .font(.headline)
                        .foregroundStyle(isFollowed ? Palette.textPrimary : Palette.onAccent)
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
                .disabled(isFollowed || atFollowCap)
                .accessibilityHint(isFollowed || atFollowCap ? "" : "Ajoute ce député à ceux suivis sur l'Accueil")
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
