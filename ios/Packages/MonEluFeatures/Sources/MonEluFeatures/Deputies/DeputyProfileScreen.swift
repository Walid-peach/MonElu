import MonEluCore
import MonEluUI
import SwiftUI

/// A deputy's page: who they are, how they vote and their latest scrutins
/// (web: `/deputes/[id]`).
public struct DeputyProfileScreen: View {
    let id: String
    @State private var loader: Loader<DeputyProfilePage>
    @Environment(\.appConfiguration) private var configuration

    public init(id: String, service: any DeputiesService) {
        self.id = id
        _loader = State(initialValue: Loader { try await service.profilePage(id: id) })
    }

    public var body: some View {
        LoadStateView(
            loader,
            empty: EmptyStateView(title: "Député introuvable", message: "Ce député n'existe pas ou plus.")
        ) { page in
            ScrollView {
                DeputyProfileContent(page: page, configuration: configuration)
                    .padding(16)
            }
        }
        .navigationTitle("Député")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                NavigationLink(value: AppRoute.compare(deputyID: id)) {
                    Label("Comparer", systemImage: "arrow.left.arrow.right")
                }
                .accessibilityIdentifier("deputy.compare")
            }
        }
    }
}

/// The profile's content, separate from loading so it can be snapshot-tested.
/// A section whose request failed is left out, as on the website.
struct DeputyProfileContent: View {
    let page: DeputyProfilePage
    let configuration: AppConfiguration

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            DeputyHeader(profile: page.profile)
            if let scorecard = page.scorecard {
                DeputyScorecardSection(scorecard: scorecard, configuration: configuration)
            }
            if let votes = page.recentVotes {
                DeputyRecentVotesSection(votes: votes)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("deputy.profile")
    }
}
