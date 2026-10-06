import MonEluCore
import MonEluUI
import SwiftUI

/// The Accueil tab (#477): the followed deputy through their latest
/// decisions, or, before one is chosen, the postal-code search beside the
/// Assembly's latest votes, so a first visit already shows something.
public struct HomeScreen: View {
    @State private var model: MonDeputeModel
    @State private var latestVotes: Loader<[VoteItem]>
    @Environment(\.appConfiguration) private var configuration

    public init(
        deputies: any DeputiesService, votes: any VotesService, postalCodes: any PostalCodeService,
        store: any FollowedDeputyStore
    ) {
        _model = State(initialValue: MonDeputeModel(deputies: deputies, postalCodes: postalCodes, store: store))
        _latestVotes = State(initialValue: Loader(isEmpty: { $0.isEmpty }) {
            Array(try await votes.votes(VoteQuery()).items.prefix(HomeLatestVotesSection.count))
        })
    }

    public var body: some View {
        Group {
            if model.showsPicker {
                picker
            } else if let home = model.home {
                LoadStateView(
                    home,
                    empty: EmptyStateView(title: "Député introuvable", message: "Ce député n'existe pas ou plus.")
                ) { home in
                    ScrollView {
                        HomeDeputyContent(home: home, offersQuestions: configuration.features.chat)
                            .padding(16)
                    }
                }
                // A new deputy is a new loader; a new identity starts its load.
                .id(model.followedID)
            }
        }
        .background(Palette.pageBackground)
        .navigationTitle("Accueil")
        .toolbar { toolbar }
        .accessibilityIdentifier("screen.home")
    }

    /// While the user changes deputy, only the search shows; before any
    /// deputy is chosen, the Assembly's latest votes and the quiz follow it.
    private var picker: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                if !model.isChanging { HomeTagline() }
                PostalCodePickerContent(
                    postalCode: $model.postalCode,
                    search: model.search,
                    notice: model.notice,
                    onSearch: { Task { await model.runSearch() } },
                    onChoose: { model.choose($0) }
                )
                if !model.isChanging {
                    HomeLatestVotesSection(state: latestVotes.state) {
                        Task { await latestVotes.load() }
                    }
                    .task { await latestVotes.loadIfNeeded() }
                    HomeQuizInvitation()
                }
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        if !model.isChanging {
            ToolbarItem(placement: .topBarLeading) {
                AgendaToolbarLink()
            }
        }
        if model.isChanging {
            ToolbarItem(placement: .cancellationAction) {
                Button("Annuler") { model.cancelChange() }
            }
        } else if model.followedID != nil {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("Changer de député", systemImage: "arrow.left.arrow.right") { model.startChange() }
                    Button("Ne plus suivre", systemImage: "person.badge.minus", role: .destructive) { model.unfollow() }
                } label: {
                    Label("Options", systemImage: "ellipsis.circle")
                }
                .accessibilityIdentifier("monDepute.options")
            }
        }
    }
}
