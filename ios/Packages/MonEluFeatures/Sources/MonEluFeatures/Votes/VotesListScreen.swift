import MonEluCore
import MonEluUI
import SwiftUI

/// The Votes tab: every scrutin, newest first, with search and a result
/// filter (web: `/votes`).
public struct VotesListScreen: View {
    @State private var model: VotesListModel

    public init(service: any VotesService) {
        _model = State(initialValue: VotesListModel(service: service))
    }

    public var body: some View {
        LoadStateView(
            model.loader,
            empty: EmptyStateView(
                title: "Aucun scrutin",
                message: "Aucun vote ne correspond à cette recherche.",
                systemImage: "magnifyingglass"
            )
        ) { votes in
            VotesList(votes: votes, isLoadingMore: model.isLoadingMore, loadMoreFailure: model.loadMoreFailure) {
                await model.loadMore()
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            Picker("Résultat", selection: $model.filter) {
                ForEach(VotesListModel.ResultFilter.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Palette.pageBackground)
        }
        .searchable(text: $model.searchText, prompt: "Rechercher un scrutin")
        .autocorrectionDisabled()
        // Reload when the search or filter changes, after a pause so typing
        // does not send one request per letter.
        .task(id: model.criteria) {
            guard model.needsReload else { return }
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            await model.reload()
        }
        .navigationTitle("Votes")
        .accessibilityIdentifier("screen.votes")
    }
}

/// The loaded list. Separate from the screen so it can be snapshot-tested
/// without a network.
struct VotesList: View {
    let votes: [VoteItem]
    let isLoadingMore: Bool
    var loadMoreFailure: LoadFailure?
    let loadMore: () async -> Void

    var body: some View {
        List {
            ForEach(votes) { vote in
                NavigationLink(value: AppRoute.vote(id: vote.id)) {
                    VoteRowView(vote: vote)
                }
                .listRowBackground(Palette.cardBackground)
                .accessibilityIdentifier("vote.row")
                .task {
                    // Not after a failure: the footer's retry decides, so a
                    // dead connection is not retried on every scroll.
                    if vote.id == votes.last?.id, loadMoreFailure == nil { await loadMore() }
                }
            }
            if let loadMoreFailure {
                VStack(alignment: .leading, spacing: 8) {
                    Text(
                        loadMoreFailure == .offline
                            ? "Hors connexion : la suite n'a pas pu être chargée."
                            : "La suite n'a pas pu être chargée."
                    )
                    .font(.footnote)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    Button("Charger la suite") { Task { await loadMore() } }
                        .buttonStyle(.bordered)
                        .tint(Palette.accent)
                }
                .listRowBackground(Palette.pageBackground)
                .accessibilityIdentifier("votes.load-more-failed")
            }
            if isLoadingMore {
                ProgressView()
                    .tint(Palette.accent)
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Palette.pageBackground)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Palette.pageBackground)
        .accessibilityIdentifier("votes.list")
    }
}
